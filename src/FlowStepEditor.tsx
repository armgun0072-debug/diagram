import { useState } from 'react';
import { ExternalLink, Save, Trash2 } from 'lucide-react';
import type { Schema } from './schema';
import { referenceIssues, STEP_LABELS, type FlowStep } from './workflow';

export default function FlowStepEditor({ step, schema, onSave, onDelete, onOpenTable }: {
  step: FlowStep; schema: Schema; onSave: (step: FlowStep) => void; onDelete: () => void; onOpenTable: (name: string) => void;
}) {
  const [draft, setDraft] = useState(step);
  const table = schema.tables.find(t => t.name === draft.tableRef);
  const field = table?.columns.find(c => c.name === draft.fieldRef);
  const enumDefinition = schema.enums?.find(e => e.name === field?.type);
  const issues = referenceIssues(draft, schema);
  return <form className="flow-step-editor" onSubmit={e => { e.preventDefault(); onSave(draft); }}>
    <p className="eyebrow">{STEP_LABELS[step.kind]} · EDIT STEP</p>
    <label>ชื่อขั้นตอน<input aria-label="ชื่อขั้นตอน" required maxLength={160} value={draft.label} onChange={e => setDraft(d => ({ ...d, label: e.target.value }))} /></label>
    <label>รายละเอียด / เงื่อนไข<textarea aria-label="รายละเอียดขั้นตอน" maxLength={3000} rows={3} value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} placeholder="เช่น ตรวจว่าผู้ใช้ยืนยันข้อตกลงแล้วหรือไม่" /></label>
    <label>อ้างอิงตาราง ER<select aria-label="อ้างอิงตาราง ER" value={draft.tableRef} onChange={e => setDraft(d => ({ ...d, tableRef: e.target.value, fieldRef: '' }))}>
      <option value="">ไม่อ้างอิงตาราง</option>{draft.tableRef && !table && <option value={draft.tableRef}>{draft.tableRef} (ไม่พบ)</option>}
      {schema.tables.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
    </select></label>
    {table && <label>คอลัมน์ที่เกี่ยวข้อง<select aria-label="คอลัมน์ที่เกี่ยวข้อง" value={draft.fieldRef} onChange={e => setDraft(d => ({ ...d, fieldRef: e.target.value }))}>
      <option value="">ทั้งตาราง</option>{draft.fieldRef && !field && <option value={draft.fieldRef}>{draft.fieldRef} (ไม่พบ)</option>}
      {table.columns.map(c => <option key={c.name} value={c.name}>{c.name} · {c.type}</option>)}
    </select></label>}
    {enumDefinition && <div className="flow-enum-hint"><strong>{enumDefinition.name}</strong><span>{enumDefinition.values.join(' · ')}</span><small>ใช้ค่าจาก ER ประกอบเงื่อนไข โดยกำหนดลำดับการเปลี่ยนสถานะเอง</small></div>}
    {issues.map(issue => <p className="flow-warning" key={issue}>{issue} — เลือกตาราง/คอลัมน์ใหม่ได้ โดยขั้นตอนเดิมยังคงอยู่</p>)}
    <div className="flow-editor-actions"><button className="button primary" type="submit"><Save size={14} />บันทึกขั้นตอน</button><button className="icon-button danger" type="button" aria-label="ลบขั้นตอน" onClick={onDelete}><Trash2 size={15} /></button></div>
    {table && <button type="button" className="text-button" onClick={() => onOpenTable(table.name)}><ExternalLink size={13} />เปิดตารางนี้ใน ER</button>}
  </form>;
}
