import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSchema, serializeSchema, relationLabel, relationCardinalities, SAMPLE } from './schema';
import { layoutSchema, TABLE_WIDTH, tableHeight } from './layout';
import { documentFromSource, projectFile, importProject } from './storage';
import { cleanTableColors, renameTableColor, tableColor } from './appearance';
import { connectionHandles } from './routing';
import { LAYOUT_OPTIONS } from './layoutOptions';
import { routeRelations, segmentIntersectsBox } from './obstacleRouting';

test('connection routing follows tables when their horizontal order reverses', () => {
  const left = { x: 0, width: 270 }, right = { x: 500, width: 270 };
  assert.deepEqual(connectionHandles(left, right, 'fk', 'id'), { sourceHandle: 'out:fk', targetHandle: 'in:id' });
  assert.deepEqual(connectionHandles(right, left, 'fk', 'id'), { sourceHandle: 'out-left:fk', targetHandle: 'in-right:id' });
  assert.deepEqual(connectionHandles(left, left, 'manager_id', 'id'), { sourceHandle: 'out:manager_id', targetHandle: 'in-right:id' });
  assert.deepEqual(connectionHandles(left, { x: 100, width: 270 }, 'fk', 'id'), { sourceHandle: 'out:fk', targetHandle: 'in-right:id' });
});

test('sample parses four tables, flags, decimal types and three relations', () => {
  const schema = parseSchema(SAMPLE);
  assert.equal(schema.tables.length, 4);
  assert.equal(schema.relations.length, 3);
  assert.equal(schema.tables[0].columns[0].pk, true);
  assert.equal(schema.tables[0].columns[2].unique, true);
  assert.equal(schema.tables[1].columns[3].type, 'decimal(10,2)');
});

test('serializer preserves schema through a code → model → code roundtrip', () => {
  const schema = parseSchema(SAMPLE);
  assert.deepEqual(parseSchema(serializeSchema(schema)), schema);
});

test('normalizes one-to-many and preserves one-to-one', () => {
  const source = 'Table a {\n id int [pk]\n}\nTable b {\n id int\n}\n';
  assert.deepEqual(parseSchema(source + 'Ref: a.id < b.id').relations[0], {
    fromTable: 'b', fromColumn: 'id', toTable: 'a', toColumn: 'id', kind: '>',
  });
  assert.equal(parseSchema(source + 'Ref: a.id - b.id').relations[0].kind, '-');
});

test('reports incomplete tables and unsupported syntax with useful errors', () => {
  assert.throws(() => parseSchema('Table users {\n id uuid'), /วงเล็บปิด/);
  assert.throws(() => parseSchema('Table users {\n id uuid [unsupported]\n}'), /บรรทัด 2/);
  assert.throws(() => parseSchema('Enum status {'), /วงเล็บปิด/);
  assert.throws(() => parseSchema('Table a {\n id int [ref: > b.id]\n}'), /ไม่พบคอลัมน์/);
});

const marketplaceSource = readFileSync(new URL('../examples/durian-marketplace.dbml', import.meta.url), 'utf8');

test('the exact user attachment parses all 15 tables, 27 relations, 12 enums and 5 indexes', () => {
  const schema = parseSchema(marketplaceSource);
  assert.equal(schema.tables.length, 15);
  assert.equal(schema.relations.length, 27);
  assert.equal(schema.enums?.length, 12);
  assert.equal(schema.tables.flatMap(t => t.indexes ?? []).length, 5);
  assert.ok(schema.tables.every(t => t.columns.find(c => c.name === 'id')?.increment));
  assert.deepEqual(schema.tables.find(t => t.name === 'daily_market_stats')?.indexes?.[0], {
    columns: ['stat_date', 'variety_id', 'grade_id', 'location_id'], unique: true, pk: false,
  });
  const optional = schema.relations.at(-1)!;
  assert.equal(optional.fromColumn, 'license_number');
  assert.equal(optional.toColumn, 'id');
  assert.equal(optional.fromOptional, true);
  assert.equal(optional.toOptional, true);
  assert.equal(relationLabel(optional), '0..N : 0..1');
});

test('visual serialization and project export retain attachment metadata and optional relationships', () => {
  const schema = parseSchema(marketplaceSource);
  schema.tables[0].columns.push({ name: 'nickname', type: 'varchar', pk: false, notNull: false, unique: false });
  const serialized = serializeSchema(schema);
  assert.deepEqual(parseSchema(serialized), schema);
  const imported = importProject(JSON.stringify(projectFile(documentFromSource(serialized))));
  assert.deepEqual(imported.schema, schema);
});

