import { memo } from 'react';
import { Palette, RotateCcw, X } from 'lucide-react';
import { TABLE_PALETTE } from './appearance';

export default memo(function TableAppearance({ name, color, onChange, onClose }: {
  name: string;
  color: string;
  onChange: (name: string, color: string | null) => void;
  onClose: () => void;
}) {
  return <section className="table-appearance" aria-label={`สีตาราง ${name}`}>
    <header><Palette size={15} /><strong title={name}>{name}</strong><button className="icon-button" aria-label="ปิดตัวเลือกสี" onClick={onClose}><X size={15} /></button></header>
    <p>สีพื้นหลังหัวตาราง</p>
    <div className="color-swatches">{TABLE_PALETTE.map(preset => <button
      key={preset.color} className="color-swatch" style={{ backgroundColor: preset.color }}
      aria-label={`สี${preset.label}`} title={preset.label} aria-pressed={color === preset.color}
      onClick={() => onChange(name, preset.color)}
    />)}</div>
    <div className="custom-color-row">
      <label className="custom-color"><input type="color" aria-label={`เลือกสีเองสำหรับ ${name}`} value={color} onChange={e => onChange(name, e.target.value)} /><span>เลือกสีเอง</span></label>
      <button className="icon-button" aria-label="คืนสีเริ่มต้น" title="คืนสีเริ่มต้น" onClick={() => onChange(name, null)}><RotateCcw size={14} /></button>
    </div>
  </section>;
});
