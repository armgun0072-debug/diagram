import { TABLE_WIDTH, tableHeight } from './layout';
import { relationId, type Positions, type Relation, type Schema } from './schema';
import { connectionSides } from './routing';

export type Point = { x: number; y: number };
export type Route = { points: Point[]; sourceHandle: string; targetHandle: string; blocked: boolean };
export type TableRect = Point & { id: string; width: number; height: number };
type Box = { id: string; left: number; right: number; top: number; bottom: number };
type Side = 'left' | 'right';
const CLEARANCE = 16;
const TURN_COST = 36;
const round = (value: number) => Math.round(value * 1000) / 1000;
const distance = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

export function segmentIntersectsBox(a: Point, b: Point, box: { x: number; y: number; width: number; height: number }): boolean {
  const epsilon = 0.001;
  if (Math.abs(a.y - b.y) < epsilon) return a.y > box.y + epsilon && a.y < box.y + box.height - epsilon && Math.max(a.x, b.x) > box.x + epsilon && Math.min(a.x, b.x) < box.x + box.width - epsilon;
  if (Math.abs(a.x - b.x) < epsilon) return a.x > box.x + epsilon && a.x < box.x + box.width - epsilon && Math.max(a.y, b.y) > box.y + epsilon && Math.min(a.y, b.y) < box.y + box.height - epsilon;
  throw new Error('Only orthogonal segments are supported');
}

function crosses(a: Point, b: Point, box: Box) {
  return segmentIntersectsBox(a, b, { x: box.left, y: box.top, width: box.right - box.left, height: box.bottom - box.top });
}

class MinHeap {
  private items: { state: number; score: number; cost: number }[] = [];
  get size() { return this.items.length; }
  push(item: { state: number; score: number; cost: number }) {
    let index = this.items.length;
    this.items.push(item);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.items[parent].score <= item.score) break;
      this.items[index] = this.items[parent]; index = parent;
    }
    this.items[index] = item;
  }
  pop() {
    const first = this.items[0], last = this.items.pop()!;
    if (this.items.length) {
      let index = 0;
      while (index * 2 + 1 < this.items.length) {
        let child = index * 2 + 1;
        if (child + 1 < this.items.length && this.items[child + 1].score < this.items[child].score) child++;
        if (last.score <= this.items[child].score) break;
        this.items[index] = this.items[child]; index = child;
      }
      this.items[index] = last;
    }
    return first;
  }
}

function coordinates(values: number[], borders: Set<number>) {
  const sorted = [...new Set(values.map(round))].sort((a, b) => a - b);
  const penalty = new Map<number, number>();
  for (const v of sorted) penalty.set(v, borders.has(v) ? 0.25 : 0);
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i] - sorted[i - 1];
    if (gap < 20) continue;
    // Always use an odd number of interior lanes so the exact corridor midpoint is included.
    const raw = Math.min(7, Math.max(1, Math.floor(gap / 20)));
    const count = raw % 2 === 1 ? raw : raw - 1;
    const mid = (count + 1) / 2;
    for (let n = 1; n <= count; n++) {
      const coord = round(sorted[i - 1] + gap * n / (count + 1));
      if (!penalty.has(coord)) penalty.set(coord, Math.abs(n - mid) * 0.025);
    }
  }
  const coords = [...penalty.keys()].sort((a, b) => a - b);
  return { coords, penalty: new Float64Array(coords.map(c => penalty.get(c) ?? 0)) };
}

class RoutingGrid {
  private xs: number[];
  private ys: number[];
  private xIndex: Map<number, number>;
  private yIndex: Map<number, number>;
  private xPenalty: Float64Array;
  private yPenalty: Float64Array;
  private width: number;
  private count: number;
  private horizontal: Float64Array;
  private vertical: Float64Array;
  private hUse: Uint16Array;
  private vUse: Uint16Array;
  private hGroup: Int32Array;
  private vGroup: Int32Array;
  private hNodes: Uint16Array;
  private vNodes: Uint16Array;
  private nodeGroup: Int32Array;