test('supports mixed-case forward inline refs and asymmetric optionality', () => {
  const prefix = 'Table Users {\n id int [pk, increment]\n}\nTable Posts {\n id int [pk]\n user_id int [not null, ref: >? "Users"."id"]\n}\n';
  const schema = parseSchema(prefix);
  assert.equal(schema.relations[0].toTable, 'Users');
  assert.equal(schema.relations[0].toOptional, true);
  assert.equal(schema.relations[0].fromOptional, undefined);
  assert.equal(relationLabel(schema.relations[0]), 'N : 0..1');
  const reversed = parseSchema('Table a {\n id int\n}\nTable b {\n id int\n}\nRef: a.id ?< b.id');
  assert.equal(reversed.relations[0].toOptional, true);
  assert.equal(reversed.relations[0].fromOptional, undefined);
});

test('supports many-to-many and preserves quoted enum values', () => {
  const schema = parseSchema('Table a {\n id int\n}\nTable b {\n id int\n}\nRef: a.id ?<>? b.id\nEnum Status {\n "Not Yet Set"\n ACTIVE\n}');
  assert.equal(relationLabel(schema.relations[0]), '0..N : 0..N');
  assert.deepEqual(parseSchema(serializeSchema(schema)), schema);
});

test('rejects broken indexes, duplicate enums, incomplete blocks and unsupported settings', () => {
  assert.throws(() => parseSchema('Table a {\n id int\n indexes {\n (missing, id) [unique]\n }\n}'), /ไม่พบคอลัมน์ใน index/);
  assert.throws(() => parseSchema('Table a {\n id int\n indexes {'), /indexes.*วงเล็บปิด/);
  assert.throws(() => parseSchema('Enum Status {\n ACTIVE\n ACTIVE\n}'), /ค่าซ้ำ/);
  assert.throws(() => parseSchema('Enum Status {\n ACTIVE\n}\nEnum Status {\n PENDING\n}'), /Enum ซ้ำ/);
  assert.throws(() => parseSchema('Table a {\n id int [default: 5]\n}'), /ยังไม่รองรับ setting/);
  assert.throws(() => parseSchema('Table a {\n id int [null, not null]\n}'), /ห้ามกำหนดทั้ง/);
});

test('ELK lays out the entire attachment without overlapping tall tables', async () => {
  const schema = parseSchema(marketplaceSource);
  const positions = await layoutSchema(schema);
  assert.equal(Object.keys(positions).length, 15);
  for (let i = 0; i < schema.tables.length; i++) for (let j = i + 1; j < schema.tables.length; j++) {
    const a = schema.tables[i], b = schema.tables[j];
    const p = positions[a.name], q = positions[b.name];
    assert.ok(p.x + TABLE_WIDTH <= q.x || q.x + TABLE_WIDTH <= p.x || p.y + tableHeight(a.columns.length) <= q.y || q.y + tableHeight(b.columns.length) <= p.y, `${a.name} overlaps ${b.name}`);
  }
});

test('rejects duplicate tables, duplicate columns and broken references', () => {
  assert.throws(() => parseSchema('Table a {\n id int\n}\nTable a {\n id int\n}'), /ตารางซ้ำ/);
  assert.throws(() => parseSchema('Table a {\n id int\n id uuid\n}'), /คอลัมน์ซ้ำ/);
  assert.throws(() => parseSchema(SAMPLE + 'Ref: orders.nope > customers.id'), /ไม่พบคอลัมน์/);
  assert.throws(() => parseSchema(SAMPLE + 'Ref: orders.customer_id > customers.id'), /ความสัมพันธ์ซ้ำ/);
});

test('supports comments, CRLF, UTF-8 BOM, empty schema and self-table references', () => {
  assert.deepEqual(parseSchema('// empty'), { tables: [], relations: [] });
  const schema = parseSchema('\uFEFFTable users {\r\n id int [pk] // comment\r\n manager_id int\r\n}\r\nRef: users.manager_id > users.id');
  assert.equal(schema.relations.length, 1);
  assert.throws(() => parseSchema('Table users {\n id int\n}\nRef: users.id > users.id'), /ตัวเอง/);
});

