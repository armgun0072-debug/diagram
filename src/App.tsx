import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, MiniMap, MarkerType, useReactFlow, type Connection, type NodeChange, type Edge } from '@xyflow/react';
import { Archive, Code2, MousePointer2, Workflow, Plus, Download, Upload, Table2, ChevronRight, CircleHelp, Check, AlertCircle, Pencil, Trash2, Maximize, X, Database, Link2, HardDrive, Share2 } from 'lucide-react';
import TableNode, { type TableFlowNode } from './TableNode';
import TableEditor from './TableEditor';
import SchemaEditor from './SchemaEditor';
import TableAppearance from './TableAppearance';
import ArrangeMenu from './ArrangeMenu';
import FlowEditor from './FlowEditor';
import ProjectMenu from './ProjectMenu';
import { renameWorkflowTable, type Workflow as BusinessWorkflow } from './workflow';
import type { LayoutAlgorithm } from './layoutOptions';
import { tableColor, renameTableColor, type TableColors } from './appearance';
import { parseSchema, serializeSchema, validateSchema, relationId, relationLabel, relationCardinalities, type Schema, type Table } from './schema';
import { layoutSchema, TABLE_WIDTH } from './layout';
import { useErRoutes } from './useErRoutes';
import { connectionHandles } from './routing';
import RelationshipEdge, { type RelationshipFlowEdge } from './RelationshipEdge';
import { projectFile, documentFromSource, importProject, readPreWorkflowBackup, loadWorkspace, writeProjectDocument, writeProjectIndex, readProjectDocument, removeProjectDocument, touchProject, projectMeta, newProjectId, uniqueProjectName, cleanProjectName, projectFileName, blankDocument, sampleDocument, encodeSharePayload, decodeSharePayload, readShareHash, shortenUrl, SHARE_HASH_PREFIX, MAX_SHARE_URL_LENGTH, type DocumentState, type ProjectIndex } from './storage';

const nodeTypes = { table: TableNode };
const edgeTypes = { relationship: RelationshipEdge };
const fitViewOptions = { padding: 0.18 };
const proOptions = { hideAttribution: false };

