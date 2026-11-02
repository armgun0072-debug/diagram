import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronDown, Check, GitBranch, Grid3X3, LayoutGrid, Snowflake } from 'lucide-react';
import { LAYOUT_OPTIONS, type LayoutAlgorithm } from './layoutOptions';

const icons = { 'left-right': ArrowRight, pipeline: GitBranch, snowflake: Snowflake, compact: Grid3X3 };

export default function ArrangeMenu({ algorithm, busy, disabled, onSelect }: {
  algorithm: LayoutAlgorithm; busy: boolean; disabled: boolean; onSelect: (algorithm: LayoutAlgorithm) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const select = useRef(onSelect);
  select.current = onSelect;

  useEffect(() => {
    if (!open) return;
    const items = () => [...root.current!.querySelectorAll<HTMLButtonElement>('[role=menuitemradio]')];
    items().find(item => item.getAttribute('aria-checked') === 'true')?.focus();
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const keyboard = (event: KeyboardEvent) => {
      const buttons = items(), current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
      else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[index]?.focus();
      } else if (/^[1-4]$/.test(event.key)) {
        event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); select.current(LAYOUT_OPTIONS[Number(event.key) - 1].id);
      } else if (event.key === 'Tab') setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', keyboard);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', keyboard); };
  }, [open]);

  return <div className="arrange-menu" ref={root}>
    <button ref={trigger} className="button subtle" disabled={busy || disabled} aria-haspopup="menu" aria-expanded={open}
      onClick={() => setOpen(value => !value)} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); } }}>
      <LayoutGrid size={15} /><span>{busy ? 'กำลังจัด…' : 'จัดตำแหน่ง'}</span><ChevronDown size={12} />
    </button>
    {open && <div className="arrange-options" role="menu" aria-label="เลือกรูปแบบจัดตำแหน่งตาราง">
      <div className="arrange-menu-title">Choose auto arrange algorithm</div>
      {LAYOUT_OPTIONS.map((option, index) => {
        const Icon = icons[option.id];
        return <button key={option.id} role="menuitemradio" aria-checked={algorithm === option.id} tabIndex={algorithm === option.id ? 0 : -1}
          className="arrange-option" onClick={() => { setOpen(false); trigger.current?.focus(); onSelect(option.id); }}>
          <Icon className="arrange-option-icon" size={19} /><span><strong>{option.name}{algorithm === option.id && <Check size={13} />}</strong><small>{option.description}</small></span><kbd>{index + 1}</kbd>
        </button>;
      })}
    </div>}
  </div>;
}