test('project files roundtrip source and positions, including invalid code drafts', () => {
  const doc = documentFromSource(SAMPLE, { customers: { x: 111, y: 222 } });
  const restored = importProject(JSON.stringify(projectFile(doc)));
  assert.deepEqual(restored, doc);
  const draft = { ...doc, source: 'Table invalid {', error: 'temporary' };
  const recovered = importProject(JSON.stringify(projectFile(draft)));
  assert.equal(recovered.source, draft.source);
  assert.deepEqual(recovered.schema, doc.schema);
  assert.ok(recovered.error);
});

test('table colors roundtrip without changing schema or losing invalid drafts', () => {
  const doc = documentFromSource(SAMPLE, { customers: { x: 10, y: 20 } }, { customers: '#f28b82' });
  assert.deepEqual(importProject(JSON.stringify(projectFile(doc))), doc);
  const draft = importProject(JSON.stringify(projectFile({ ...doc, source: 'Table unfinished {' })));
  assert.ok(draft.error);
  assert.deepEqual(draft.tableColors, doc.tableColors);
  assert.deepEqual(draft.schema, doc.schema);
  const legacy = importProject(JSON.stringify({ version: 1, source: SAMPLE, validSource: SAMPLE, positions: {} }));
  assert.deepEqual(legacy.tableColors, {});
});

test('appearance imports validate colors and renaming preserves a table color', () => {
  const colors = cleanTableColors({ users: '#F28B82', posts: '#123456', bad: 'url(bad)', short: '#123', invalid: 42 });
  assert.deepEqual(colors, { users: '#f28b82', posts: '#123456' });
  assert.deepEqual(renameTableColor(colors, 'users', 'accounts'), { accounts: '#f28b82', posts: '#123456' });
  assert.deepEqual(colors, { users: '#f28b82', posts: '#123456' });
  assert.equal(tableColor({}, 'constructor', 3), '#bd9cf4');
  assert.equal(tableColor(colors, 'users', 3), '#f28b82');
});

test('rejects malformed imports and discards invalid positions', () => {
  assert.throws(() => importProject('{'), SyntaxError);
  assert.throws(() => importProject('{"version":2,"source":""}'), /เวอร์ชัน/);
  assert.throws(() => importProject('{"version":1,"source":"invalid"}'));
  const doc = importProject(JSON.stringify({ version: 1, source: SAMPLE, positions: { good: { x: 1, y: 2 }, bad: { x: 'oops', y: 2 } } }));
  assert.deepEqual(Object.keys(doc.positions), ['good']);
});

test('ELK creates finite positions without overlapping tables', async () => {
  const schema = parseSchema(SAMPLE);
  const positions = await layoutSchema(schema);
  assert.equal(Object.keys(positions).length, schema.tables.length);
  for (const t of schema.tables) {
    assert.ok(Number.isFinite(positions[t.name].x));
    assert.ok(Number.isFinite(positions[t.name].y));
  }
  for (let i = 0; i < schema.tables.length; i++) for (let j = i + 1; j < schema.tables.length; j++) {
    const a = schema.tables[i], b = schema.tables[j];
    const p = positions[a.name], q = positions[b.name];
    assert.ok(p.x + TABLE_WIDTH <= q.x || q.x + TABLE_WIDTH <= p.x || p.y + tableHeight(a.columns.length) <= q.y || q.y + tableHeight(b.columns.length) <= p.y);
  }
  assert.deepEqual(await layoutSchema({ tables: [], relations: [] }), {});
});

for (const option of LAYOUT_OPTIONS) {
  test(`${option.name} lays out the full marketplace without overlapping tables`, async () => {
    const schema = parseSchema(marketplaceSource);
    const before = structuredClone(schema);
    const positions = await layoutSchema(schema, option.id);
    assert.deepEqual(Object.keys(positions).sort(), schema.tables.map(t => t.name).sort());
    assert.deepEqual(schema, before, 'layout must not change tables, refs, enums or indexes');
    for (const p of Object.values(positions)) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.y >= 0);
    for (let i = 0; i < schema.tables.length; i++) for (let j = i + 1; j < schema.tables.length; j++) {
      const a = schema.tables[i], b = schema.tables[j], p = positions[a.name], q = positions[b.name];
      assert.ok(p.x + TABLE_WIDTH <= q.x || q.x + TABLE_WIDTH <= p.x || p.y + tableHeight(a.columns.length) <= q.y || q.y + tableHeight(b.columns.length) <= p.y, `${a.name} overlaps ${b.name}`);
    }
    assert.deepEqual(await layoutSchema({ tables: [], relations: [] }, option.id), {});
    const single = parseSchema('Table lone {\n id int\n}');
    assert.equal(Object.keys(await layoutSchema(single, option.id)).length, 1);
    const disconnected = parseSchema('Table a {\n id int\n}\nTable b {\n id int\n}\nTable c {\n id int\n}');
    assert.equal(Object.keys(await layoutSchema(disconnected, option.id)).length, 3);
  });
}

