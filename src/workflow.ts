import type { Schema } from './schema';

export const STEP_KINDS = ['start', 'process', 'decision', 'end'] as const;
export type StepKind = typeof STEP_KINDS[number];
export type FlowStep = { id: string; kind: StepKind; label: string; description: string; tableRef: string; fieldRef: string; position: { x: number; y: number } };
export type FlowLink = { id: string; source: string; target: string; sourceHandle: string; label: string };
export type Workflow = { nodes: FlowStep[]; edges: FlowLink[] };
export const emptyWorkflow = (): Workflow => ({ nodes: [], edges: [] });
export const STEP_LABELS: Record<StepKind, string> = { start: 'เริ่มต้น', process: 'ขั้นตอน', decision: 'เงื่อนไข', end: 'สิ้นสุด' };
export const flowStepHeight = (kind: StepKind) => kind === 'start' || kind === 'end' ? 80 : kind === 'decision' ? 170 : 132;

export function newFlowStep(kind: StepKind, index: number, tableRef = ''): FlowStep {
  return { id: crypto.randomUUID(), kind, label: tableRef ? `จัดการ ${tableRef}`.slice(0, 160) : STEP_LABELS[kind], description: '', tableRef, fieldRef: '', position: { x: 60 + index % 3 * 320, y: 60 + Math.floor(index / 3) * 240 } };
}

export function validateWorkflow(flow: Workflow): void {
  const ids = new Set<string>();
  for (const node of flow.nodes) {
    if (!node.id || ids.has(node.id)) throw new Error('Flowchart มี ID ขั้นตอนว่างหรือซ้ำ');
    ids.add(node.id);
    if (!STEP_KINDS.includes(node.kind) || !node.label.trim() || node.label.length > 160 || node.description.length > 3000) throw new Error('ชื่อหรือรายละเอียดขั้นตอน Flowchart ไม่ถูกต้อง');
    if (!Number.isFinite(node.position.x) || !Number.isFinite(node.position.y)) throw new Error('ตำแหน่ง Flowchart ไม่ถูกต้อง');
  }
  const edgeIds = new Set<string>(), connections = new Set<string>();
  for (const edge of flow.edges) {
    const source = flow.nodes.find(n => n.id === edge.source), target = flow.nodes.find(n => n.id === edge.target);
    if (!edge.id || edgeIds.has(edge.id)) throw new Error('Flowchart มี ID เส้นว่างหรือซ้ำ');
    edgeIds.add(edge.id);
    if (!source || !target || source.id === target.id) throw new Error('ไม่พบขั้นตอนปลายทาง หรือเชื่อมขั้นตอนกับตัวเอง');
    if (source.kind === 'end' || target.kind === 'start') throw new Error('ห้ามเชื่อมออกจากสิ้นสุด หรือเชื่อมเข้าเริ่มต้น');
    if (source.kind === 'decision' ? !['yes', 'no'].includes(edge.sourceHandle) : edge.sourceHandle !== 'out') throw new Error('จุดเชื่อม Flowchart ไม่ถูกต้อง');
    const key = source.kind === 'decision' ? `${source.id}:${edge.sourceHandle}` : JSON.stringify([source.id, target.id, edge.sourceHandle]);
    if (connections.has(key)) throw new Error('เส้นซ้ำ หรือแขนงเงื่อนไขนี้มีปลายทางแล้ว');
    connections.add(key);
    if (edge.label.length > 200) throw new Error('ข้อความบนเส้นยาวเกิน 200 ตัวอักษร');
  }
}

export function parseWorkflow(value: unknown): Workflow {
  if (value === undefined) return emptyWorkflow();
  if (!value || typeof value !== 'object' || !('nodes' in value) || !Array.isArray(value.nodes) || !('edges' in value) || !Array.isArray(value.edges)) throw new Error('ข้อมูล Flowchart ในไฟล์ไม่ถูกต้อง');
  const text = (value: unknown, fallback = '') => { if (value === undefined) return fallback; if (typeof value !== 'string') throw new Error('ข้อความ Flowchart ไม่ถูกต้อง'); return value; };
  const nodes = value.nodes.map((node: unknown): FlowStep => {
    if (!node || typeof node !== 'object') throw new Error('ขั้นตอน Flowchart ไม่ถูกต้อง');
    const n = node as Record<string, unknown>, p = n.position as Record<string, unknown> | undefined;
    if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') throw new Error('ตำแหน่ง Flowchart ไม่ถูกต้อง');
    return { id: text(n.id), kind: text(n.kind) as StepKind, label: text(n.label), description: text(n.description), tableRef: text(n.tableRef), fieldRef: text(n.fieldRef), position: { x: p.x, y: p.y } };
  });
  const edges = value.edges.map((edge: unknown): FlowLink => {
    if (!edge || typeof edge !== 'object') throw new Error('เส้น Flowchart ไม่ถูกต้อง');
    const e = edge as Record<string, unknown>;
    return { id: text(e.id), source: text(e.source), target: text(e.target), sourceHandle: text(e.sourceHandle, 'out'), label: text(e.label) };
  });
  const flow = { nodes, edges }; validateWorkflow(flow); return flow;
}

export function referenceIssues(step: FlowStep, schema: Schema): string[] {
  if (!step.tableRef) return [];
  const table = schema.tables.find(t => t.name === step.tableRef);
  if (!table) return [`ไม่พบตาราง ${step.tableRef} ใน ER Diagram`];
  if (step.fieldRef && !table.columns.some(c => c.name === step.fieldRef)) return [`ไม่พบคอลัมน์ ${step.tableRef}.${step.fieldRef}`];
  return [];
}

export function renameWorkflowTable(flow: Workflow, oldName: string, newName: string): Workflow {
  if (oldName === newName) return flow;
  return { ...flow, nodes: flow.nodes.map(n => n.tableRef === oldName ? { ...n, tableRef: newName } : n) };
}
