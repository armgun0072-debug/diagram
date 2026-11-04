export type Column = { name: string; type: string; pk: boolean; unique: boolean; notNull: boolean; increment?: boolean };
export type TableIndex = { columns: string[]; unique: boolean; pk: boolean };
export type Table = { name: string; columns: Column[]; indexes?: TableIndex[] };
export type EnumDefinition = { name: string; values: string[] };
export type Relation = { fromTable: string; fromColumn: string; toTable: string; toColumn: string; kind: '>' | '-' | '<>'; fromOptional?: boolean; toOptional?: boolean };
export type Schema = { tables: Table[]; relations: Relation[]; enums?: EnumDefinition[] };
export type Positions = Record<string, { x: number; y: number }>;
export const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const dataType = /^[A-Za-z_][A-Za-z0-9_]*(?:\(\d+(?:,\s*\d+)?\))?$/;

export function relationId(r: Relation) {
  return `${r.fromTable}.${r.fromColumn}${relationOperator(r)}${r.toTable}.${r.toColumn}`;
}

export function relationOperator(r: Relation) {
  return `${r.fromOptional ? '?' : ''}${r.kind}${r.toOptional ? '?' : ''}`;
}

export function relationCardinalities(r: Relation) {
  const left = r.kind === '-' ? '1' : 'N';
  const right = r.kind === '<>' ? 'N' : '1';
  return { source: r.fromOptional ? `0..${left}` : left, target: r.toOptional ? `0..${right}` : right };
}

export function relationLabel(r: Relation) {
  const { source, target } = relationCardinalities(r);
  return `${source} : ${target}`;
}

export function validateSchema(schema: Schema): void {
  const names = new Set<string>();
  for (const table of schema.tables) {
    if (!identifier.test(table.name)) throw new Error(`ชื่อตารางไม่ถูกต้อง: ${table.name}`);
    if (names.has(table.name)) throw new Error(`ชื่อตารางซ้ำ: ${table.name}`);
    names.add(table.name);
    if (!table.columns.length) throw new Error(`ตาราง ${table.name} ต้องมีอย่างน้อย 1 คอลัมน์`);
    const columns = new Set<string>();
    for (const col of table.columns) {
      if (!identifier.test(col.name)) throw new Error(`ชื่อคอลัมน์ไม่ถูกต้อง: ${table.name}.${col.name}`);
      if (columns.has(col.name)) throw new Error(`คอลัมน์ซ้ำ: ${table.name}.${col.name}`);
      if (!dataType.test(col.type)) throw new Error(`ชนิดข้อมูลไม่ถูกต้อง: ${col.type}`);
      columns.add(col.name);
    }
    for (const index of table.indexes ?? []) {
      if (!index.columns.length) throw new Error(`Index ใน ${table.name} ต้องมีคอลัมน์`);
      if (new Set(index.columns).size !== index.columns.length) throw new Error(`Index ใน ${table.name} มีคอลัมน์ซ้ำ`);
      for (const column of index.columns) if (!columns.has(column)) throw new Error(`ไม่พบคอลัมน์ใน index: ${table.name}.${column}`);
    }
  }
  const enumNames = new Set<string>();
  for (const definition of schema.enums ?? []) {
    if (!identifier.test(definition.name)) throw new Error(`ชื่อ Enum ไม่ถูกต้อง: ${definition.name}`);
    if (enumNames.has(definition.name)) throw new Error(`ชื่อ Enum ซ้ำ: ${definition.name}`);
    if (!definition.values.length) throw new Error(`Enum ${definition.name} ต้องมีอย่างน้อย 1 ค่า`);
    if (new Set(definition.values).size !== definition.values.length) throw new Error(`ค่าซ้ำใน Enum ${definition.name}`);
    enumNames.add(definition.name);
  }
  const refs = new Set<string>();
  for (const r of schema.relations) {
    for (const [t, c] of [[r.fromTable, r.fromColumn], [r.toTable, r.toColumn]]) {
      if (!schema.tables.find(table => table.name === t)?.columns.some(col => col.name === c)) {
        throw new Error(`ไม่พบคอลัมน์ในความสัมพันธ์: ${t}.${c}`);
      }
    }
    if (r.fromTable === r.toTable && r.fromColumn === r.toColumn) throw new Error('เชื่อมคอลัมน์กับตัวเองไม่ได้');
    // Optionality does not make the same column pair a different relationship.
    const id = relationId({ ...r, fromOptional: false, toOptional: false });
    const reverse = relationId({ fromTable: r.toTable, fromColumn: r.toColumn, toTable: r.fromTable, toColumn: r.fromColumn, kind: r.kind });
    if (refs.has(id) || refs.has(reverse)) throw new Error(`ความสัมพันธ์ซ้ำ: ${id}`);
    refs.add(id);
  }
}

