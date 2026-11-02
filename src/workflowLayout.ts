import { flowStepHeight, type Workflow } from './workflow';

export async function arrangeWorkflow(flow: Workflow): Promise<Workflow> {
  if (!flow.nodes.length) return flow;
  const { default: ELK } = await import('elkjs/lib/elk.bundled.js');
  const graph = await new ELK().layout({
    id: 'workflow', layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': 'DOWN', 'elk.spacing.nodeNode': '90', 'elk.layered.spacing.nodeNodeBetweenLayers': '110' },
    children: flow.nodes.map(n => ({ id: n.id, width: 240, height: flowStepHeight(n.kind) })),
    edges: flow.edges.map(e => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  });
  const positions = new Map(graph.children?.map(n => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]));
  return { ...flow, nodes: flow.nodes.map(n => ({ ...n, position: positions.get(n.id)! })) };
}
