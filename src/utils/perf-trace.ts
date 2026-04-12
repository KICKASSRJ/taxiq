/**
 * Performance Tracing Utility — collects timing data for every operation
 * and exposes it for the UI performance panel.
 */

export interface PerfEntry {
  id: string;
  label: string;
  phase: 'parse' | 'match' | 'treasury' | 'nav-fetch' | 'compute' | 'total';
  startTime: number;
  endTime?: number;
  durationMs?: number;
  detail?: string;
  status: 'running' | 'done' | 'error';
}

export interface PerfTrace {
  runId: string;
  startedAt: string;
  entries: PerfEntry[];
  totalMs?: number;
}

let currentTrace: PerfTrace | null = null;
let listeners: Array<(trace: PerfTrace) => void> = [];

/** Subscribe to trace updates (for React state) */
export function onPerfUpdate(fn: (trace: PerfTrace) => void): () => void {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter(l => l !== fn);
  };
}

function notify() {
  if (currentTrace) {
    const snapshot = { ...currentTrace, entries: [...currentTrace.entries] };
    listeners.forEach(fn => fn(snapshot));
  }
}

/** Start a new trace run (call at the start of upload/processing) */
export function startTrace(): PerfTrace {
  currentTrace = {
    runId: Date.now().toString(36),
    startedAt: new Date().toISOString(),
    entries: [],
  };
  notify();
  return currentTrace;
}

/** Begin timing an operation */
export function traceStart(label: string, phase: PerfEntry['phase'], detail?: string): string {
  if (!currentTrace) startTrace();
  const id = `${phase}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  currentTrace!.entries.push({
    id,
    label,
    phase,
    startTime: performance.now(),
    status: 'running',
    detail,
  });
  console.log(`[PERF] ▶ ${label}${detail ? ` (${detail})` : ''}`);
  notify();
  return id;
}

/** End timing an operation */
export function traceEnd(id: string, detail?: string): number {
  if (!currentTrace) return 0;
  const entry = currentTrace.entries.find(e => e.id === id);
  if (!entry) return 0;
  entry.endTime = performance.now();
  entry.durationMs = Math.round(entry.endTime - entry.startTime);
  entry.status = 'done';
  if (detail) entry.detail = detail;
  console.log(`[PERF] ✓ ${entry.label}: ${entry.durationMs}ms${detail ? ` (${detail})` : ''}`);
  notify();
  return entry.durationMs;
}

/** Mark an operation as failed */
export function traceError(id: string, error: string): void {
  if (!currentTrace) return;
  const entry = currentTrace.entries.find(e => e.id === id);
  if (!entry) return;
  entry.endTime = performance.now();
  entry.durationMs = Math.round(entry.endTime - entry.startTime);
  entry.status = 'error';
  entry.detail = error;
  console.error(`[PERF] ✗ ${entry.label}: ${entry.durationMs}ms — ${error}`);
  notify();
}

/** Finalize the trace and compute total */
export function endTrace(): PerfTrace | null {
  if (!currentTrace) return null;
  const firstStart = Math.min(...currentTrace.entries.map(e => e.startTime));
  const lastEnd = Math.max(...currentTrace.entries.filter(e => e.endTime).map(e => e.endTime!));
  currentTrace.totalMs = Math.round(lastEnd - firstStart);
  console.log(`[PERF] ═══ Total: ${currentTrace.totalMs}ms ═══`);
  notify();
  return currentTrace;
}

/** Get the current trace snapshot */
export function getCurrentTrace(): PerfTrace | null {
  return currentTrace ? { ...currentTrace, entries: [...currentTrace.entries] } : null;
}