const namePattern = '(?:[A-Za-z_]\\w*|"[A-Za-z_]\\w*")';
const endpointPattern = `(${namePattern})\\s*\\.\\s*(${namePattern})`;
const operatorPattern = '(\\??(?:<>|>|<|-)\\??)';
const referencePattern = new RegExp(`^Ref:\\s*${endpointPattern}\\s*${operatorPattern}\\s*${endpointPattern}$`, 'i');
const inlineReferencePattern = new RegExp(`^ref:\\s*${operatorPattern}\\s*${endpointPattern}$`, 'i');
const unquote = (value: string) => value.startsWith('"') ? value.slice(1, -1) : value;

function makeRelation(fromTable: string, fromColumn: string, operator: string, toTable: string, toColumn: string): Relation {
  const prefix = operator.startsWith('?'), suffix = operator.endsWith('?');
  const kind = operator.replace(/\?/g, '');
  if (kind === '<') return {
    fromTable: unquote(toTable), fromColumn: unquote(toColumn), toTable: unquote(fromTable), toColumn: unquote(fromColumn), kind: '>',
    ...(suffix && { fromOptional: true }), ...(prefix && { toOptional: true }),
  };
  return {
    fromTable: unquote(fromTable), fromColumn: unquote(fromColumn), toTable: unquote(toTable), toColumn: unquote(toColumn), kind: kind as Relation['kind'],
    ...(prefix && { fromOptional: true }), ...(suffix && { toOptional: true }),
  };
}