  constructor(boxes: Box[], terminalYs: number[]) {
    const minX = round(Math.min(...boxes.map(b => b.left)) - 72), maxX = round(Math.max(...boxes.map(b => b.right)) + 72);
    const minY = round(Math.min(...boxes.map(b => b.top)) - 72), maxY = round(Math.max(...boxes.map(b => b.bottom)) + 72);
    const boxXs = new Set([minX, maxX, ...boxes.flatMap(b => [round(b.left), round(b.right)])]);
    const boxYs = new Set([minY, maxY, ...boxes.flatMap(b => [round(b.top), round(b.bottom)])]);
    const xGrid = coordinates([...boxXs], boxXs);
    const yGrid = coordinates([...boxYs, ...terminalYs], boxYs);
    this.xs = xGrid.coords; this.xPenalty = xGrid.penalty;
    this.ys = yGrid.coords; this.yPenalty = yGrid.penalty;
    this.xIndex = new Map(this.xs.map((x, i) => [x, i]));
    this.yIndex = new Map(this.ys.map((y, i) => [y, i]));
    this.width = this.xs.length; this.count = this.width * this.ys.length;
    this.horizontal = new Float64Array(this.count); this.vertical = new Float64Array(this.count);
    this.hUse = new Uint16Array(this.count); this.vUse = new Uint16Array(this.count);
    this.hGroup = new Int32Array(this.count); this.vGroup = new Int32Array(this.count);
    this.hNodes = new Uint16Array(this.count); this.vNodes = new Uint16Array(this.count);
    this.nodeGroup = new Int32Array(this.count);
    for (let y = 0; y < this.ys.length; y++) for (let x = 0; x < this.width; x++) {
      const node = y * this.width + x, p = { x: this.xs[x], y: this.ys[y] };
      if (x + 1 < this.width) {
        const q = { x: this.xs[x + 1], y: p.y };
        if (!boxes.some(box => crosses(p, q, box))) this.horizontal[node] = q.x - p.x;
      }
      if (y + 1 < this.ys.length) {
        const q = { x: p.x, y: this.ys[y + 1] };
        if (!boxes.some(box => crosses(p, q, box))) this.vertical[node] = q.y - p.y;
      }
    }
  }

  private point(node: number): Point { return { x: this.xs[node % this.width], y: this.ys[Math.floor(node / this.width)] }; }
  private node(point: Point) { return this.yIndex.get(round(point.y))! * this.width + this.xIndex.get(round(point.x))!; }

  find(start: Point, end: Point, groupId: number): { path: number[]; cost: number } | null {
    const from = this.node(start), to = this.node(end);
    if (from === to) return { path: [from], cost: 0 };
    const cost = new Float64Array(this.count * 2).fill(Infinity), previous = new Int32Array(this.count * 2).fill(-1);
    const open = new MinHeap();
    cost[from * 2] = 0; open.push({ state: from * 2, cost: 0, score: distance(start, end) });
    while (open.size) {
      const current = open.pop();
      if (current.cost !== cost[current.state]) continue;
      const node = current.state >> 1, axis = current.state & 1;
      if (node === to && axis === 0) {
        const path: number[] = [];
        for (let state = current.state; state !== -1; state = previous[state]) path.push(state >> 1);
        return { path: path.reverse(), cost: current.cost };
      }
      const x = node % this.width, y = Math.floor(node / this.width);
      const candidates = [
        ...(x > 0 ? [{ next: node - 1, link: node - 1, axis: 0 }] : []),
        ...(x + 1 < this.width ? [{ next: node + 1, link: node, axis: 0 }] : []),
        ...(y > 0 ? [{ next: node - this.width, link: node - this.width, axis: 1 }] : []),
        ...(y + 1 < this.ys.length ? [{ next: node + this.width, link: node, axis: 1 }] : []),
      ];
      for (const candidate of candidates) {
        const length = candidate.axis === 0 ? this.horizontal[candidate.link] : this.vertical[candidate.link];
        if (!length) continue;
        const p = this.point(candidate.next);
        const use = candidate.axis === 0 ? this.hUse[candidate.link] : this.vUse[candidate.link];
        const linkGroup = candidate.axis === 0 ? this.hGroup[candidate.link] : this.vGroup[candidate.link];
        const sameGroup = use > 0 && linkGroup === groupId;
        const otherUse = sameGroup ? 0 : use;

        // Prefer turning in the middle of corridors rather than hugging table borders (box.left/right/top/bottom).
        const laneWeight = candidate.axis === 1 ? this.xPenalty[x] : (y !== Math.floor(from / this.width) && y !== Math.floor(to / this.width) ? this.yPenalty[y] : 0);
        const borderPenalty = !sameGroup && laneWeight > 0 ? length * laneWeight + (laneWeight >= 0.2 ? 12 : 0) : 0;

        // Encourage relationships pointing to the exact same target column to merge onto a single clean bus trunk,
        // while keeping unrelated relationships in separate parallel lanes.
        const stepLength = sameGroup ? length * 0.68 : length;
        const overlapPenalty = otherUse * (length * 4 + 140);
        const crossingCount = candidate.next === to ? 0 : candidate.axis === 0 ? this.vNodes[candidate.next] : this.hNodes[candidate.next];
        const crossingPenalty = crossingCount > 0 && this.nodeGroup[candidate.next] === groupId ? 0 : crossingCount * 95;
        const turnCost = (axis !== candidate.axis ? TURN_COST : 0) + (candidate.next === to && candidate.axis !== 0 ? TURN_COST : 0);

        const nextCost = current.cost + stepLength + borderPenalty + turnCost + overlapPenalty + crossingPenalty;
        const targetAxis = candidate.next === to ? 0 : candidate.axis;
        const state = candidate.next * 2 + targetAxis;
        if (nextCost >= cost[state]) continue;
        cost[state] = nextCost; previous[state] = current.state;
        open.push({ state, cost: nextCost, score: nextCost + distance(p, end) * 0.65 });
      }
    }
    return null;
  }

