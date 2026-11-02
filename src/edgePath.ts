import type { Point } from './obstacleRouting';

const distance = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export function roundedPath(points: Point[], radius = 5): string {
  if (!points.length) return '';
  let path = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1], b = points[i], c = points[i + 1];
    const before = Math.min(radius, distance(a, b) / 2), after = Math.min(radius, distance(b, c) / 2);
    const entry = { x: b.x - Math.sign(b.x - a.x) * before, y: b.y - Math.sign(b.y - a.y) * before };
    const exit = { x: b.x + Math.sign(c.x - b.x) * after, y: b.y + Math.sign(c.y - b.y) * after };
    path += `L${entry.x},${entry.y}Q${b.x},${b.y} ${exit.x},${exit.y}`;
  }
  const end = points[points.length - 1];
  return `${path}L${end.x},${end.y}`;
}