function saveFile(name: string, content: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const [workspace] = useState(() => loadWorkspace());
  const [doc, setDoc] = useState<DocumentState>(workspace.doc);
  const [projects, setProjects] = useState<ProjectIndex>(workspace.index);
  const projectsRef = useRef(projects);
  const docRef = useRef(doc);
  docRef.current = doc;
  const [mode, setMode] = useState<'code' | 'visual'>('code');
  const [view, setView] = useState<'er' | 'flow'>('er');
  const [dragging, setDragging] = useState(false);
  const [livePositions, setLivePositions] = useState<DocumentState['positions'] | null>(null);
  const livePositionsRef = useRef<DocumentState['positions']>({});
  const draggingRef = useRef(false);
  const dragFrame = useRef<number | null>(null);
  const [legacyBackup] = useState(readPreWorkflowBackup);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [saved, setSaved] = useState(true);
  const [nodeMeasurements, setNodeMeasurements] = useState(() => new Map<string, { width: number; height: number }>());
  const fileInput = useRef<HTMLInputElement>(null);
  const layoutJob = useRef(0);
  const initialFitDone = useRef(false);
  const { fitView, setCenter, getNode } = useReactFlow<TableFlowNode>();
  const schema = doc.schema;
  const canEdit = mode === 'visual' && !doc.error;

  // Wait for every table's measured size before fitting a restored project.
  // Fitting the first measured node alone can leave the rest off screen.
  useEffect(() => {
    if (initialFitDone.current || !schema.tables.length || schema.tables.some(t => !nodeMeasurements.has(t.name))) return;
    const frame = requestAnimationFrame(() => { initialFitDone.current = true; void fitView({ padding: 0.18 }); });
    return () => cancelAnimationFrame(frame);
  }, [schema.tables, nodeMeasurements, fitView]);

  const updateProjects = useCallback((change: (index: ProjectIndex) => ProjectIndex) => {
    const next = change(projectsRef.current);
    projectsRef.current = next; setProjects(next);
    try { writeProjectIndex(next); } catch { setNotice('บันทึกรายการโปรเจกต์ในเบราว์เซอร์ไม่ได้'); }
    return next;
  }, []);
  // Saves a document under the active project. Only touches the index when the data really changed.
  const persistActive = useCallback((current: DocumentState) => {
    const id = projectsRef.current.activeId;
    if (writeProjectDocument(id, current)) updateProjects(index => touchProject(index, id, current));
  }, [updateProjects]);

  useEffect(() => {
    setSaved(false);
    const id = setTimeout(() => {
      try { persistActive(doc); setSaved(true); }
      catch { setNotice('บันทึกในเบราว์เซอร์ไม่ได้ กรุณาดาวน์โหลดโปรเจกต์เพื่อเก็บข้อมูล'); }
    }, 400);
    return () => clearTimeout(id);
  }, [doc, persistActive]);
  useEffect(() => { if (!notice) return; const id = setTimeout(() => setNotice(''), 6000); return () => clearTimeout(id); }, [notice]);
  useEffect(() => () => { if (dragFrame.current !== null) cancelAnimationFrame(dragFrame.current); }, []);

  // Newly pasted/imported schemas can contain tall tables: lay them out once
  // rather than leaving them on a fixed grid with overlapping rows.
  useEffect(() => {
    const job = ++layoutJob.current;
    setBusy(false);
    if (!schema.tables.some(t => !Object.hasOwn(doc.positions, t.name))) return;
    let cancelled = false;
    let fitTimer: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      void layoutSchema(schema, doc.layoutAlgorithm).then(positions => {
        if (cancelled || job !== layoutJob.current) return;
        setDoc(previous => previous.schema === schema ? { ...previous, positions } : previous);
        fitTimer = setTimeout(() => { if (!cancelled && job === layoutJob.current) void fitView({ padding: 0.15, duration: 350 }); }, 80);
      }).catch(() => { if (!cancelled && job === layoutJob.current) setNotice('จัดตำแหน่งอัตโนมัติไม่สำเร็จ ลองกดจัดตำแหน่งอีกครั้ง'); });
    }, 450);
    return () => { cancelled = true; clearTimeout(timer); clearTimeout(fitTimer); };
    // Position changes from dragging must not restart automatic layout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema, fitView]);

  const updateSource = useCallback((source: string) => {
    setDoc(previous => {
      try { return { ...previous, source, validSource: source, schema: parseSchema(source), error: null }; }
      catch (error) { return { ...previous, source, error: (error as Error).message }; }
    });
  }, []);

  const commit = useCallback((next: Schema, positions?: DocumentState['positions'], tableColors?: TableColors, workflow?: BusinessWorkflow): boolean => {
    if (doc.error) { setNotice('แก้ข้อผิดพลาดในโค้ดก่อนเปลี่ยนโครงสร้าง'); return false; }
    try {
      validateSchema(next);
      const source = serializeSchema(next);
      setDoc(previous => ({ ...previous, schema: next, source, validSource: source, positions: positions ?? previous.positions, tableColors: tableColors ?? previous.tableColors, workflow: workflow ?? previous.workflow, error: null }));
      return true;
    } catch (error) { setNotice((error as Error).message); return false; }
  }, [doc.error]);
  const updateWorkflow = useCallback((workflow: BusinessWorkflow) => setDoc(previous => ({ ...previous, workflow })), []);

  // Node content is independent from position/selection. Reuse it during drag
  // so other tables and their handles do not rerender on every pointer event.
  const nodeData = useMemo(() => new Map(schema.tables.map((table, index) => [table.name, {
    table, editable: canEdit, color: tableColor(doc.tableColors, table.name, index),
    foreignKeys: schema.relations.filter(r => r.fromTable === table.name).map(r => r.fromColumn),
  }])), [schema, canEdit, doc.tableColors]);

  const nodePositions = useMemo(() => Object.fromEntries(schema.tables.map((table, index) => [table.name,
    livePositions && Object.hasOwn(livePositions, table.name) ? livePositions[table.name] : Object.hasOwn(doc.positions, table.name) ? doc.positions[table.name] : { x: 80 + index % 3 * 350, y: 80 + Math.floor(index / 3) * 300 },
  ])), [schema.tables, doc.positions, livePositions]);
  const nodes = useMemo<TableFlowNode[]>(() => schema.tables.map(table => ({
    id: table.name, type: 'table', position: nodePositions[table.name],
    selected: selected === table.name,
    measured: nodeMeasurements.get(table.name),
    dragHandle: '.table-heading',
    data: nodeData.get(table.name)!,
  })), [schema.tables, nodePositions, selected, nodeData, nodeMeasurements]);
  const { routes, pending: routingPending } = useErRoutes(schema, nodePositions, nodeMeasurements, dragging, view === 'er');
  const blockedRoutes = dragging || routingPending ? 0 : schema.relations.filter(r => routes.get(relationId(r))?.blocked).length;
  const edges = useMemo<RelationshipFlowEdge[]>(() => schema.relations.map(r => {
    const route = routes.get(relationId(r));
    const preview = dragging || routingPending || !route;
    const handles = preview ? connectionHandles({ x: nodePositions[r.fromTable].x, width: TABLE_WIDTH }, { x: nodePositions[r.toTable].x, width: TABLE_WIDTH }, r.fromColumn, r.toColumn) : route;
    return {
    id: relationId(r), source: r.fromTable, target: r.toTable,
    sourceHandle: handles.sourceHandle, targetHandle: handles.targetHandle,
    type: 'relationship', label: relationLabel(r),
    data: { route: route ?? { ...handles, points: [], blocked: false }, cardinalities: relationCardinalities(r), preview, hovered: hoveredEdge === relationId(r), description: `${r.fromTable}.${r.fromColumn} → ${r.toTable}.${r.toColumn} (${relationLabel(r)})` },
    className: hoveredEdge === relationId(r) ? 'relationship-hovered' : '',
    zIndex: hoveredEdge === relationId(r) ? 30 : selectedEdge === relationId(r) ? 10 : 0,
    selected: selectedEdge === relationId(r),
    style: { stroke: hoveredEdge === relationId(r) || selectedEdge === relationId(r) ? '#67d9b0' : '#7a8f9d', strokeWidth: hoveredEdge === relationId(r) ? 2.5 : 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, color: hoveredEdge === relationId(r) || selectedEdge === relationId(r) ? '#67d9b0' : '#7a8f9d', width: 16, height: 16 },
  }; }), [schema.relations, selectedEdge, hoveredEdge, routes, dragging, routingPending, nodePositions]);

  const onNodesChange = useCallback((changes: NodeChange<TableFlowNode>[]) => {
    // Controlled nodes must retain ResizeObserver measurements. Omitting them
    // makes React Flow discard handle bounds on the next position update,
    // temporarily hiding tables and edges until they are measured again.
    if (changes.some(change => change.type === 'dimensions')) {
      setNodeMeasurements(previous => {
        let next = previous;
        for (const change of changes) {
          if (change.type !== 'dimensions' || !change.dimensions) continue;
          const current = previous.get(change.id);
          if (current?.width === change.dimensions.width && current?.height === change.dimensions.height) continue;
          if (next === previous) next = new Map(previous);
          next.set(change.id, change.dimensions);
        }
        return next;
      });
    }
    if (!changes.some(change => change.type === 'position' && change.position)) return;
    if (draggingRef.current) {
      for (const change of changes) if (change.type === 'position' && change.position) livePositionsRef.current = { ...livePositionsRef.current, [change.id]: change.position };
      if (dragFrame.current === null) dragFrame.current = requestAnimationFrame(() => {
        dragFrame.current = null; setLivePositions({ ...livePositionsRef.current });
      });
      return;
    }
    setDoc(previous => {
      const positions = { ...previous.positions }; let changed = false;
      for (const change of changes) if (change.type === 'position' && change.position) {
        const current = Object.hasOwn(positions, change.id) ? positions[change.id] : undefined;
        if (current?.x === change.position.x && current?.y === change.position.y) continue;
        Object.defineProperty(positions, change.id, { value: change.position, enumerable: true, writable: true, configurable: true });
        changed = true;
      }
      return changed ? { ...previous, positions } : previous;
    });
  }, []);

  const onNodeDragStart = useCallback(() => { draggingRef.current = true; setDragging(true); }, []);
  const onNodeDragStop = useCallback((_: unknown, node: TableFlowNode) => {
    if (dragFrame.current !== null) { cancelAnimationFrame(dragFrame.current); dragFrame.current = null; }
    const updates = { ...livePositionsRef.current, [node.id]: node.position };
    draggingRef.current = false; livePositionsRef.current = {}; setLivePositions(null); setDragging(false);
    setDoc(previous => ({ ...previous, positions: { ...previous.positions, ...Object.fromEntries(Object.entries(updates).filter(([id]) => previous.schema.tables.some(t => t.name === id))) } }));
  }, []);

  const onConnect = useCallback((connection: Connection) => {
    if (!canEdit || !connection.sourceHandle || !connection.targetHandle) return;
    commit({ ...schema, relations: [...schema.relations, {
      fromTable: connection.source!, fromColumn: connection.sourceHandle.slice(4),
      toTable: connection.target!, toColumn: connection.targetHandle.slice(3), kind: '>',
    }] });
  }, [canEdit, schema, commit]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: TableFlowNode) => { setSelected(node.id); setSelectedEdge(null); }, []);
  const onNodeDoubleClick = useCallback((_: React.MouseEvent, node: TableFlowNode) => { if (canEdit) setEditing(node.id); }, [canEdit]);
  const onPaneClick = useCallback(() => { setSelected(null); setSelectedEdge(null); }, []);
  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => { setSelectedEdge(edge.id); setSelected(null); }, []);
  const onEdgeMouseEnter = useCallback((_: React.MouseEvent, edge: Edge) => setHoveredEdge(edge.id), []);
  const onEdgeMouseLeave = useCallback((_: React.MouseEvent, edge: Edge) => setHoveredEdge(current => current === edge.id ? null : current), []);
  const closeAppearance = useCallback(() => setSelected(null), []);
  const changeTableColor = useCallback((name: string, color: string | null) => {
    if (color !== null && !/^#[0-9a-f]{6}$/i.test(color)) return;
    setDoc(previous => {
      if (!previous.schema.tables.some(t => t.name === name)) return previous;
      const tableColors = { ...previous.tableColors };
      if (color === null) delete tableColors[name];
      else Object.defineProperty(tableColors, name, { value: color.toLowerCase(), enumerable: true, writable: true, configurable: true });
      return { ...previous, tableColors };
    });
  }, []);

  async function autoLayout(algorithm: LayoutAlgorithm) {
    const job = ++layoutJob.current;
    const snapshot = schema;
    setBusy(true);
    try {
      const positions = await layoutSchema(snapshot, algorithm);
      if (job !== layoutJob.current) return;
      setDoc(previous => previous.schema === snapshot ? { ...previous, positions, layoutAlgorithm: algorithm } : previous);
      setTimeout(() => { if (job === layoutJob.current) void fitView({ padding: 0.18, duration: 350 }); }, 60);
    } catch { setNotice('จัดตำแหน่งไม่สำเร็จ ลองใหม่อีกครั้ง'); }
    finally { if (job === layoutJob.current) setBusy(false); }
  }

  function addTable() {
    let n = schema.tables.length + 1;
    while (schema.tables.some(t => t.name === `table_${n}`)) n++;
    const name = `table_${n}`;
    if (commit({ ...schema, tables: [...schema.tables, { name, columns: [{ name: 'id', type: 'uuid', pk: true, notNull: false, unique: false }] }] })) {
      setSelected(name); setEditing(name);
    }
  }

  function saveTable(table: Table) {
    const old = schema.tables.find(t => t.name === editing);
    if (!old) return;
    const next = { ...schema,
      tables: schema.tables.map(t => t.name === old.name ? table : t),
      relations: schema.relations.filter(r => (r.fromTable !== old.name || table.columns.some(c => c.name === r.fromColumn)) && (r.toTable !== old.name || table.columns.some(c => c.name === r.toColumn)))
        .map(r => ({ ...r, fromTable: r.fromTable === old.name ? table.name : r.fromTable, toTable: r.toTable === old.name ? table.name : r.toTable })),
    };
    const positions = { ...doc.positions };
    if (old.name !== table.name) {
      delete positions[old.name];
      if (Object.hasOwn(doc.positions, old.name)) Object.defineProperty(positions, table.name, { value: doc.positions[old.name], enumerable: true, writable: true, configurable: true });
    }
    const tableColors = renameTableColor(doc.tableColors, old.name, table.name);
    if (commit(next, positions, tableColors, renameWorkflowTable(doc.workflow, old.name, table.name))) { setEditing(null); setSelected(table.name); }
  }

  function deleteTable() {
    if (!selected) return;
    const positions = { ...doc.positions }; delete positions[selected];
    const tableColors = { ...doc.tableColors }; delete tableColors[selected];
    if (commit({ ...schema, tables: schema.tables.filter(t => t.name !== selected), relations: schema.relations.filter(r => r.fromTable !== selected && r.toTable !== selected) }, positions, tableColors)) setSelected(null);
  }

  // Clears transient canvas state before another document replaces the current one.
  function resetView() {
    ++layoutJob.current; setBusy(false);
    if (dragFrame.current !== null) { cancelAnimationFrame(dragFrame.current); dragFrame.current = null; }
    draggingRef.current = false; livePositionsRef.current = {}; setLivePositions(null); setDragging(false);
    setSelected(null); setSelectedEdge(null); setHoveredEdge(null); setEditing(null);
    initialFitDone.current = false;
  }
  // Writes the current document immediately so switching never loses the last 400 ms of edits.
  function flushActive(): boolean {
    try { persistActive(docRef.current); return true; }
    catch { setNotice('บันทึกโปรเจกต์ปัจจุบันไม่ได้ จึงยังไม่สลับโปรเจกต์ กรุณาดาวน์โหลดโปรเจกต์เก็บไว้ก่อน'); return false; }
  }
  function openProject(id: string) {
    if (id === projectsRef.current.activeId || !flushActive()) return;
    const next = readProjectDocument(id);
    resetView(); updateProjects(index => ({ ...index, activeId: id })); setDoc(next);
  }
  function addProject(name: string, next: DocumentState): boolean {
    if (!flushActive()) return false;
    const id = newProjectId();
    try { writeProjectDocument(id, next); }
    catch { setNotice('พื้นที่เก็บข้อมูลของเบราว์เซอร์เต็ม สร้างโปรเจกต์ใหม่ไม่ได้'); return false; }
    resetView();
    updateProjects(index => ({ ...index, activeId: id, projects: [...index.projects, projectMeta(id, uniqueProjectName(index, name), next)] }));
    setDoc(next);
    return true;
  }
  function createProject(kind: 'blank' | 'sample') {
    if (addProject(kind === 'blank' ? 'โปรเจกต์ใหม่' : 'ตัวอย่าง StoreFront', kind === 'blank' ? blankDocument() : sampleDocument())) setNotice('สร้างโปรเจกต์ใหม่แล้ว');
  }
  function duplicateProject(id: string) {
    const source = projectsRef.current.projects.find(p => p.id === id);
    if (!source) return;
    const copy = id === projectsRef.current.activeId ? docRef.current : readProjectDocument(id);
    if (addProject(`${source.name} (สำเนา)`, copy)) setNotice(`ทำสำเนา “${source.name}” แล้ว`);
  }
  function renameProject(id: string, name: string) {
    updateProjects(index => ({ ...index, projects: index.projects.map(p => p.id === id ? { ...p, name: cleanProjectName(name) } : p) }));
  }
  function deleteProject(id: string) {
    const index = projectsRef.current;
    if (index.projects.length <= 1) return;
    const remaining = index.projects.filter(p => p.id !== id);
    if (id === index.activeId) {
      // Switch without saving the project being deleted.
      const nextId = remaining[0].id;
      resetView(); setDoc(readProjectDocument(nextId));
      updateProjects(current => ({ ...current, activeId: nextId, projects: current.projects.filter(p => p.id !== id) }));
    } else updateProjects(current => ({ ...current, projects: current.projects.filter(p => p.id !== id) }));
    try { removeProjectDocument(id); } catch { /* the index no longer references it */ }
    setNotice('ลบโปรเจกต์แล้ว');
  }

  async function shareProject() {
    const name = projectsRef.current.projects.find(p => p.id === projectsRef.current.activeId)?.name ?? 'My database';
    try {
      const url = `${window.location.origin}${window.location.pathname}${SHARE_HASH_PREFIX}${await encodeSharePayload(name, docRef.current)}`;
      if (url.length > MAX_SHARE_URL_LENGTH) { setNotice('โปรเจกต์ใหญ่เกินกว่าจะแชร์ผ่านลิงก์ กรุณากด “บันทึกโปรเจกต์” แล้วส่งไฟล์ .erd.json แทน'); return; }
      setNotice('กำลังเตรียมลิงก์แชร์…');
      const finalUrl = await shortenUrl(url);
      const isShort = finalUrl !== url;
      try {
        await navigator.clipboard.writeText(finalUrl);
        setNotice(isShort ? 'คัดลอกลิงก์สั้นแล้ว! นำไปส่งแชร์ได้ทันที' : 'คัดลอกลิงก์แชร์แล้ว · ผู้รับจะได้สำเนาของโปรเจกต์ ณ ตอนนี้');
      } catch {
        window.prompt('คัดลอกลิงก์นี้เพื่อแชร์', finalUrl);
      }
    } catch { setNotice('สร้างลิงก์แชร์ไม่สำเร็จ'); }
  }

  // Opening a #share= link imports a copy as a new local project, then clears the hash.
  useEffect(() => {
    let cancelled = false;
    function importFromHash() {
      const payload = readShareHash(window.location.hash);
      if (!payload) return;
      const clearHash = () => window.history.replaceState(null, '', window.location.pathname + window.location.search);
      void decodeSharePayload(payload).then(({ name, doc: shared }) => {
        if (cancelled) return;
        clearHash();
        if (addProject(name, shared)) setNotice(`เปิดโปรเจกต์ที่แชร์มา “${name}” แล้ว · บันทึกเป็นโปรเจกต์ใหม่ในเครื่องนี้`);
      }).catch(() => { if (!cancelled) { clearHash(); setNotice('ลิงก์แชร์ไม่ถูกต้องหรือข้อมูลไม่ครบ'); } });
    }
    importFromHash();
    window.addEventListener('hashchange', importFromHash);
    return () => { cancelled = true; window.removeEventListener('hashchange', importFromHash); };
    // addProject reads refs, so the listener does not need to be re-registered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('รองรับไฟล์ขนาดไม่เกิน 2 MB');
      const text = await file.text();
      const next = file.name.toLowerCase().endsWith('.json') ? importProject(text) : documentFromSource(text);
      resetView();
      initialFitDone.current = true;
      setDoc(next);
      setNotice('เปิดไฟล์แล้ว');
      setTimeout(() => void fitView({ padding: 0.18, duration: 300 }), 100);
    } catch (error) { setNotice(`เปิดไฟล์ไม่ได้: ${(error as Error).message}`); }
  }

  function focusTable(name: string) {
    setSelected(name); setSelectedEdge(null);
    const node = getNode(name);
    if (node) void setCenter(node.position.x + 135, node.position.y + (node.measured?.height ?? 200) / 2, { zoom: 1, duration: 350 });
  }

  const columnCount = schema.tables.reduce((n, t) => n + t.columns.length, 0);
  const editingTable = schema.tables.find(t => t.name === editing);
  const selectedIndex = schema.tables.findIndex(t => t.name === selected);
  const activeName = projects.projects.find(p => p.id === projects.activeId)?.name ?? 'My database';
  return <div className="app-shell">
    <header className="app-header">
      <a className="brand" href="./" aria-label="Schema Studio"><span className="brand-icon"><Workflow size={22} /></span><span>schema<span className="brand-light">studio</span><small>DATABASE DESIGN WORKSPACE</small></span></a>
      <div className="project-name"><span className="header-divider" /><span className="workspace-label">Workspace</span><ChevronRight size={13} className="workspace-label" /><ProjectMenu projects={projects} onOpen={openProject} onCreate={createProject} onRename={renameProject} onDuplicate={duplicateProject} onDelete={deleteProject} /><span className="local-badge">LOCAL</span></div>
      <div className="view-tabs" aria-label="ชนิดแผนภาพ"><button aria-pressed={view === 'er'} onClick={() => setView('er')}><Database size={15} />ER Diagram</button><button aria-pressed={view === 'flow'} onClick={() => setView('flow')}><Workflow size={15} />Flowchart</button></div>
      <div className="header-actions">{legacyBackup && <button className="icon-button" aria-label="ดาวน์โหลดสำรองก่อนอัปเดต" title="ดาวน์โหลดสำรองก่อนอัปเดต" onClick={() => saveFile('before-flowchart.erd.json', legacyBackup, 'application/json')}><Archive size={18} /></button>}<span className={`save-state ${saved ? '' : 'pending'}`}><span />{saved ? 'บันทึกในเครื่องแล้ว' : 'กำลังบันทึก…'}</span><button className="icon-button" aria-label="วิธีใช้งาน" title="วิธีใช้งาน" onClick={() => setHelp(true)}><CircleHelp size={19} /></button></div>
    </header>

    <div className="workspace-toolbar">
      {view === 'er' ? <div className="mode-switch" aria-label="โหมดการทำงาน"><button aria-pressed={mode === 'code'} className={mode === 'code' ? 'active' : ''} onClick={() => setMode('code')}><Code2 size={16} />Code Editor</button><button aria-pressed={mode === 'visual'} className={mode === 'visual' ? 'active' : ''} onClick={() => setMode('visual')}><MousePointer2 size={15} />Visual Designer</button></div> : <div className="flow-toolbar-label"><Workflow size={17} /><strong>Business Flowchart</strong><span>{doc.workflow.nodes.length} ขั้นตอน · อ้างอิง {schema.tables.length} ตาราง ER</span></div>}
      <div className="toolbar-actions">{view === 'er' && <><ArrangeMenu algorithm={doc.layoutAlgorithm} busy={busy} disabled={!schema.tables.length} onSelect={algorithm => void autoLayout(algorithm)} /><span className="toolbar-divider" /></>}<button className="button subtle" onClick={() => fileInput.current?.click()}><Upload size={15} /><span>เปิดไฟล์</span></button><button className="button subtle share-button" title="คัดลอกลิงก์ที่มีตารางและ Flowchart ของโปรเจกต์นี้" onClick={() => void shareProject()}><Share2 size={15} /><span>แชร์ลิงก์</span></button><button className="button export-button" onClick={() => saveFile(projectFileName(activeName, '.erd.json'), JSON.stringify(projectFile(doc), null, 2), 'application/json')}><Download size={15} /><span>บันทึกโปรเจกต์</span></button></div>
      <input ref={fileInput} type="file" hidden accept=".dbml,.json,.txt" onChange={event => { void loadFile(event.target.files?.[0]); event.target.value = ''; }} />
    </div>

    {view === 'flow' ? <ReactFlowProvider><FlowEditor schema={schema} workflow={doc.workflow} onChange={updateWorkflow} onOpenTable={name => { setView('er'); setMode('visual'); setSelected(name); setTimeout(() => focusTable(name), 120); }} /></ReactFlowProvider> : <main className="workspace">
      <aside className="sidebar">
        {mode === 'code' ? <>
          <div className="pane-header"><div><Code2 size={15} /><span>schema.dbml</span></div><span className="pane-tag">DBML SUBSET</span></div>
          <div className="editor-intro"><span className="tiny-dot" /> เขียนโครงสร้าง แล้วดู Diagram ได้ทันที</div>
          <div className="code-editor"><SchemaEditor source={doc.source} onChange={updateSource} /></div>
          <div className={`editor-status ${doc.error ? 'error' : ''}`} role="status">{doc.error ? <AlertCircle size={15} /> : <Check size={15} />}<span>{doc.error ?? 'โครงสร้างถูกต้อง พร้อมใช้งาน'}</span></div>
          <button className="download-code" onClick={() => saveFile(projectFileName(activeName, '.dbml'), doc.source)}><Download size={14} />ดาวน์โหลดโค้ด .dbml<ChevronRight size={14} /></button>
        </> : <>
          <div className="pane-header"><div><Database size={15} /><span>โครงสร้างฐานข้อมูล</span></div><span className="count-badge">{schema.tables.length}</span></div>
          <div className="visual-intro"><h2>ออกแบบด้วยการลาก</h2><p>ลากที่ชื่อตารางเพื่อย้ายตำแหน่ง<br />ลากจุดขวาของคอลัมน์ไปยังจุดซ้ายของคอลัมน์ที่อ้างอิง</p></div>
          {doc.error && <div className="visual-warning">โค้ดมีข้อผิดพลาด กรุณากลับไปแก้ใน Code Editor เพื่อเปิดการแก้ไขโครงสร้าง</div>}
          <div className="table-list">{schema.tables.map((t, i) => <button className={selected === t.name ? 'selected' : ''} onClick={() => focusTable(t.name)} key={t.name}><span className="list-table-icon" style={{ color: tableColor(doc.tableColors, t.name, i) }}><Table2 size={16} /></span><span><strong>{t.name}</strong><small>{t.columns.length} คอลัมน์</small></span><ChevronRight size={15} /></button>)}{!schema.tables.length && <p className="muted">เริ่มออกแบบโดยเพิ่มตารางแรก</p>}</div>
          <button className="button primary add-table" disabled={!canEdit} onClick={addTable}><Plus size={16} />เพิ่มตาราง</button>
          {selected && <div className="selection-card"><span className="eyebrow">SELECTED TABLE</span><strong>{selected}</strong><div><button className="button" disabled={!canEdit} onClick={() => setEditing(selected)}><Pencil size={14} />แก้ไข</button><button className="button danger" disabled={!canEdit} onClick={deleteTable}><Trash2 size={14} />ลบตาราง</button></div><small>ลบตารางจะลบความสัมพันธ์ที่อ้างถึงด้วย</small></div>}
          <div className="sidebar-tip"><Link2 size={17} /><div><strong>เชื่อมความสัมพันธ์</strong><p>ลากจาก Foreign key ไปยังคอลัมน์ปลายทาง เพื่อสร้าง N : 1</p></div></div>
        </>}
      </aside>

      <section className="canvas" aria-label="พื้นที่ ER Diagram" data-routing={routingPending ? 'pending' : 'ready'} data-dragging={dragging}>
        <div className="canvas-heading"><span className="canvas-label">ER DIAGRAM</span><span className={`live-indicator ${doc.error ? 'preview-paused' : ''}`}><span />{doc.error ? 'PREVIEW PAUSED' : 'LIVE PREVIEW'}</span></div>
        {doc.error && <div className="stale-preview" role="status"><AlertCircle size={17} /><div><strong>โค้ดมีข้อผิดพลาด — ภาพนี้เป็นโครงสร้างล่าสุดที่อ่านสำเร็จ</strong><span>{doc.error}</span></div></div>}
        <ReactFlow<TableFlowNode, RelationshipFlowEdge> nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onNodesChange={onNodesChange} onNodeDragStart={onNodeDragStart} onNodeDragStop={onNodeDragStop} onConnect={onConnect} onNodeClick={onNodeClick} onNodeDoubleClick={onNodeDoubleClick} onPaneClick={onPaneClick} onEdgeClick={onEdgeClick} onEdgeMouseEnter={onEdgeMouseEnter} onEdgeMouseLeave={onEdgeMouseLeave} nodesConnectable={canEdit} deleteKeyCode={null} fitView fitViewOptions={fitViewOptions} minZoom={0.05} maxZoom={1.8} colorMode="dark" proOptions={proOptions} onlyRenderVisibleElements={false}>
          <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#2c3a43" />
          <Controls position="bottom-left" showInteractive={false} />
          <MiniMap position="bottom-right" pannable zoomable nodeColor="#334c50" nodeStrokeColor="#6b9c91" maskColor="rgba(13, 23, 29, 0.7)" />
        </ReactFlow>
        <button className="button fit-button" onClick={() => void fitView({ padding: 0.18, duration: 350 })}><Maximize size={14} />พอดีหน้าจอ</button>
        {(dragging || routingPending) && <div className="routing-progress" role="status">{dragging ? 'กำลังย้ายตาราง · จัดเส้นละเอียดเมื่อปล่อย' : 'กำลังจัดเส้นทาง…'}</div>}
        {selected !== null && selectedIndex >= 0 && <TableAppearance name={selected} color={tableColor(doc.tableColors, selected, selectedIndex)} onChange={changeTableColor} onClose={closeAppearance} />}
        {blockedRoutes > 0 && <div className="routing-notice" role="status"><AlertCircle size={15} /><span>มีตารางอยู่ชิดหรือซ้อนกัน จึงเดินเส้น {blockedRoutes} เส้นไม่ได้</span><button className="text-button" disabled={busy} onClick={() => void autoLayout(doc.layoutAlgorithm)}>จัดตำแหน่งใหม่</button></div>}
        {!schema.tables.length && <div className="empty-state"><Database size={36} /><h2>พื้นที่สำหรับไอเดียถัดไป</h2><p>{mode === 'code' ? 'เขียน Table ในตัวแก้ไขโค้ดเพื่อเริ่มต้น' : 'เพิ่มตารางแรก แล้วค่อยเชื่อมความสัมพันธ์'}</p></div>}
        {selectedEdge && <div className="edge-selection"><Link2 size={15} /><span>{selectedEdge}</span><button className="icon-button danger" title="ลบความสัมพันธ์" aria-label="ลบความสัมพันธ์" disabled={!canEdit} onClick={() => { if (commit({ ...schema, relations: schema.relations.filter(r => relationId(r) !== selectedEdge) })) setSelectedEdge(null); }}><Trash2 size={16} /></button><button className="icon-button" aria-label="ปิดการเลือก" onClick={() => setSelectedEdge(null)}><X size={15} /></button></div>}
        <div className="canvas-hint"><MousePointer2 size={12} />ลากพื้นที่ว่างเพื่อเลื่อน · เลื่อนล้อเมาส์เพื่อซูม</div>
      </section>
    </main>}

    <footer className="status-bar"><div><span><Table2 size={13} /><b>{schema.tables.length}</b> ตาราง ER</span>{view === 'er' ? <><span><span className="status-dot" /><b>{columnCount}</b> คอลัมน์</span><span><Link2 size={13} /><b>{schema.relations.length}</b> ความสัมพันธ์</span></> : <><span><Workflow size={13} /><b>{doc.workflow.nodes.length}</b> ขั้นตอน</span><span><Link2 size={13} /><b>{doc.workflow.edges.length}</b> เส้นทาง</span></>}</div><span><HardDrive size={12} />ข้อมูลอยู่ในเบราว์เซอร์เครื่องนี้</span></footer>
    {notice && <div className="toast" role="status"><AlertCircle size={16} /><span>{notice}</span><button className="icon-button" onClick={() => setNotice('')} aria-label="ปิดข้อความ"><X size={14} /></button></div>}
    {editingTable && <TableEditor key={editingTable.name} table={editingTable} onSave={saveTable} onClose={() => setEditing(null)} />}
    {help && <div className="modal-backdrop"><section className="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title">
      <button className="icon-button help-close" onClick={() => setHelp(false)} aria-label="ปิด"><X size={20} /></button>
      <p className="eyebrow">GETTING STARTED</p><h2 id="help-title">จากโครงสร้าง สู่ภาพรวม</h2>
      <p>Code Editor ใช้ DBML subset หนึ่งคำสั่งต่อบรรทัด</p>
      <pre>{'Table users {\n  id int [pk, increment]\n  email varchar(255) [unique, not null]\n}\n\nTable posts {\n  id int [pk, increment]\n  user_id int [ref: > users.id]\n}'}</pre>
      <ul>
        <li>รองรับ Table, Enum, indexes และ flags: pk, unique, not null, increment</li>
        <li>ความสัมพันธ์: &gt; หลายต่อหนึ่ง, &lt; หนึ่งต่อหลาย, - หนึ่งต่อหนึ่ง, &lt;&gt; หลายต่อหลาย และ ? สำหรับ optional</li>
        <li>รองรับ inline ref และ Ref: ที่อ้างชื่อใน double quotes เช่น "users"."id"</li>
        <li>Visual Designer: เพิ่มตาราง ดับเบิลคลิกตารางเพื่อแก้ไข และลากจุดเพื่อเชื่อมคอลัมน์</li>
        <li>คลิกตารางแล้วเลือกสีหัวตารางและกรอบจากแผงสีมุมขวา ใช้ได้ทั้งสองโหมด สีบันทึกในโปรเจกต์ JSON</li>
        <li>คลิกเส้นแล้วกดถังขยะเพื่อลบความสัมพันธ์ในโหมด Visual</li>
        <li>ลากตารางแล้วเส้นจะตามคอลัมน์และสลับด้านเชื่อมให้อัตโนมัติ</li>
        <li>เส้นเดินหลบตารางผ่านช่องว่าง ชี้เมาส์ที่เส้นเพื่อให้เส้นวิ่งและแสดงอัตราความสัมพันธ์</li>
        <li>เลือกจัดตำแหน่งได้ 5 แบบ: Left-right, Pipeline, Snowflake, Compact และ Flowchart ซ้าย → ขวา จากเมนูจัดตำแหน่ง</li>
        <li>ป้าย 1 / N ที่ปลายเส้นบอกความสัมพันธ์ของตารางฝั่งนั้น; 0..1 / 0..N หมายถึงไม่จำเป็นต้องมีข้อมูลสัมพันธ์</li>
        <li>บันทึกโปรเจกต์เป็น JSON เก็บทั้งโค้ดและตำแหน่ง นำกลับเข้าด้วย “เปิดไฟล์”</li>
        <li>หลายโปรเจกต์: กดชื่อโปรเจกต์ด้านบนเพื่อสลับ สร้างใหม่ เปลี่ยนชื่อ ทำสำเนา หรือลบ ทุกโปรเจกต์เก็บในเบราว์เซอร์เครื่องนี้</li>
        <li>แชร์ลิงก์: คัดลอกลิงก์ที่บรรจุตาราง ตำแหน่ง สี และ Flowchart ผู้รับเปิดแล้วได้สำเนาเป็นโปรเจกต์ใหม่ (แก้ต่อแล้วต้องแชร์ลิงก์ใหม่)</li>
        <li>Flowchart: เพิ่มขั้นตอน/เงื่อนไข อ้างอิงตารางและคอลัมน์ ER แล้วลากเส้นกำหนดลำดับธุรกิจ บันทึกพร้อม ER ใน JSON เดียวกัน</li>
      </ul>
      <p className="muted">Visual จะจัดรูปแบบโค้ดใหม่และนำคอมเมนต์ออก โดยคง increment, Enum, indexes และความสัมพันธ์แบบ optional ไว้ แก้ข้อมูลเหล่านี้ใน Code Editor ยังไม่รองรับ DBML เต็มรูปแบบ เช่น Note, default, schema namespace และ composite foreign keys และยังไม่ตรวจสอบชนิดข้อมูลระหว่าง Foreign key กับปลายทาง</p>
      <button className="button primary" onClick={() => setHelp(false)}>เริ่มออกแบบ</button>
    </section></div>}
  </div>;
}
