import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { AlertCircle, CirclePlay, CircleStop, GitBranch, Square, Table2 } from 'lucide-react';
import { flowStepHeight, STEP_LABELS, type FlowStep } from './workflow';

export type FlowStepFlowNode = Node<{ step: FlowStep; issues: string[] }, 'flowStep'>;
const icons = { start: CirclePlay, process: Square, decision: GitBranch, end: CircleStop };
export default memo(function FlowStepNode({ data, selected }: NodeProps<FlowStepFlowNode>) {
  const { step, issues } = data, Icon = icons[step.kind];
  return <div className={`flow-step flow-${step.kind} ${selected ? 'is-selected' : ''} ${issues.length ? 'has-issue' : ''}`} style={{ height: flowStepHeight(step.kind) }}>
    {step.kind !== 'start' && <Handle type="target" position={Position.Top} id="in" />}
    <div className="flow-step-content"><span className="flow-kind"><Icon size={13} />{STEP_LABELS[step.kind]}</span><strong>{step.label}</strong>
      {step.tableRef && <span className="flow-table-ref" title={`${step.tableRef}${step.fieldRef ? `.${step.fieldRef}` : ''}`}><Table2 size={11} />{step.tableRef}{step.fieldRef && `.${step.fieldRef}`}</span>}
      {step.description && step.kind === 'process' && <p>{step.description}</p>}
      {issues.length > 0 && <span className="flow-ref-issue" title={issues.join('\n')}><AlertCircle size={12} />ตรวจตารางที่อ้างอิง</span>}
    </div>
    {step.kind === 'decision' ? <>
      <Handle type="source" position={Position.Right} id="yes" /><span className="flow-branch branch-yes">ใช่</span>
      <Handle type="source" position={Position.Left} id="no" /><span className="flow-branch branch-no">ไม่ใช่</span>
    </> : step.kind !== 'end' && <Handle type="source" position={Position.Bottom} id="out" />}
  </div>;
});
