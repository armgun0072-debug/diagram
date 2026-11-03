import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSchema, SAMPLE } from './schema';
import { emptyWorkflow, newFlowStep, parseWorkflow, referenceIssues, renameWorkflowTable, validateWorkflow } from './workflow';
import { blankDocument, decodeSharePayload, documentFromSource, encodeSharePayload, importProject, loadWorkspace, persistDocument, PRE_WORKFLOW_BACKUP_KEY, preserveLegacyProject, PROJECT_PREFIX, projectFile, projectFileName, projectMeta, PROJECTS_KEY, readProjectDocument, readProjectIndex, readShareHash, STORAGE_KEY, uniqueProjectName, writeProjectDocument, writeProjectIndex } from './storage';
import { arrangeWorkflow } from './workflowLayout';

function fixture() {
  const start = newFlowStep('start', 0), process = newFlowStep('process', 1, 'customers'), decision = newFlowStep('decision', 2), end = newFlowStep('end', 3);
  return { nodes: [start, process, decision, end], edges: [
    { id: 'a', source: start.id, target: process.id, sourceHandle: 'out', label: '' },
    { id: 'b', source: process.id, target: decision.id, sourceHandle: 'out', label: '' },
    { id: 'c', source: decision.id, target: end.id, sourceHandle: 'yes', label: 'ยืนยันแล้ว' },
    { id: 'd', source: decision.id, target: process.id, sourceHandle: 'no', label: 'แก้ไขข้อมูล' },
  ] };
}

test('business flow roundtrip retains user steps, branch labels and ER references', () => {
  const flow = fixture(); flow.nodes[1].fieldRef = 'email'; flow.nodes[1].description = 'ตรวจอีเมลก่อนดำเนินการ';
  const doc = documentFromSource(SAMPLE, {}, { customers: '#123456' }, 'compact', flow);
  assert.deepEqual(importProject(JSON.stringify(projectFile(doc))), doc);
  assert.deepEqual(parseWorkflow(JSON.parse(JSON.stringify(flow))), flow);
  const draft = importProject(JSON.stringify(projectFile({ ...doc, source: 'Table unfinished {' })));
  assert.ok(draft.error); assert.deepEqual(draft.workflow, flow);
});

test('legacy JSON opens with an empty flow, without inferring business steps', () => {
  const imported = importProject(JSON.stringify({ version: 1, source: SAMPLE }));
  assert.deepEqual(imported.workflow, emptyWorkflow());
});

test('missing ER references are reported without deleting business logic', () => {
  const schema = parseSchema(SAMPLE), flow = fixture(), step = flow.nodes[1]; step.fieldRef = 'email';
  assert.deepEqual(referenceIssues(step, schema), []);
  const renamed = renameWorkflowTable(flow, 'customers', 'accounts');
  assert.equal(renamed.nodes[1].tableRef, 'accounts');
  assert.equal(renamed.nodes[1].label, step.label); assert.deepEqual(renamed.edges, flow.edges);
  assert.equal(flow.nodes[1].tableRef, 'customers');
  assert.match(referenceIssues(renamed.nodes[1], schema)[0], /ไม่พบตาราง/);
  assert.match(referenceIssues({ ...step, fieldRef: 'deleted_column' }, schema)[0], /ไม่พบคอลัมน์/);
  assert.doesNotThrow(() => validateWorkflow(renamed));
});

test('flow rejects invalid connections and duplicate decision branches', () => {
  const flow = fixture(), [start, process, decision, end] = flow.nodes;
  assert.doesNotThrow(() => validateWorkflow(flow));
  const withEdge = (source: string, target: string, sourceHandle = 'out') => ({ ...flow, edges: [...flow.edges, { id: 'bad', source, target, sourceHandle, label: '' }] });
  assert.throws(() => validateWorkflow(withEdge(end.id, process.id)), /สิ้นสุด/);
  assert.throws(() => validateWorkflow(withEdge(process.id, start.id)), /เริ่มต้น/);
  assert.throws(() => validateWorkflow(withEdge(process.id, process.id)), /ตัวเอง/);
  assert.throws(() => validateWorkflow(withEdge(decision.id, process.id, 'yes')), /แขนง/);
  assert.throws(() => validateWorkflow(withEdge(decision.id, process.id, 'out')), /จุดเชื่อม/);
  assert.throws(() => parseWorkflow({ nodes: flow.nodes, edges: [{ id: 'x', source: 'missing', target: end.id }] }));
  assert.throws(() => parseWorkflow({ nodes: [{ ...process, position: { x: Infinity, y: 0 } }], edges: [] }), /ตำแหน่ง/);
});

test('flow layout handles cycles while preserving references and labels', async () => {
  const flow = fixture(), snapshot = structuredClone(flow), result = await arrangeWorkflow(flow);
  assert.deepEqual(flow, snapshot); assert.deepEqual(result.edges, flow.edges);
  assert.equal(result.nodes[1].tableRef, 'customers');
  for (const node of result.nodes) assert.ok(Number.isFinite(node.position.x) && Number.isFinite(node.position.y));
});

