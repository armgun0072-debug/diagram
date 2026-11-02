import { parseSchema, SAMPLE, type Positions, type Schema } from './schema';
import { cleanTableColors, type TableColors } from './appearance';
import { readLayoutAlgorithm, type LayoutAlgorithm } from './layoutOptions';
import { emptyWorkflow, parseWorkflow, type Workflow } from './workflow';

export const STORAGE_KEY = 'schema-studio:v1';
export const PRE_WORKFLOW_BACKUP_KEY = 'schema-studio:backup:before-workflow:v1';
type ProjectStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function preserveLegacyProject(storage: ProjectStorage): void {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw || storage.getItem(PRE_WORKFLOW_BACKUP_KEY) !== null) return;
  let legacy = true;
  try { const data = JSON.parse(raw); legacy = !Object.hasOwn(data, 'workflow'); if (!legacy) parseWorkflow(data.workflow); }
  catch { legacy = true; }
  if (legacy) storage.setItem(PRE_WORKFLOW_BACKUP_KEY, raw);
}

export function readPreWorkflowBackup(): string | null {
  try { return localStorage.getItem(PRE_WORKFLOW_BACKUP_KEY); } catch { return null; }
}

export function persistDocument(doc: DocumentState, storage: ProjectStorage = localStorage): void {
  // If making the legacy backup fails (e.g. quota), do not overwrite that data.
  preserveLegacyProject(storage);
  storage.setItem(STORAGE_KEY, JSON.stringify(projectFile(doc)));
}

export type DocumentState = { source: string; validSource: string; schema: Schema; positions: Positions; tableColors: TableColors; layoutAlgorithm: LayoutAlgorithm; workflow: Workflow; error: string | null };
export function cleanPositions(value: unknown): Positions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, p]) => p && typeof p === 'object' &&
    typeof p.x === 'number' && typeof p.y === 'number' && Number.isFinite(p.x) && Number.isFinite(p.y)));
}
export function documentFromSource(source: string, positions: Positions = {}, tableColors: TableColors = {}, layoutAlgorithm: LayoutAlgorithm = 'left-right', workflow: Workflow = emptyWorkflow()): DocumentState {
  return { source, validSource: source, schema: parseSchema(source), positions, tableColors, layoutAlgorithm, workflow, error: null };
}
export function restoreDocument(): DocumentState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try { preserveLegacyProject(localStorage); } catch { /* persistDocument will refuse to overwrite the unprotected legacy data. */ }
      const data = JSON.parse(raw);
      if (data.version !== 1 || typeof data.source !== 'string' || typeof data.validSource !== 'string') throw new Error('invalid');
      const workflow = parseWorkflow(data.workflow);
      const previous = documentFromSource(data.validSource, cleanPositions(data.positions), cleanTableColors(data.tableColors), readLayoutAlgorithm(data.layoutAlgorithm), workflow);
      try { return documentFromSource(data.source, previous.positions, previous.tableColors, previous.layoutAlgorithm, workflow); }
      catch (error) { return { ...previous, source: data.source, error: (error as Error).message }; }
    }
  } catch { /* Storage may be unavailable; the starter remains usable. */ }
  return documentFromSource(SAMPLE, {
    customers: { x: 60, y: 110 }, orders: { x: 440, y: 60 },
    order_items: { x: 820, y: 170 }, products: { x: 440, y: 365 },
  });
}
export function projectFile(doc: DocumentState) {
  return { version: 1, source: doc.source, validSource: doc.validSource, positions: doc.positions, tableColors: doc.tableColors, layoutAlgorithm: doc.layoutAlgorithm, workflow: doc.workflow };
}
export function importProject(raw: string): DocumentState {
  const data: unknown = JSON.parse(raw);
  if (!data || typeof data !== 'object' || !('version' in data) || data.version !== 1 || !('source' in data) || typeof data.source !== 'string') {
    throw new Error('ไฟล์โปรเจกต์ไม่ถูกต้อง หรือเป็นเวอร์ชันที่ยังไม่รองรับ');
  }
  const positions = cleanPositions('positions' in data ? data.positions : {});
  const tableColors = cleanTableColors('tableColors' in data ? data.tableColors : {});
  const layoutAlgorithm = readLayoutAlgorithm('layoutAlgorithm' in data ? data.layoutAlgorithm : undefined);
  const workflow = parseWorkflow('workflow' in data ? data.workflow : undefined);
  try { return documentFromSource(data.source, positions, tableColors, layoutAlgorithm, workflow); }
  catch (error) {
    if (!('validSource' in data) || typeof data.validSource !== 'string') throw error;
    return { ...documentFromSource(data.validSource, positions, tableColors, layoutAlgorithm, workflow), source: data.source, error: (error as Error).message };
  }
}
