import { memo } from 'react';
import { BaseEdge, getSmoothStepPath, type Edge, type EdgeProps } from '@xyflow/react';
import type { Route } from './obstacleRouting';
import { roundedPath } from './edgePath';

export type RelationshipFlowEdge = Edge<{ route: Route; hovered: boolean; description: string; preview?: boolean }, 'relationship'>;

export default memo(function RelationshipEdge({ id, data, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, label, selected }: EdgeProps<RelationshipFlowEdge>) {
  if (!data) return null;
  if (data.preview) {
    const [path] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
    return <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ ...style, opacity: .7 }} interactionWidth={16} />;
  }
  if (data.route.blocked || data.route.points.length < 2) return null;
  const points = data.route.points.map(p => ({ ...p }));
  // Use measured React Flow endpoints so the line remains attached even with
  // fractional drag coordinates; the router computes the intervening channels.
  points[0] = { x: sourceX, y: sourceY }; points[points.length - 1] = { x: targetX, y: targetY };
  points[1].y = sourceY; points[points.length - 2].y = targetY;
  const path = roundedPath(points);
  let labelX = sourceX, labelY = sourceY, longest = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], length = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    if (length > longest) { longest = length; labelX = (a.x + b.x) / 2; labelY = (a.y + b.y) / 2; }
  }
  return <>
    <title>{data.description}</title>
    <path className="relationship-halo" d={path} fill="none" stroke="#0e181f" strokeWidth={6} strokeLinejoin="round" pointerEvents="none" />
    <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} interactionWidth={16}
      label={data.hovered || selected ? label : undefined} labelX={labelX} labelY={labelY}
      labelStyle={{ fill: '#c9f4e1', fontSize: 11, fontFamily: 'monospace' }}
      labelBgStyle={{ fill: '#17392e', fillOpacity: 1 }} labelBgPadding={[7, 4]} labelBgBorderRadius={4} />
  </>;
});