  reserve(path: number[], groupId: number): Point[] {
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], link = Math.min(a, b);
      if (Math.abs(a - b) === 1) {
        this.hUse[link]++;
        this.hGroup[link] = this.hGroup[link] === 0 || this.hGroup[link] === groupId ? groupId : -1;
        this.hNodes[a]++; this.hNodes[b]++;
      } else {
        this.vUse[link]++;
        this.vGroup[link] = this.vGroup[link] === 0 || this.vGroup[link] === groupId ? groupId : -1;
        this.vNodes[a]++; this.vNodes[b]++;
      }
      this.nodeGroup[a] = this.nodeGroup[a] === 0 || this.nodeGroup[a] === groupId ? groupId : -1;
      this.nodeGroup[b] = this.nodeGroup[b] === 0 || this.nodeGroup[b] === groupId ? groupId : -1;
    }
    return path.map(node => this.point(node));
  }
}

export function simplifyPoints(points: Point[]): Point[] {
  const unique = points.filter((p, i) => i === 0 || distance(p, points[i - 1]) > 0.001);
  return unique.filter((p, i) => {
    if (i === 0 || i === unique.length - 1) return true;
    const a = unique[i - 1], b = unique[i + 1];
    // Preserve reversals: removing an out-and-back turn would cut a corner.
    return !((a.x === p.x && p.x === b.x && (p.y - a.y) * (b.y - p.y) >= 0) || (a.y === p.y && p.y === b.y && (p.x - a.x) * (b.x - p.x) >= 0));
  });
}