test('pre-upgrade backup saves exact legacy data once and never replaces it', () => {
  const raw = JSON.stringify({ version: 1, source: SAMPLE, validSource: SAMPLE, positions: { customers: { x: 88, y: 99 } } });
  const data = new Map([[STORAGE_KEY, raw]]);
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  preserveLegacyProject(storage);
  assert.equal(data.get(PRE_WORKFLOW_BACKUP_KEY), raw);
  persistDocument(documentFromSource(SAMPLE, {}, {}, 'pipeline', fixture()), storage);
  assert.equal(data.get(PRE_WORKFLOW_BACKUP_KEY), raw);
  assert.equal(JSON.parse(data.get(STORAGE_KEY)!).workflow.nodes.length, 4);
  preserveLegacyProject(storage); assert.equal(data.get(PRE_WORKFLOW_BACKUP_KEY), raw);
});

test('backup failure prevents overwriting the legacy project', () => {
  const raw = JSON.stringify({ version: 1, source: SAMPLE });
  let writesToOriginal = 0;
  const storage = { getItem: (key: string) => key === STORAGE_KEY ? raw : null, setItem: (key: string) => {
    if (key === PRE_WORKFLOW_BACKUP_KEY) throw new Error('QuotaExceededError');
    writesToOriginal++;
  } };
  assert.throws(() => persistDocument(documentFromSource(SAMPLE), storage), /Quota/);
  assert.equal(writesToOriginal, 0);
});

function memoryStorage(initial: [string, string][] = []) {
  const data = new Map(initial);
  return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
}

test('first multi-project load migrates the legacy project without touching the legacy key', () => {
  const legacy = JSON.stringify(projectFile(documentFromSource(SAMPLE, { customers: { x: 88, y: 99 } }, {}, 'pipeline', fixture())));
  const storage = memoryStorage([[STORAGE_KEY, legacy]]);
  const { index, doc } = loadWorkspace(storage);
  assert.equal(index.projects.length, 1);
  assert.equal(index.projects[0].name, 'My database');
  assert.deepEqual(doc.positions.customers, { x: 88, y: 99 });
  assert.equal(doc.workflow.nodes.length, 4);
  assert.equal(storage.data.get(STORAGE_KEY), legacy);
  assert.deepEqual(readProjectIndex(storage), index);
  // Second load reads the index instead of migrating again.
  assert.equal(loadWorkspace(storage).index.activeId, index.activeId);
});

test('projects are stored separately and corrupt entries fall back safely', () => {
  const storage = memoryStorage();
  const { index } = loadWorkspace(storage);
  const blank = blankDocument();
  writeProjectDocument('second01', blank, storage);
  const next = { ...index, activeId: 'second01', projects: [...index.projects, projectMeta('second01', 'Second', blank)] };
  writeProjectIndex(next, storage);
  assert.equal(readProjectDocument('second01', storage).schema.tables.length, 0);
  assert.equal(readProjectDocument(index.activeId, storage).schema.tables.length, 4);
  assert.equal(writeProjectDocument('second01', blank, storage), false, 'identical data is not rewritten');
  storage.setItem(PROJECT_PREFIX + 'second01', '{broken');
  assert.equal(readProjectDocument('second01', storage).schema.tables.length, 0);
  storage.setItem(PROJECTS_KEY, JSON.stringify({ version: 1, activeId: 'missing', projects: [{ id: '../bad', name: 'x' }, { id: 'second01', name: '  Second   copy ' }] }));
  assert.deepEqual(readProjectIndex(storage)?.projects.map(p => [p.id, p.name]), [['second01', 'Second copy']]);
  assert.equal(readProjectIndex(storage)?.activeId, 'second01');
  assert.equal(uniqueProjectName(next, 'Second'), 'Second (2)');
  assert.equal(projectFileName('ร้าน/ทุเรียน: v2', '.erd.json'), 'ร้าน-ทุเรียน-v2.erd.json');
});

test('share links roundtrip the whole project and reject tampered data', async () => {
  const doc = documentFromSource(SAMPLE, { customers: { x: 5, y: 6 } }, { customers: '#ff0000' }, 'compact', fixture());
  const payload = await encodeSharePayload('ร้านทุเรียน', doc);
  assert.equal(readShareHash(`#share=${payload}`), payload);
  assert.equal(readShareHash('#other'), null);
  const shared = await decodeSharePayload(payload);
  assert.equal(shared.name, 'ร้านทุเรียน');
  assert.deepEqual(projectFile(shared.doc), projectFile(doc));
  await assert.rejects(decodeSharePayload('z' + payload.slice(1, 20)));
  await assert.rejects(decodeSharePayload('x' + payload.slice(1)));
  await assert.rejects(decodeSharePayload('z<script>'));
});