// A strict, documented subset: never silently drop unsupported DBML declarations.
export function parseSchema(source: string): Schema {
  const schema: Schema = { tables: [], relations: [] };
  let current: Table | null = null;
  let currentEnum: EnumDefinition | null = null;
  let inIndexes = false;
  const lines = source.replace(/^\uFEFF/, '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\/\/.*$/, '').trim();
    if (!line) continue;
    const fail = (message: string): never => { throw new Error(`บรรทัด ${i + 1}: ${message}`); };
    if (currentEnum) {
      if (line === '}') { currentEnum = null; continue; }
      if (!/^(?:[A-Za-z_]\w*|"(?:[^"\\]|\\.)*")$/.test(line)) fail('ค่า Enum ต้องเป็นชื่อ หรือข้อความในเครื่องหมาย " "');
      currentEnum.values.push(line.startsWith('"') ? JSON.parse(line) : line);
      continue;
    }
    if (current) {
      if (inIndexes) {
        if (line === '}') { inIndexes = false; continue; }
        const index = line.match(/^(?:\(([^)]+)\)|([A-Za-z_]\w*))(?:\s*\[([^\]]*)\])?$/);
        if (!index) fail('รูปแบบ index: (column_a, column_b) [unique]');
        const flags = (index![3] ?? '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
        if (flags.some(f => !['unique', 'pk'].includes(f))) fail('Index รองรับเฉพาะ unique และ pk');
        current.indexes!.push({ columns: (index![1] ?? index![2]).split(',').map(x => unquote(x.trim())), unique: flags.includes('unique'), pk: flags.includes('pk') });
        continue;
      }
      if (line === '}') { current = null; continue; }
      if (/^indexes\s*\{$/i.test(line)) { inIndexes = true; current.indexes ??= []; continue; }
      const match = line.match(/^(\w+)\s+([A-Za-z_]\w*(?:\(\d+(?:,\s*\d+)?\))?)(?:\s*\[([^\]]*)\])?$/);
      if (!match) fail('รูปแบบคอลัมน์: name type [pk, increment, not null, unique, ref: > table.column]');
      const [, name, type, raw = ''] = match!;
      const settings = raw.split(',').map(x => x.trim()).filter(Boolean);
      const flags: string[] = [];
      for (const setting of settings) {
        const ref = setting.match(inlineReferencePattern);
        if (ref) {
          schema.relations.push(makeRelation(current.name, name, ref[1], ref[2], ref[3]));
        } else {
          const flag = setting.toLowerCase();
          if (!['pk', 'primary key', 'not null', 'null', 'unique', 'increment'].includes(flag)) fail(`ยังไม่รองรับ setting: ${setting}`);
          flags.push(flag);
        }
      }
      if (flags.includes('null') && flags.includes('not null')) fail('ห้ามกำหนดทั้ง null และ not null');
      current.columns.push({ name, type, pk: flags.includes('pk') || flags.includes('primary key'), notNull: flags.includes('not null'), unique: flags.includes('unique'), ...(flags.includes('increment') && { increment: true }) });
      continue;
    }
    const table = line.match(/^Table\s+(\w+)\s*\{$/i);
    if (table) { current = { name: table[1], columns: [] }; schema.tables.push(current); continue; }
    const definition = line.match(/^Enum\s+(\w+)\s*\{$/i);
    if (definition) { currentEnum = { name: definition[1], values: [] }; (schema.enums ??= []).push(currentEnum); continue; }
    const ref = line.match(referencePattern);
    if (ref) {
      const [, a, b, kind, c, d] = ref;
      schema.relations.push(makeRelation(a, b, kind, c, d));
      continue;
    }
    fail('รองรับ Table name { ... }, Enum name { ... } และ Ref: table.column > table.column');
  }
  if (currentEnum) throw new Error(`Enum ${currentEnum.name} ยังไม่มีวงเล็บปิด }`);
  if (inIndexes) throw new Error(`indexes ในตาราง ${current!.name} ยังไม่มีวงเล็บปิด }`);
  if (current) throw new Error(`ตาราง ${current.name} ยังไม่มีวงเล็บปิด }`);
  validateSchema(schema);
  return schema;
}

export function serializeSchema(schema: Schema): string {
  const tables = schema.tables.map(t => `Table ${t.name} {\n${t.columns.map(c => {
    const flags = [c.pk && 'pk', c.increment && 'increment', c.notNull && 'not null', c.unique && 'unique'].filter(Boolean);
    return `  ${c.name} ${c.type}${flags.length ? ` [${flags.join(', ')}]` : ''}`;
  }).join('\n')}${t.indexes ? `\n\n  indexes {\n${t.indexes.map(index => {
    const flags = [index.pk && 'pk', index.unique && 'unique'].filter(Boolean);
    return `    (${index.columns.join(', ')})${flags.length ? ` [${flags.join(', ')}]` : ''}`;
  }).join('\n')}\n  }` : ''}\n}`).join('\n\n');
  const enums = schema.enums?.map(e => `Enum ${e.name} {\n${e.values.map(v => `  ${identifier.test(v) ? v : JSON.stringify(v)}`).join('\n')}\n}`).join('\n\n');
  const refs = schema.relations.map(r => `Ref: ${r.fromTable}.${r.fromColumn} ${relationOperator(r)} ${r.toTable}.${r.toColumn}`).join('\n');
  return [tables, enums, refs].filter(Boolean).join('\n\n') + '\n';
}

export const SAMPLE = `// Storefront · ตัวอย่างระบบร้านค้า
// แก้โค้ด แล้วดู Diagram ได้ทันที

Table customers {
  id uuid [pk]
  full_name varchar(120) [not null]
  email varchar(255) [unique]
  created_at timestamp
}

Table orders {
  id uuid [pk]
  customer_id uuid [not null]
  status varchar(30)
  total decimal(10,2)
  created_at timestamp
}

Table order_items {
  id uuid [pk]
  order_id uuid [not null]
  product_id uuid [not null]
  quantity integer [not null]
  unit_price decimal(10,2)
}

Table products {
  id uuid [pk]
  name varchar(160) [not null]
  price decimal(10,2)
  stock integer
}

Ref: orders.customer_id > customers.id
Ref: order_items.order_id > orders.id
Ref: order_items.product_id > products.id
`;