test('Pipeline orders dependencies left to right and keeps cycles in one stage', async () => {
  const schema = parseSchema('Table a {\n id int\n}\nTable b {\n id int\n a_id int\n}\nTable c {\n id int\n b_id int\n}\nRef: b.a_id > a.id\nRef: c.b_id > b.id');
  const p = await layoutSchema(schema, 'pipeline');
  assert.ok(p.a.x < p.b.x && p.b.x < p.c.x);
  const cycle = parseSchema('Table a {\n id int\n b_id int\n}\nTable b {\n id int\n a_id int\n}\nRef: a.b_id > b.id\nRef: b.a_id > a.id');
  const q = await layoutSchema(cycle, 'pipeline');
  assert.equal(q.a.x, q.b.x);
  assert.ok(Math.abs(q.a.y - q.b.y) >= tableHeight(2));
});

test('Snowflake places the most connected table at the center of its neighbors', async () => {
  const schema = parseSchema('Table hub {\n id int\n}\nTable a {\n hub_id int\n}\nTable b {\n hub_id int\n}\nTable c {\n hub_id int\n}\nRef: a.hub_id > hub.id\nRef: b.hub_id > hub.id\nRef: c.hub_id > hub.id');
  const p = await layoutSchema(schema, 'snowflake');
  const xs = [p.a.x, p.b.x, p.c.x], ys = [p.a.y, p.b.y, p.c.y];
  assert.ok(Math.abs(xs.reduce((a, b) => a + b, 0) / 3 - p.hub.x) < 0.01);
  assert.ok(Math.abs(ys.reduce((a, b) => a + b, 0) / 3 - p.hub.y) < 0.01);
});

test('Flowchart orders branches by parent position, preserves cycles and saves its preference', async () => {
  const schema = parseSchema('Table a {\n id int\n}\nTable b {\n id int\n}\nTable child_b {\n id int\n parent_id int [ref: > b.id]\n}\nTable child_a {\n id int\n parent_id int [ref: > a.id]\n}\nTable leaf {\n parent_id int [ref: > child_a.id]\n}\nTable isolated {\n id int\n}');
  const snapshot = structuredClone(schema);
  const p = await layoutSchema(schema, 'flowchart');
  assert.ok(p.a.x < p.child_a.x && p.child_a.x < p.leaf.x);
  assert.ok(p.b.x < p.child_b.x);
  assert.ok(p.a.y < p.b.y && p.child_a.y < p.child_b.y, 'branches follow their parents rather than declaration order');
  assert.deepEqual(schema, snapshot);
  const cycle = parseSchema('Table a {\n id int\n b_id int [ref: > b.id]\n}\nTable b {\n id int\n a_id int [ref: > a.id]\n}\nTable self {\n id int\n parent_id int [ref: > self.id]\n}');
  const q = await layoutSchema(cycle, 'flowchart');
  assert.equal(q.a.x, q.b.x);
  assert.ok(Math.abs(q.a.y - q.b.y) >= tableHeight(2));
  assert.ok(Number.isFinite(q.self.x));
  const doc = documentFromSource(SAMPLE, {}, {}, 'flowchart');
  assert.deepEqual(importProject(JSON.stringify(projectFile(doc))), doc);
});

test('endpoint cardinalities stay attached to their tables when routing reverses or loops', () => {
  for (const kind of ['>', '-', '<>'] as const) {
    for (const optional of [false, true]) {
      const relation = { fromTable: 'child', fromColumn: 'id', toTable: 'parent', toColumn: 'id', kind, fromOptional: optional, toOptional: optional };
      const expected = { source: `${optional ? '0..' : ''}${kind === '-' ? '1' : 'N'}`, target: `${optional ? '0..' : ''}${kind === '<>' ? 'N' : '1'}` };
      const schema = parseSchema('Table child {\n id int\n}\nTable parent {\n id int\n}');
      schema.relations = [relation];
      for (const positions of [{ child: { x: 0, y: 0 }, parent: { x: 600, y: 0 } }, { child: { x: 600, y: 0 }, parent: { x: 0, y: 0 } }]) {
        assert.equal([...routeRelations(schema, positions).values()][0].blocked, false);
        assert.deepEqual(relationCardinalities(schema.relations[0]), expected);
      }
      const loop = { ...relation, toTable: 'child' };
      assert.deepEqual(relationCardinalities(loop), expected);
    }
  }
});

