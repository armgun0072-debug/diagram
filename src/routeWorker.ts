import { routeRelations, type Route } from './obstacleRouting';
import type { Positions, Schema } from './schema';

export type RouteRequest = { id: number; schema: Schema; positions: Positions; measurements: [string, { width: number; height: number }][] };
export type RouteResponse = { id: number; routes?: [string, Route][]; error?: string; durationMs: number };
const scope = self as unknown as { onmessage: ((event: MessageEvent<RouteRequest>) => void) | null; postMessage: (response: RouteResponse) => void };
scope.onmessage = ({ data }) => {
  const start = performance.now();
  try {
    const routes = routeRelations(data.schema, data.positions, new Map(data.measurements));
    scope.postMessage({ id: data.id, routes: [...routes], durationMs: performance.now() - start });
  } catch (error) { scope.postMessage({ id: data.id, error: (error as Error).message, durationMs: performance.now() - start }); }
};
