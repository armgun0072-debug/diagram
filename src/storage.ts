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
/** Parses a saved project (same shape as projectFile). Throws when invalid. */
export function parseStoredDocument(raw: string): DocumentState {
  const data = JSON.parse(raw);
  if (data.version !== 1 || typeof data.source !== 'string' || typeof data.validSource !== 'string') throw new Error('invalid');
  const workflow = parseWorkflow(data.workflow);
  const previous = documentFromSource(data.validSource, cleanPositions(data.positions), cleanTableColors(data.tableColors), readLayoutAlgorithm(data.layoutAlgorithm), workflow);
  try { return documentFromSource(data.source, previous.positions, previous.tableColors, previous.layoutAlgorithm, workflow); }
  catch (error) { return { ...previous, source: data.source, error: (error as Error).message }; }
}
export function sampleDocument(): DocumentState {
  return documentFromSource(SAMPLE, {
    customers: { x: 60, y: 110 }, orders: { x: 440, y: 60 },
    order_items: { x: 820, y: 170 }, products: { x: 440, y: 365 },
  });
}
export function blankDocument(): DocumentState {
  return documentFromSource('// เริ่มเขียน Table ที่นี่ หรือสลับไป Visual Designer เพื่อเพิ่มตาราง\n');
}
export function restoreDocument(): DocumentState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try { preserveLegacyProject(localStorage); } catch { /* persistDocument will refuse to overwrite the unprotected legacy data. */ }
      return parseStoredDocument(raw);
    }
  } catch { /* Storage may be unavailable; the starter remains usable. */ }
  return sampleDocument();
}

// ---------- Multiple projects ----------
// The index lists projects; each project's data is a projectFile JSON in its own key.
// The legacy single-project key (STORAGE_KEY) is only read for migration and never overwritten.
export const PROJECTS_KEY = 'schema-studio:projects:v1';
export const PROJECT_PREFIX = 'schema-studio:project:';
export type ProjectMeta = { id: string; name: string; updatedAt: number; tables: number };
export type ProjectIndex = { version: 1; activeId: string; projects: ProjectMeta[] };
type WorkspaceStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const PROJECT_ID = /^[a-z0-9]{4,40}$/i;

export function newProjectId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
export function cleanProjectName(value: unknown): string {
  const name = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
  return name || 'Untitled';
}
export function uniqueProjectName(index: ProjectIndex, base: string): string {
  const name = cleanProjectName(base);
  const taken = new Set(index.projects.map(p => p.name));
  if (!taken.has(name)) return name;
  let n = 2;
  while (taken.has(`${name} (${n})`)) n++;
  return `${name} (${n})`;
}
export function projectFileName(name: string, extension: string): string {
  const safe = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, '-').replace(/-{2,}/g, '-').replace(/^[.-]+|[.-]+$/g, '');
  return `${safe || 'my-database'}${extension}`;
}
export function readProjectIndex(storage: Pick<Storage, 'getItem'>): ProjectIndex | null {
  try {
    const raw = storage.getItem(PROJECTS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1 || !Array.isArray(data.projects)) return null;
    const seen = new Set<string>();
    const projects: ProjectMeta[] = [];
    for (const p of data.projects) {
      if (!p || typeof p.id !== 'string' || !PROJECT_ID.test(p.id) || seen.has(p.id)) continue;
      seen.add(p.id);
      projects.push({ id: p.id, name: cleanProjectName(p.name), updatedAt: Number.isFinite(p.updatedAt) ? p.updatedAt : 0, tables: Number.isFinite(p.tables) ? p.tables : 0 });
    }
    if (!projects.length) return null;
    const activeId = projects.some(p => p.id === data.activeId) ? data.activeId : projects[0].id;
    return { version: 1, activeId, projects };
  } catch { return null; }
}
export function writeProjectIndex(index: ProjectIndex, storage: WorkspaceStorage = localStorage): void {
  storage.setItem(PROJECTS_KEY, JSON.stringify(index));
}
/** Returns false when the stored data is already identical (nothing written). */
export function writeProjectDocument(id: string, doc: DocumentState, storage: WorkspaceStorage = localStorage): boolean {
  const raw = JSON.stringify(projectFile(doc));
  if (storage.getItem(PROJECT_PREFIX + id) === raw) return false;
  storage.setItem(PROJECT_PREFIX + id, raw);
  return true;
}
export function readProjectDocument(id: string, storage: Pick<Storage, 'getItem'> = localStorage): DocumentState {
  try {
    const raw = storage.getItem(PROJECT_PREFIX + id);
    if (raw) return parseStoredDocument(raw);
  } catch { /* fall through to an empty project */ }
  return blankDocument();
}
export function removeProjectDocument(id: string, storage: WorkspaceStorage = localStorage): void {
  storage.removeItem(PROJECT_PREFIX + id);
}
export function touchProject(index: ProjectIndex, id: string, doc: DocumentState, now = Date.now()): ProjectIndex {
  return { ...index, projects: index.projects.map(p => p.id === id ? { ...p, updatedAt: now, tables: doc.schema.tables.length } : p) };
}
export function projectMeta(id: string, name: string, doc: DocumentState, now = Date.now()): ProjectMeta {
  return { id, name: cleanProjectName(name), updatedAt: now, tables: doc.schema.tables.length };
}

