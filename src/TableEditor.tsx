import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import type { Table } from './schema';

export default function TableEditor({ table, onSave, onClose }: { table: Table; onSave: (table: Table) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<Table>(() => structuredClone(table));
  function patch(index: number, values: Partial<Table['columns'][number]>) {
    setDraft(t => ({ ...t, columns: t.columns.map((c, i) => i === index ? { ...c, ...values } : c) }));
  }
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="table-editor" role="dialog" aria-modal="true" aria-labelledby="edit-title" onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
      <header><div><p className="eyebrow">TABLE DESIGNER</p><h2 id="edit-title">แก้ไขตาราง</h2></div><button className="icon-button" onClick={onClose} aria-label="ปิด"><X size={20} /></button></header>
      <form onSubmit={e => { e.preventDefault(); onSave(draft); }}>
        <label className="field-label" htmlFor="table-name">ชื่อตาราง</label>
        <input id="table-name" autoFocus required pattern="[A-Za-z_][A-Za-z0-9_]*" value={draft.name} onChange={e => setDraft(t => ({ ...t, name: e.target.value }))} />
        <div className="column-form-head"><span>ชื่อคอลัมน์</span><span>ชนิดข้อมูล</span><span>PK</span><span>NN</span><span>UQ</span><span /></div>
        <div className="column-form-list">{draft.columns.map((col, i) => <div className="column-form" key={i}>
          <input aria-label={`ชื่อคอลัมน์ ${i + 1}`} required pattern="[A-Za-z_][A-Za-z0-9_]*" value={col.name} onChange={e => patch(i, { name: e.target.value })} />
          <input aria-label={`ชนิดข้อมูล ${i + 1}`} required value={col.type} onChange={e => patch(i, { type: e.target.value })} list="data-types" />
          <input type="checkbox" aria-label={`Primary key ${i + 1}`} checked={col.pk} onChange={e => patch(i, { pk: e.target.checked })} />
          <input type="checkbox" aria-label={`Not null ${i + 1}`} checked={col.notNull} onChange={e => patch(i, { notNull: e.target.checked })} />
          <input type="checkbox" aria-label={`Unique ${i + 1}`} checked={col.unique} onChange={e => patch(i, { unique: e.target.checked })} />
          <button type="button" className="icon-button danger" aria-label={`ลบคอลัมน์ ${i + 1}`} onClick={() => setDraft(t => ({ ...t, columns: t.columns.filter((_, n) => n !== i) }))}><Trash2 size={14} /></button>
        </div>)}</div>
        <datalist id="data-types">{['uuid', 'integer', 'varchar(255)', 'text', 'boolean', 'timestamp', 'decimal(10,2)'].map(t => <option key={t} value={t} />)}</datalist>
        <button type="button" className="text-button add-column" onClick={() => setDraft(t => { let n = t.columns.length + 1; while (t.columns.some(c => c.name === `column_${n}`)) n++; return { ...t, columns: [...t.columns, { name: `column_${n}`, type: 'varchar(255)', pk: false, notNull: false, unique: false }] }; })}><Plus size={15} />เพิ่มคอลัมน์</button>
        <p className="muted">PK = Primary key · NN = Not null · UQ = Unique<br />หากเปลี่ยนชื่อหรือลบคอลัมน์ ความสัมพันธ์ที่อ้างถึงคอลัมน์เดิมจะถูกลบ</p>
        <p className="muted table-metadata"><strong>ข้อมูล DBML ที่คงไว้</strong><br />increment, Enum และ indexes จะคงอยู่หลังบันทึกตาราง แก้ไขข้อมูลเหล่านี้ผ่าน Code Editor{draft.indexes?.length ? ` · ตารางนี้มี ${draft.indexes.length} indexes หากลบหรือเปลี่ยนชื่อคอลัมน์ที่อยู่ใน index ให้แก้ index ในโค้ดก่อน` : ''}</p>
        <footer><button type="button" className="button" onClick={onClose}>ยกเลิก</button><button className="button primary" type="submit">บันทึกตาราง</button></footer>
      </form>
    </section>
  </div>;
}