export function routeRelations(schema: Schema, positions: Positions, measurements: ReadonlyMap<string, { width: number; height: number }> = new Map()): Map<string, Route> {
  if (!schema.tables.length || !schema.relations.length) return new Map();
  const rects = new Map(schema.tables.map(table => [table.name, {
    id: table.name, x: round(positions[table.name].x), y: round(positions[table.name].y),
    width: measurements.get(table.name)?.width ?? TABLE_WIDTH,
    height: measurements.get(table.name)?.height ?? tableHeight(table.columns.length) + 1,
  }]));
  const boxes = [...rects.values()].map(r => ({ id: r.id, left: round(r.x - CLEARANCE), right: round(r.x + r.width + CLEARANCE), top: round(r.y - CLEARANCE), bottom: round(r.y + r.height + CLEARANCE) }));
  const boxOf = new Map(boxes.map(box => [box.id, box]));
  const columnY = (table: string, column: string) => round(rects.get(table)!.y + 69 + schema.tables.find(t => t.name === table)!.columns.findIndex(c => c.name === column) * 34);
  const grid = new RoutingGrid(boxes, schema.relations.flatMap(r => [columnY(r.fromTable, r.fromColumn), columnY(r.toTable, r.toColumn)]));
  const result = new Map<string, Route>();
  const port = (name: string, column: string, side: Side) => ({ x: round(rects.get(name)!.x + (side === 'left' ? -2.5 : rects.get(name)!.width + 2.5)), y: columnY(name, column) });
  function candidate(r: Relation, source: Side, target: Side, penalty: number) {
    const from = port(r.fromTable, r.fromColumn, source), to = port(r.toTable, r.toColumn, target);
    const start = { x: source === 'left' ? boxOf.get(r.fromTable)!.left : boxOf.get(r.fromTable)!.right, y: from.y };
    const end = { x: target === 'left' ? boxOf.get(r.toTable)!.left : boxOf.get(r.toTable)!.right, y: to.y };
    const valid = !boxes.some(box => (box.id !== r.fromTable && crosses(from, start, box)) || (box.id !== r.toTable && crosses(end, to, box)));
    return { from, to, start, end, valid, penalty, targetSide: target, sourceHandle: `${source === 'left' ? 'out-left:' : 'out:'}${r.fromColumn}`, targetHandle: `${target === 'right' ? 'in-right:' : 'in:'}${r.toColumn}` };
  }

  const groupIds = new Map<string, number>();
  const getGroupId = (r: Relation, side: Side) => {
    const key = `${r.toTable}.${r.toColumn}:${side}`;
    let id = groupIds.get(key);
    if (!id) { id = groupIds.size + 1; groupIds.set(key, id); }
    return id;
  };

  // Short, direct relationships reserve lanes first so they establish clean central trunks.
  const ordered = [...schema.relations].sort((a, b) => distance(rects.get(a.fromTable)!, rects.get(a.toTable)!) - distance(rects.get(b.fromTable)!, rects.get(b.toTable)!));
  for (const relation of ordered) {
    const fromRect = rects.get(relation.fromTable)!, toRect = rects.get(relation.toTable)!;
    const preferred = connectionSides(fromRect, toRect);
    const stacked = fromRect.x + fromRect.width > toRect.x && toRect.x + toRect.width > fromRect.x;
    const pairSpecs: { pair: [Side, Side]; penalty: number }[] = stacked
      ? [{ pair: ['right', 'right'], penalty: 0 }, { pair: ['left', 'left'], penalty: 0 }, { pair: ['right', 'left'], penalty: 220 }, { pair: ['left', 'right'], penalty: 220 }]
      : [
          { pair: [preferred.source, preferred.target], penalty: 0 },
          { pair: [preferred.source, preferred.target === 'left' ? 'right' : 'left'], penalty: 380 },
          { pair: [preferred.source === 'left' ? 'right' : 'left', preferred.target], penalty: 380 },
          { pair: [preferred.source === 'left' ? 'right' : 'left', preferred.target === 'left' ? 'right' : 'left'], penalty: 760 },
        ];
    const candidates = pairSpecs.map(({ pair: [a, b], penalty }) => candidate(relation, a, b, penalty)).filter(c => c.valid);
    let best: { c: ReturnType<typeof candidate>; path: number[]; score: number; groupId: number } | null = null;
    for (const c of candidates) {
      if (best && c.penalty >= best.score) continue;
      const groupId = getGroupId(relation, c.targetSide);
      const found = grid.find(c.start, c.end, groupId);
      if (!found) continue;
      const score = found.cost + c.penalty;
      if (!best || score < best.score) best = { c, path: found.path, score, groupId };
    }
    if (best) {
      result.set(relationId(relation), {
        points: simplifyPoints([best.c.from, ...grid.reserve(best.path, best.groupId), best.c.to]),
        sourceHandle: best.c.sourceHandle,
        targetHandle: best.c.targetHandle,
        blocked: false,
      });
    } else {
      const c = candidate(relation, preferred.source, preferred.target, 0);
      result.set(relationId(relation), { points: [], sourceHandle: c.sourceHandle, targetHandle: c.targetHandle, blocked: true });
    }
  }
  return result;
}

export { roundedPath } from './edgePath';
