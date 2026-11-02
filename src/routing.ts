type HorizontalBounds = { x: number; width: number };

/** Use facing sides when tables are next to one another. For stacked or
 * overlapping horizontal ranges, keep the route outside their right edges. */
export function connectionSides(source: HorizontalBounds, target: HorizontalBounds) {
  if (source.x + source.width <= target.x) return { source: 'right', target: 'left' } as const;
  if (target.x + target.width <= source.x) return { source: 'left', target: 'right' } as const;
  return { source: 'right', target: 'right' } as const;
}

export function connectionHandles(source: HorizontalBounds, target: HorizontalBounds, fromColumn: string, toColumn: string) {
  const sides = connectionSides(source, target);
  return {
    sourceHandle: `${sides.source === 'left' ? 'out-left:' : 'out:'}${fromColumn}`,
    targetHandle: `${sides.target === 'right' ? 'in-right:' : 'in:'}${toColumn}`,
  };
}
