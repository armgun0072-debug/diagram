import type ELK from 'elkjs/lib/elk.bundled.js';
import type { Schema, Positions } from './schema';
import type { LayoutAlgorithm } from './layoutOptions';

let engine: InstanceType<typeof ELK> | undefined;
export const TABLE_WIDTH = 270;
export const tableHeight = (columnCount: number) => 52 + columnCount * 34;

export async function layoutSchema(schema: Schema, algorithm: LayoutAlgorithm = 'left-right'): Promise<Positions> {
  if (!schema.tables.length) return {};
  if (algorithm === 'pipeline') return pipelineLayout(schema);
  if (algorithm === 'flowchart') return pipelineLayout(schema, true);
  if (algorithm === 'snowflake') return snowflakeLayout(schema);
  if (algorithm === 'compact') return compactLayout(schema);
  // Load the larger layout engine only when the user requests a layout.
  if (!engine) {
    const { default: Elk } = await import('elkjs/lib/elk.bundled.js');
    engine = new Elk();
  }
  const result = await engine.layout({
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '100',
      'elk.layered.spacing.nodeNodeBetweenLayers': '200',
      'elk.edgeRouting': 'ORTHOGONAL',
    },
    children: schema.tables.map(t => ({ id: t.name, width: TABLE_WIDTH, height: tableHeight(t.columns.length) })),
    edges: schema.relations.map((r, i) => ({ id: `r${i}`, sources: [r.toTable], targets: [r.fromTable] })),
  });
  return Object.fromEntries((result.children ?? []).map(n => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]));
}

function compactLayout(schema: Schema): Positions {
  const gap = 100;
  const heights = schema.tables.map(table => tableHeight(table.columns.length));
  const totalHeight = heights.reduce((sum, height) => sum + height + gap, 0);
  const columns = Math.min(schema.tables.length, Math.max(1, Math.round(Math.sqrt(totalHeight * 1.4 / (TABLE_WIDTH + gap)))));
  const bottoms = Array<number>(columns).fill(30);
  const entries: [string, { x: number; y: number }][] = [];
  // Tallest-first placement into the shortest column keeps the rectangle balanced.
  for (const table of [...schema.tables].sort((a, b) => b.columns.length - a.columns.length)) {
    const column = bottoms.indexOf(Math.min(...bottoms));
    entries.push([table.name, { x: 30 + column * (TABLE_WIDTH + gap), y: bottoms[column] }]);
    bottoms[column] += tableHeight(table.columns.length) + gap;
  }
  return Object.fromEntries(entries);
}

function pipelineLayout(schema: Schema, flowchart = false): Positions {
  const neighbors = new Map(schema.tables.map(table => [table.name, new Set<string>()]));
  for (const relation of schema.relations) neighbors.get(relation.toTable)!.add(relation.fromTable);

  // Collapse strongly connected tables into one stage so cycles cannot create
  // endless dependency chains. Then rank the resulting acyclic graph.
  let nextIndex = 0;
  const indices = new Map<string, number>(), low = new Map<string, number>();
  const stack: string[] = [], onStack = new Set<string>(), components: string[][] = [];
  function visit(name: string) {
    indices.set(name, nextIndex); low.set(name, nextIndex++);
    stack.push(name); onStack.add(name);
    for (const neighbor of neighbors.get(name)!) {
      if (!indices.has(neighbor)) { visit(neighbor); low.set(name, Math.min(low.get(name)!, low.get(neighbor)!)); }
      else if (onStack.has(neighbor)) low.set(name, Math.min(low.get(name)!, indices.get(neighbor)!));
    }
    if (low.get(name) === indices.get(name)) {
      const component: string[] = [];
      let member: string;
      do { member = stack.pop()!; onStack.delete(member); component.push(member); } while (member !== name);
      components.push(component);
    }
  }
  for (const table of schema.tables) if (!indices.has(table.name)) visit(table.name);
  const componentOf = new Map(components.flatMap((members, index) => members.map(name => [name, index] as const)));
  const edges = components.map(() => new Set<number>()), incoming = components.map(() => 0), rank = components.map(() => 0);
  for (const [name, adjacent] of neighbors) for (const neighbor of adjacent) {
    const from = componentOf.get(name)!, to = componentOf.get(neighbor)!;
    if (from !== to && !edges[from].has(to)) { edges[from].add(to); incoming[to]++; }
  }
  const queue = incoming.flatMap((count, index) => count === 0 ? [index] : []);
  for (let cursor = 0; cursor < queue.length; cursor++) for (const to of edges[queue[cursor]]) {
    rank[to] = Math.max(rank[to], rank[queue[cursor]] + 1);
    if (--incoming[to] === 0) queue.push(to);
  }
  const stages = new Map<number, Schema['tables']>();
  for (const table of schema.tables) {
    const stage = rank[componentOf.get(table.name)!];
    if (!stages.has(stage)) stages.set(stage, []);
    stages.get(stage)!.push(table);
  }
  const gap = 100;
  const heightOf = (tables: Schema['tables']) => tables.reduce((sum, table) => sum + tableHeight(table.columns.length), 0) + Math.max(0, tables.length - 1) * gap;
  const maxHeight = Math.max(...[...stages.values()].map(heightOf));
  const entries: [string, { x: number; y: number }][] = [];
  const placedCenters = new Map<string, number>();
  for (const [stage, tables] of [...stages].sort(([a], [b]) => a - b)) {
    // Keep branches near their already placed parents. Stable sorting preserves
    // schema order for unrelated tables and for cyclic groups in the same stage.
    const parentCenter = (name: string) => {
      const centers = schema.relations.filter(r => r.fromTable === name)
        .map(r => placedCenters.get(r.toTable)).filter((y): y is number => y !== undefined);
      return centers.length ? centers.reduce((sum, y) => sum + y, 0) / centers.length : Infinity;
    };
    if (flowchart) tables.sort((a, b) => {
      const aCenter = parentCenter(a.name), bCenter = parentCenter(b.name);
      return aCenter === bCenter ? 0 : aCenter < bCenter ? -1 : 1;
    });
    let y = 30 + (maxHeight - heightOf(tables)) / 2;
    for (const table of tables) {
      entries.push([table.name, { x: 30 + stage * (TABLE_WIDTH + 200), y }]);
      placedCenters.set(table.name, y + tableHeight(table.columns.length) / 2);
      y += tableHeight(table.columns.length) + gap;
    }
  }
  return Object.fromEntries(entries);
}

