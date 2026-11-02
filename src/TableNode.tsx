import { memo, useEffect } from 'react';
import { Handle, Position, useUpdateNodeInternals, type Node, type NodeProps } from '@xyflow/react';
import { KeyRound, Table2, Link2, Palette } from 'lucide-react';
import type { Table } from './schema';
import { headerTextColor } from './appearance';

export type TableFlowNode = Node<{ table: Table; foreignKeys: string[]; editable: boolean; color: string }, 'table'>;
export default memo(function TableNode({ id, data, selected }: NodeProps<TableFlowNode>) {
  const updateNodeInternals = useUpdateNodeInternals();
  const columnsKey = data.table.columns.map(c => c.name).join(',');
  useEffect(() => { updateNodeInternals(id); }, [id, columnsKey, updateNodeInternals]);
  return <div className={`table-node ${selected ? 'is-selected' : ''}`} style={{ '--table-accent': data.color, '--table-header-ink': headerTextColor(data.color) } as React.CSSProperties}>
    <div className="table-heading"><Table2 size={16} /><strong>{data.table.name}</strong><span>{data.table.columns.length}</span><button type="button" className="table-color-button nodrag nopan" title="เปลี่ยนสีหัวตาราง" aria-label={`เปลี่ยนสีหัวตาราง ${data.table.name}`}><Palette size={14} /></button></div>
    {data.table.columns.map(col => <div className="table-row" key={col.name}>
      <Handle type="target" position={Position.Left} id={`in:${col.name}`} isConnectable={data.editable} title={`รับความสัมพันธ์: ${col.name}`} />
      <Handle className="routing-handle" type="source" position={Position.Left} id={`out-left:${col.name}`} isConnectable={false} />
      <span className={`column-icon ${col.pk ? 'primary' : ''}`}>{col.pk ? <KeyRound size={12} /> : data.foreignKeys.includes(col.name) ? <Link2 size={12} /> : <span className="column-dot" />}</span>
      <span className="column-name">{col.name}{col.notNull && <b title="NOT NULL"> *</b>}</span>
      <span className="column-type">{col.type}</span>
      {col.unique && <span className="unique-mark" title="UNIQUE">U</span>}
      <Handle type="source" position={Position.Right} id={`out:${col.name}`} isConnectable={data.editable} title={`ลากจาก ${col.name} ไปยังคอลัมน์ที่อ้างอิง`} />
      <Handle className="routing-handle" type="target" position={Position.Right} id={`in-right:${col.name}`} isConnectable={false} />
    </div>)}
  </div>;
});