test('layout preference survives project export, invalid drafts and legacy imports', () => {
  const doc = documentFromSource(SAMPLE, {}, { customers: '#f28b82' }, 'snowflake');
  assert.deepEqual(importProject(JSON.stringify(projectFile(doc))), doc);
  const draft = importProject(JSON.stringify(projectFile({ ...doc, source: 'Table pending {' })));
  assert.equal(draft.layoutAlgorithm, 'snowflake');
  assert.deepEqual(draft.tableColors, doc.tableColors);
  assert.equal(importProject(JSON.stringify({ version: 1, source: SAMPLE })).layoutAlgorithm, 'left-right');
  assert.equal(importProject(JSON.stringify({ version: 1, source: SAMPLE, layoutAlgorithm: 'unknown' })).layoutAlgorithm, 'left-right');
});

for (const option of LAYOUT_OPTIONS) {
  test(`${option.name} relationship routes avoid every table body`, async context => {
    const schema = parseSchema(marketplaceSource);
    const positions = await layoutSchema(schema, option.id);
    const before = performance.now();
    const routes = routeRelations(schema, positions);
    context.diagnostic(`Routing ${routes.size} relationships took ${Math.round(performance.now() - before)} ms`);
    assert.equal(routes.size, schema.relations.length);
    for (const [id, route] of routes) {
      assert.equal(route.blocked, false, `${id} could not be routed`);
      assert.ok(route.points.length >= 2);
      for (let i = 1; i < route.points.length; i++) for (const table of schema.tables) {
        const box = { ...positions[table.name], width: TABLE_WIDTH, height: tableHeight(table.columns.length) + 1 };
        assert.equal(segmentIntersectsBox(route.points[i - 1], route.points[i], box), false, `${id} intersects ${table.name}`);
      }
    }
  });
}

test('relationship routes go around a blocking table and recompute after it moves', () => {
  const schema = parseSchema('Table parent {\n id int\n}\nTable child {\n parent_id int [ref: > parent.id]\n}\nTable wall {\n id int\n a int\n b int\n c int\n d int\n}');
  const positions = { parent: { x: 0, y: 100 }, child: { x: 900, y: 100 }, wall: { x: 450, y: 0 } };
  const first = [...routeRelations(schema, positions).values()][0];
  assert.equal(first.blocked, false);
  assert.ok(first.points.some(p => p.y < 0 || p.y > tableHeight(5)));
  const moved = [...routeRelations(schema, { ...positions, wall: { x: 450, y: 700 } }).values()][0];
  assert.equal(moved.blocked, false);
  assert.notDeepEqual(moved.points, first.points);
  assert.ok(moved.points.every(p => Math.abs(p.y - 169) < 0.01));
});

test('multiple foreign keys targeting the same column merge into a centered corridor bus', () => {
  const schema = parseSchema('Table users {\n id int [pk]\n}\nTable a {\n id int [pk]\n user_id int [ref: > users.id]\n}\nTable b {\n id int [pk]\n user_id int [ref: > users.id]\n admin_id int [ref: > users.id]\n}\nTable c {\n id int [pk]\n user_id int [ref: > users.id]\n}');
  const positions = { users: { x: 0, y: 300 }, a: { x: 500, y: 0 }, b: { x: 500, y: 300 }, c: { x: 500, y: 650 } };
  const routes = [...routeRelations(schema, positions).values()];
  assert.equal(routes.length, 4);
  for (const r of routes) {
    assert.equal(r.targetHandle, 'in-right:id', 'all routes enter the facing side of users.id');
    assert.equal(r.points.length, 4, 'each route uses a clean 3-segment step');
    // Vertical trunk sits in the middle of the gap (between x=286 and x=484), not hugging table borders
    assert.equal(r.points[1].x, 385);
    assert.equal(r.points[2].x, 385);
  }
});
