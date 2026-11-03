import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Copy, FilePlus2, FolderOpen, Pencil, Sparkles, Trash2, X } from 'lucide-react';
import type { ProjectIndex } from './storage';

type Props = {
  projects: ProjectIndex;
  onOpen: (id: string) => void;
  onCreate: (kind: 'blank' | 'sample') => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
};

function formatDate(time: number): string {
  if (!time) return '';
  try { return new Date(time).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return ''; }
}

export default function ProjectMenu({ projects, onOpen, onCreate, onRename, onDuplicate, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const active = projects.projects.find(p => p.id === projects.activeId) ?? projects.projects[0];

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) { setOpen(false); setRenaming(null); } };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { if (renaming) setRenaming(null); else setOpen(false); } };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onPointer); document.removeEventListener('keydown', onKey); };
  }, [open, renaming]);

  function startRename(id: string, name: string) { setRenaming(id); setDraft(name); }
  function finishRename() {
    if (renaming && draft.trim()) onRename(renaming, draft);
    setRenaming(null);
  }
  function choose(action: () => void) { action(); setOpen(false); setRenaming(null); }

  return <div className="project-menu" ref={root}>
    <button className="project-trigger" aria-haspopup="menu" aria-expanded={open} title="สลับหรือจัดการโปรเจกต์" onClick={() => setOpen(value => !value)}>
      <FolderOpen size={14} /><strong>{active?.name}</strong><ChevronDown size={13} />
    </button>
    {open && <div className="project-panel" role="menu">
      <div className="project-panel-title"><span>โปรเจกต์ในเบราว์เซอร์นี้</span><small>{projects.projects.length} โปรเจกต์</small></div>
      <div className="project-list">
        {projects.projects.map(p => <div key={p.id} className={`project-item ${p.id === projects.activeId ? 'active' : ''}`}>
          {renaming === p.id
            ? <form className="project-rename" onSubmit={event => { event.preventDefault(); finishRename(); }}>
                <input autoFocus value={draft} maxLength={60} aria-label="ชื่อโปรเจกต์" onChange={event => setDraft(event.target.value)} onFocus={event => event.target.select()} />
                <button type="submit" className="icon-button" aria-label="บันทึกชื่อ"><Check size={14} /></button>
                <button type="button" className="icon-button" aria-label="ยกเลิก" onClick={() => setRenaming(null)}><X size={14} /></button>
              </form>
            : <>
                <button className="project-open" role="menuitem" onClick={() => choose(() => onOpen(p.id))}>
                  <span className="project-check">{p.id === projects.activeId && <Check size={13} />}</span>
                  <span><strong>{p.name}</strong><small>{p.tables} ตาราง{p.updatedAt ? ` · ${formatDate(p.updatedAt)}` : ''}</small></span>
                </button>
                <div className="project-item-actions">
                  <button className="icon-button" title="เปลี่ยนชื่อ" aria-label={`เปลี่ยนชื่อ ${p.name}`} onClick={() => startRename(p.id, p.name)}><Pencil size={13} /></button>
                  <button className="icon-button" title="ทำสำเนา" aria-label={`ทำสำเนา ${p.name}`} onClick={() => choose(() => onDuplicate(p.id))}><Copy size={13} /></button>
                  <button className="icon-button danger" title={projects.projects.length > 1 ? 'ลบโปรเจกต์' : 'ต้องมีอย่างน้อย 1 โปรเจกต์'} aria-label={`ลบ ${p.name}`} disabled={projects.projects.length <= 1} onClick={() => {
                    if (window.confirm(`ลบโปรเจกต์ “${p.name}” ออกจากเบราว์เซอร์นี้?\nแนะนำให้กด “บันทึกโปรเจกต์” เพื่อดาวน์โหลดสำรองก่อน`)) choose(() => onDelete(p.id));
                  }}><Trash2 size={13} /></button>
                </div>
              </>}
        </div>)}
      </div>
      <div className="project-create">
        <button className="button" onClick={() => choose(() => onCreate('blank'))}><FilePlus2 size={14} />โปรเจกต์ว่าง</button>
        <button className="button subtle" onClick={() => choose(() => onCreate('sample'))}><Sparkles size={14} />จากตัวอย่าง</button>
      </div>
    </div>}
  </div>;
}