/** Loads the project list, migrating the legacy single project the first time. */
export function loadWorkspace(storage: WorkspaceStorage = localStorage): { index: ProjectIndex; doc: DocumentState } {
  try {
    const existing = readProjectIndex(storage);
    if (existing) return { index: existing, doc: readProjectDocument(existing.activeId, storage) };
    let doc = sampleDocument();
    const legacy = storage.getItem(STORAGE_KEY);
    if (legacy) {
      try { preserveLegacyProject(storage); } catch { /* legacy key is never overwritten by the multi-project store */ }
      try { doc = parseStoredDocument(legacy); } catch { /* keep the sample; legacy raw data stays untouched */ }
    }
    const id = newProjectId();
    const index: ProjectIndex = { version: 1, activeId: id, projects: [projectMeta(id, 'My database', doc)] };
    try { writeProjectDocument(id, doc, storage); writeProjectIndex(index, storage); } catch { /* storage full or blocked; app still works in memory */ }
    return { index, doc };
  } catch {
    const id = newProjectId(); const doc = sampleDocument();
    return { index: { version: 1, activeId: id, projects: [projectMeta(id, 'My database', doc)] }, doc };
  }
}

// ---------- Share links (#share=...) ----------
// The whole project is compressed into the URL fragment. Fragments are not sent
// to the server, so sharing works on static hosting without a backend.
export const SHARE_HASH_PREFIX = '#share=';
export const MAX_SHARE_URL_LENGTH = 100_000;
function toBase64Url(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new Error('invalid share link');
  const text = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4));
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
}
async function transform(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream): Promise<Uint8Array<ArrayBuffer>> {
  const output = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(output).arrayBuffer());
}
export function compactProjectFile(doc: DocumentState) {
  const project: Record<string, unknown> = { version: 1, source: doc.source };
  if (doc.validSource !== doc.source) project.validSource = doc.validSource;
  if (doc.positions && Object.keys(doc.positions).length > 0) {
    const compactPositions: Positions = {};
    for (const [k, v] of Object.entries(doc.positions)) {
      compactPositions[k] = { x: Math.round(v.x), y: Math.round(v.y) };
    }
    project.positions = compactPositions;
  }
  if (doc.tableColors && Object.keys(doc.tableColors).length > 0) {
    project.tableColors = doc.tableColors;
  }
  if (doc.layoutAlgorithm && doc.layoutAlgorithm !== 'left-right') {
    project.layoutAlgorithm = doc.layoutAlgorithm;
  }
  if (doc.workflow && (doc.workflow.nodes.length > 0 || doc.workflow.edges.length > 0)) {
    project.workflow = doc.workflow;
  }
  return project;
}

export async function shortenUrl(longUrl: string): Promise<string> {
  try {
    const res = await fetch('/.netlify/functions/shorten', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: longUrl }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.shortUrl === 'string' && data.shortUrl.startsWith('http')) {
        return data.shortUrl;
      }
    }
  } catch { /* Network error, offline or non-Netlify environment */ }
  return longUrl;
}

export async function encodeSharePayload(name: string, doc: DocumentState): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify({ name: cleanProjectName(name), project: compactProjectFile(doc) }));
  if (typeof CompressionStream === 'function') return 'z' + toBase64Url(await transform(bytes, new CompressionStream('deflate-raw')));
  return 'j' + toBase64Url(bytes);
}
export async function decodeSharePayload(payload: string): Promise<{ name: string; doc: DocumentState }> {
  let bytes = fromBase64Url(payload.slice(1));
  if (payload[0] === 'z') {
    if (typeof DecompressionStream !== 'function') throw new Error('เบราว์เซอร์นี้เปิดลิงก์แชร์แบบบีบอัดไม่ได้');
    bytes = await transform(bytes, new DecompressionStream('deflate-raw'));
  } else if (payload[0] !== 'j') throw new Error('invalid share link');
  if (bytes.length > 2_000_000) throw new Error('ลิงก์แชร์มีข้อมูลใหญ่เกินไป');
  const data = JSON.parse(new TextDecoder().decode(bytes));
  if (!data || typeof data !== 'object' || !data.project) throw new Error('invalid share link');
  return { name: cleanProjectName(data.name), doc: importProject(JSON.stringify(data.project)) };
}
export function readShareHash(hash: string): string | null {
  return hash.startsWith(SHARE_HASH_PREFIX) && hash.length > SHARE_HASH_PREFIX.length + 1 ? hash.slice(SHARE_HASH_PREFIX.length) : null;
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
    const validSource = 'validSource' in data && typeof data.validSource === 'string' ? data.validSource : data.source;
    return { ...documentFromSource(validSource, positions, tableColors, layoutAlgorithm, workflow), source: data.source, error: (error as Error).message };
  }
}
