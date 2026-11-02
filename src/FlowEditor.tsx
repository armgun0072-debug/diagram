import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlow, Background, BackgroundVariant, Controls, MiniMap, MarkerType, applyNodeChanges, useReactFlow, type Connection, type Edge, type NodeChange } from '@xyflow/react';
import { CirclePlay, CircleStop, GitBranch, LayoutGrid, Link2, Plus, Square, Table2, Trash2, Workflow as WorkflowIcon } from 'lucide-react';
import type { Schema } from './schema';
import FlowStepNode, { type FlowStepFlowNode } from './FlowStepNode';
import FlowStepEditor from './FlowStepEditor';
import { newFlowStep, referenceIssues, STEP_KINDS, STEP_LABELS, validateWorkflow, type FlowStep, type StepKind, type Workflow } from './workflow';
import { arrangeWorkflow } from './workflowLayout';

const nodeTypes = { flowStep: FlowStepNode };
const icons = { start: CirclePlay, process: Square, decision: GitBranch, end: CircleStop };
const fitOptions = { padding: .2 };
const proOptions = { hideAttribution: false };

export default function FlowEditor({ schema, workflow, onChange, onOpenTable }: {
  schema: Schema; workflow: Workflow; onChange: (workflow: Workflow) => void; onOpenTable: (name: string) => void;
}) {
  const [nodes, setNodes] = useState<FlowStepFlowNode[]>([]);
  const [selected, setSelected] = useState<string | null>(null), [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null), [notice, setNotice] = useState('');
  const [seedOpen, setSeedOpen] = useState(false), [seedTables, setSeedTables] = useState<string[]>([]);
  const [edgeLabel, setEdgeLabel] = useState(''), [busy, setBusy] = useState(false);
  const current = useRef(workflow); current.current = workflow;
  const dragging = useRef(false), layoutJob = useRef(0), firstFit = useRef(false);
  const { fitView } = useReactFlow<FlowStepFlowNode>();

  useEffect(() => {
    setNodes(previous => workflow.nodes.map(step => {
      const old = previous.find(n => n.id === step.id), issues = referenceIssues(step, schema);
      const data = old?.data.step === step && old.data.issues.join() === issues.join() ? old.data : { step, issues };
      return { ...old, id: step.id, type: 'flowStep', position: dragging.current && old ? old.position : step.position, data };
    }));
  }, [workflow.nodes, schema]);
  useEffect(() => {
    if (firstFit.current || !nodes.length || nodes.some(n => !n.measured?.width)) return;
    const id = requestAnimationFrame(() => { firstFit.current = true; void fitView({ padding: .2 }); });
    return () => cancelAnimationFrame(id);
  }, [nodes, fitView]);
  useEffect(() => { const edge = workflow.edges.find(e => e.id === selectedEdge); setEdgeLabel(edge?.label ?? ''); }, [selectedEdge, workflow.edges]);
  useEffect(() => { if (!notice) return; const id = setTimeout(() => setNotice(''), 5000); return () => clearTimeout(id); }, [notice]);
  useEffect(() => () => { layoutJob.current++; }, []);

  const commit = useCallback((next: Workflow) => {
    try { validateWorkflow(next); onChange(next); return true; }
    catch (error) { setNotice((error as Error).message); return false; }
  }, [onChange]);
  const onNodesChange = useCallback((changes: NodeChange<FlowStepFlowNode>[]) => setNodes(previous => applyNodeChanges(changes, previous)), []);
  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return;
    const sourceHandle = connection.sourceHandle ?? 'out';
    commit({ ...current.current, edges: [...current.current.edges, { id: crypto.randomUUID(), source: connection.source, target: connection.target, sourceHandle, label: sourceHandle === 'yes' ? 'ใช่' : sourceHandle === 'no' ? 'ไม่ใช่' : '' }] });
  }, [commit]);
  const edges = useMemo<Edge[]>(() => workflow.edges.map(edge => ({
    ...edge, targetHandle: 'in', type: 'smoothstep', selected: selectedEdge === edge.id,
    className: hovered === edge.id ? 'relationship-hovered' : '', zIndex: hovered === edge.id ? 20 : 0,
    markerEnd: { type: MarkerType.ArrowClosed, color: hovered === edge.id ? '#6dddb3' : '#8da9b9' },
    style: { stroke: hovered === edge.id ? '#6dddb3' : '#8da9b9', strokeWidth: 1.7 },
    labelStyle: { fill: '#d5e7e7', fontSize: 12 }, labelBgStyle: { fill: '#152b32' }, labelBgPadding: [7, 4], labelBgBorderRadius: 4,
  })), [workflow.edges, selectedEdge, hovered]);
  const step = workflow.nodes.find(n => n.id === selected);
  const link = workflow.edges.find(e => e.id === selectedEdge);
  const issueCount = workflow.nodes.filter(n => referenceIssues(n, schema).length).length;

  function add(kind: StepKind) {
    const node = newFlowStep(kind, workflow.nodes.length);
    if (commit({ ...workflow, nodes: [...workflow.nodes, node] })) setSelected(node.id);
  }
  function save(step: FlowStep) {
    if (commit({ ...workflow, nodes: workflow.nodes.map(n => n.id === step.id ? { ...step, position: n.position } : n) })) setNotice('บันทึกขั้นตอนแล้ว');
  }
  function removeStep() {
    if (!selected) return;
    if (commit({ nodes: workflow.nodes.filter(n => n.id !== selected), edges: workflow.edges.filter(e => e.source !== selected && e.target !== selected) })) setSelected(null);
  }
  async function arrange() {
    const job = ++layoutJob.current, snapshot = workflow; setBusy(true);
    try {
      const next = await arrangeWorkflow(snapshot);
      if (job !== layoutJob.current || current.current !== snapshot) return;
      commit(next); setTimeout(() => { if (job === layoutJob.current) void fitView({ padding: .2, duration: 300 }); }, 80);
    } catch { setNotice('จัด Flowchart ไม่สำเร็จ'); }
    finally { if (job === layoutJob.current) setBusy(false); }
  }
  function seed() {
    const names = seedTables.filter(name => schema.tables.some(t => t.name === name));
    if (!names.length) { setNotice('เลือกตารางอย่างน้อย 1 ตาราง'); return; }
    const added = names.map((name, i) => newFlowStep('process', workflow.nodes.length + i, name));
    if (commit({ ...workflow, nodes: [...workflow.nodes, ...added] })) {
      setSeedOpen(false); setSeedTables([]); setSelected(added[0].id);
      setNotice('สร้างขั้นตอนแล้ว ลากเส้นเพื่อกำหนดลำดับธุรกิจของคุณ');
      setTimeout(() => void fitView({ padding: .2, duration: 300 }), 80);
    }
  }
  return <main className="workspace flow-workspace">
    <aside className="sidebar flow-sidebar">
      <div className="pane-header"><div><WorkflowIcon size={16} /><span>Business Flowchart</span></div><span className="count-badge">{workflow.nodes.length}</span></div>
      <div className="flow-sidebar-scroll">
        <div className="flow-intro"><h2>ออกแบบขั้นตอนธุรกิจ</h2><p>อ้างอิงข้อมูลจาก ER แล้วกำหนดลำดับและเงื่อนไขของคุณ</p></div>
        <div className="flow-add-grid">{STEP_KINDS.map(kind => { const Icon = icons[kind]; return <button className="button" key={kind} onClick={() => add(kind)}><Icon size={15} />{STEP_LABELS[kind]}</button>; })}</div>
        <button className="button seed-flow" onClick={() => setSeedOpen(value => !value)} disabled={!schema.tables.length}><Table2 size={15} />สร้างขั้นตอนจากตาราง ER</button>
        {seedOpen && <section className="flow-seed"><p>เลือกตารางที่เกี่ยวข้อง ขั้นตอนที่สร้างยังไม่มีเส้นเชื่อม จนกว่าคุณจะกำหนดลำดับเอง</p><div className="seed-table-list">{schema.tables.map(t => <label key={t.name}><input type="checkbox" checked={seedTables.includes(t.name)} onChange={e => setSeedTables(previous => e.target.checked ? [...previous, t.name] : previous.filter(name => name !== t.name))} />{t.name}</label>)}</div><button className="button primary" onClick={seed}><Plus size={14} />สร้าง {seedTables.length} ขั้นตอน</button></section>}
        {step && <FlowStepEditor key={step.id} step={step} schema={schema} onSave={save} onDelete={removeStep} onOpenTable={onOpenTable} />}
        {link && <form className="flow-step-editor" onSubmit={e => { e.preventDefault(); commit({ ...workflow, edges: workflow.edges.map(edge => edge.id === link.id ? { ...edge, label: edgeLabel } : edge) }); }}><p className="eyebrow">CONNECTION</p><label>ข้อความ / เงื่อนไขบนเส้น<input aria-label="ข้อความบนเส้น Flowchart" maxLength={200} value={edgeLabel} onChange={e => setEdgeLabel(e.target.value)} /></label><div className="flow-editor-actions"><button className="button primary" type="submit">บันทึกเส้น</button><button className="icon-button danger" type="button" aria-label="ลบเส้น Flowchart" onClick={() => { if (commit({ ...workflow, edges: workflow.edges.filter(edge => edge.id !== link.id) })) setSelectedEdge(null); }}><Trash2 size={15} /></button></div></form>}
        {!step && !link && <div className="flow-instructions"><Link2 size={16} /><p>ลากจุดด้านล่างของขั้นตอนไปยังจุดด้านบนของขั้นตอนถัดไป<br />เงื่อนไขมีแขนง “ใช่” ทางขวา และ “ไม่ใช่” ทางซ้าย<br />คลิกกล่องหรือเส้นเพื่อแก้ไขรายละเอียด</p></div>}
        {issueCount > 0 && <p className="flow-warning">มี {issueCount} ขั้นตอนที่อ้างตาราง/คอลัมน์ที่ไม่พบ คลิกเพื่อเลือกข้อมูลใหม่ ขั้นตอนและเงื่อนไขเดิมยังคงอยู่</p>}
      </div>
    </aside>
    <section className="canvas flow-canvas" aria-label="พื้นที่ Business Flowchart">
      <div className="canvas-heading"><span className="canvas-label">BUSINESS FLOW</span><span className="live-indicator"><span />LINKED TO ER</span></div>
      <ReactFlow<FlowStepFlowNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onConnect={onConnect}
        onNodeClick={(_, node) => { setSelected(node.id); setSelectedEdge(null); }} onEdgeClick={(_, edge) => { setSelectedEdge(edge.id); setSelected(null); }} onPaneClick={() => { setSelected(null); setSelectedEdge(null); }}
        onNodeDragStart={() => { dragging.current = true; layoutJob.current++; setBusy(false); }}
        onNodeDragStop={(_, node) => { dragging.current = false; commit({ ...current.current, nodes: current.current.nodes.map(n => n.id === node.id ? { ...n, position: node.position } : n) }); }}
        onEdgeMouseEnter={(_, edge) => setHovered(edge.id)} onEdgeMouseLeave={() => setHovered(null)}
        deleteKeyCode={null} fitView fitViewOptions={fitOptions} minZoom={.15} maxZoom={1.8} colorMode="dark" proOptions={proOptions}>
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#2c3a43" /><Controls showInteractive={false} /><MiniMap nodeColor="#467d73" maskColor="rgba(13,23,29,.7)" />
      </ReactFlow>
      <div className="flow-canvas-actions"><button className="button" disabled={busy || !workflow.nodes.length} onClick={() => void arrange()}><LayoutGrid size={14} />{busy ? 'กำลังจัด…' : 'จัด Flowchart'}</button><button className="button" onClick={() => void fitView({ padding: .2, duration: 300 })}>พอดีหน้าจอ</button></div>
      {!workflow.nodes.length && <div className="empty-state flow-empty"><WorkflowIcon size={40} /><h2>จากข้อมูล สู่ขั้นตอนการทำงาน</h2><p>สร้าง Start → ขั้นตอน → เงื่อนไข → End<br />เชื่อมขั้นตอนกับตารางหรือคอลัมน์ใน ER ของคุณ</p><button className="button primary" disabled={!schema.tables.length} onClick={() => setSeedOpen(true)}>เลือกตาราง ER เพื่อเริ่มต้น</button></div>}
      {notice && <div className="flow-notice" role="status">{notice}</div>}
    </section>
  </main>;
}