function snowflakeLayout(schema: Schema): Positions {
  const neighbors = new Map(schema.tables.map(table => [table.name, new Set<string>()]));
  for (const relation of schema.relations) if (relation.fromTable !== relation.toTable) {
    neighbors.get(relation.fromTable)!.add(relation.toTable);
    neighbors.get(relation.toTable)!.add(relation.fromTable);
  }
  const sorted = [...schema.tables].sort((a, b) => neighbors.get(b.name)!.size - neighbors.get(a.name)!.size);
  const hub = sorted[0];
  const depth = new Map([[hub.name, 0]]), queue = [hub.name];
  for (let cursor = 0; cursor < queue.length; cursor++) for (const name of neighbors.get(queue[cursor])!) if (!depth.has(name)) {
    depth.set(name, depth.get(queue[cursor])! + 1); queue.push(name);
  }
  const disconnectedDepth = Math.max(...depth.values()) + 1;
  const rings = new Map<number, Schema['tables']>();
  for (const table of sorted.slice(1)) {
    const ring = depth.get(table.name) ?? disconnectedDepth;
    if (!rings.has(ring)) rings.set(ring, []);
    rings.get(ring)!.push(table);
  }
  const radiusOf = (table: Schema['tables'][number]) => Math.hypot(TABLE_WIDTH, tableHeight(table.columns.length)) / 2;
  const entries: [string, { x: number; y: number }][] = [[hub.name, { x: -TABLE_WIDTH / 2, y: -tableHeight(hub.columns.length) / 2 }]];
  let previousRadius = 0, previousExtent = radiusOf(hub);
  for (const [, tables] of [...rings].sort(([a], [b]) => a - b)) {
    const extent = Math.max(...tables.map(radiusOf));
    const chordRadius = tables.length > 1 ? (2 * extent + 65) / (2 * Math.sin(Math.PI / tables.length)) : 0;
    const radius = Math.max(previousRadius + previousExtent + extent + 65, chordRadius);
    tables.forEach((table, index) => {
      const angle = -Math.PI / 2 + index * 2 * Math.PI / tables.length;
      entries.push([table.name, { x: Math.cos(angle) * radius - TABLE_WIDTH / 2, y: Math.sin(angle) * radius - tableHeight(table.columns.length) / 2 }]);
    });
    previousRadius = radius; previousExtent = extent;
  }
  const minX = Math.min(...entries.map(([, p]) => p.x)), minY = Math.min(...entries.map(([, p]) => p.y));
  return Object.fromEntries(entries.map(([name, p]) => [name, { x: p.x - minX + 30, y: p.y - minY + 30 }]));
}
