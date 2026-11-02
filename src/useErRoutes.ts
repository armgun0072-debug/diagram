import { useEffect, useRef, useState } from 'react';
import type { Route } from './obstacleRouting';
import type { RouteRequest, RouteResponse } from './routeWorker';
import type { Positions, Schema } from './schema';

export function useErRoutes(schema: Schema, positions: Positions, measurements: ReadonlyMap<string, { width: number; height: number }>, dragging: boolean, enabled: boolean) {
  const [routes, setRoutes] = useState(() => new Map<string, Route>());
  const [pending, setPending] = useState(false);
  type Snapshot = { schema: Schema; positions: Positions; measurements: ReadonlyMap<string, { width: number; height: number }> };
  const [readySnapshot, setReadySnapshot] = useState<Snapshot | null>(null);
  const snapshot = useRef<Snapshot | null>(null);
  const worker = useRef<Worker | null>(null);
  const inFlight = useRef(false);
  const queued = useRef<RouteRequest | null>(null);
  const desired = useRef(0);
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(false);
  const pump = useRef<() => void>(() => {});

  useEffect(() => {
    mounted.current = true;
    const complete = (response: RouteResponse) => {
      if (!mounted.current) return;
      inFlight.current = false;
      if (response.id === desired.current) {
        if (response.routes) { setRoutes(new Map(response.routes)); setReadySnapshot(snapshot.current); }
        setPending(false);
      }
      pump.current();
    };
    const fallback = (request: RouteRequest) => {
      // No heavy computation during drag, even when Worker is unavailable.
      fallbackTimer.current = setTimeout(() => {
        if (!mounted.current || request.id !== desired.current) { inFlight.current = false; pump.current(); return; }
        void import('./obstacleRouting').then(({ routeRelations }) => {
          const start = performance.now();
          complete({ id: request.id, routes: [...routeRelations(request.schema, request.positions, new Map(request.measurements))], durationMs: performance.now() - start });
        }).catch(error => complete({ id: request.id, error: String(error), durationMs: 0 }));
      }, 0);
    };
    try {
      worker.current = new Worker(new URL('./routeWorker.ts', import.meta.url), { type: 'module' });
      worker.current.onmessage = (event: MessageEvent<RouteResponse>) => {
        if (event.data.error) {
          worker.current?.terminate(); worker.current = null;
          inFlight.current = false;
          if (event.data.id === desired.current && queued.current === null) queued.current = latest.current;
          pump.current();
        } else complete(event.data);
      };
      worker.current.onerror = () => {
        worker.current?.terminate(); worker.current = null; inFlight.current = false;
        if (!queued.current && latest.current?.id === desired.current) queued.current = latest.current;
        pump.current();
      };
    } catch { worker.current = null; }
    pump.current = () => {
      if (!mounted.current || inFlight.current || !queued.current) return;
      const request = queued.current; queued.current = null; inFlight.current = true;
      if (worker.current) worker.current.postMessage(request); else fallback(request);
    };
    return () => {
      mounted.current = false; desired.current++; queued.current = null; inFlight.current = false;
      worker.current?.terminate(); worker.current = null;
      if (fallbackTimer.current !== null) clearTimeout(fallbackTimer.current);
    };
  }, []);

  const latest = useRef<RouteRequest | null>(null);
  useEffect(() => {
    const id = ++desired.current;
    if (dragging || !enabled) { queued.current = null; latest.current = null; setPending(false); return; }
    if (!schema.relations.length) { queued.current = null; latest.current = null; setRoutes(new Map()); setPending(false); return; }
    const request = { id, schema, positions, measurements: [...measurements] };
    snapshot.current = { schema, positions, measurements };
    latest.current = request;
    queued.current = request; // Backpressure: keep only the latest pending snapshot.
    setPending(true); pump.current();
  }, [schema, positions, measurements, dragging, enabled]);
  const outdated = readySnapshot?.schema !== schema || readySnapshot.positions !== positions || readySnapshot.measurements !== measurements;
  return { routes, pending: enabled && !dragging && schema.relations.length > 0 && (pending || outdated) };
}
