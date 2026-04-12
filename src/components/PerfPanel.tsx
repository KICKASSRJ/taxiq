import React, { useEffect, useState } from 'react';
import type { PerfTrace, PerfEntry } from '../utils/perf-trace';
import { onPerfUpdate, getCurrentTrace } from '../utils/perf-trace';

const PHASE_COLORS: Record<PerfEntry['phase'], string> = {
  parse: '#4dabf7',
  match: '#69db7c',
  treasury: '#ffd43b',
  'nav-fetch': '#ff922b',
  compute: '#da77f2',
  total: '#868e96',
};

const PHASE_LABELS: Record<PerfEntry['phase'], string> = {
  parse: 'PDF Parse',
  match: 'Scheme Match',
  treasury: 'Treasury Rate',
  'nav-fetch': 'NAV Fetch',
  compute: 'Compute',
  total: 'Total',
};

function formatMs(ms: number | undefined): string {
  if (ms === undefined) return '...';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function PerfPanel() {
  const [trace, setTrace] = useState<PerfTrace | null>(getCurrentTrace);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    return onPerfUpdate(setTrace);
  }, []);

  if (!trace || trace.entries.length === 0) return null;

  // Group entries by phase
  const phases = new Map<PerfEntry['phase'], PerfEntry[]>();
  for (const entry of trace.entries) {
    if (!phases.has(entry.phase)) phases.set(entry.phase, []);
    phases.get(entry.phase)!.push(entry);
  }

  const running = trace.entries.filter(e => e.status === 'running');
  const errors = trace.entries.filter(e => e.status === 'error');

  return (
    <div style={{
      position: 'fixed', bottom: 0, right: 0, width: collapsed ? 'auto' : '400px',
      maxHeight: collapsed ? 'auto' : '50vh', overflow: 'auto',
      background: '#1a1b26', color: '#c0caf5', fontSize: '12px',
      borderTop: '2px solid #7aa2f7', borderLeft: '2px solid #7aa2f7',
      borderRadius: '8px 0 0 0', zIndex: 9999, fontFamily: 'monospace',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '6px 10px', background: '#24283b', cursor: 'pointer',
        borderBottom: collapsed ? 'none' : '1px solid #414868',
      }} onClick={() => setCollapsed(!collapsed)}>
        <span style={{ fontWeight: 'bold' }}>
          ⚡ Perf {trace.totalMs != null ? `— ${formatMs(trace.totalMs)}` : ''}
          {running.length > 0 && <span style={{ color: '#ffd43b' }}> ({running.length} running)</span>}
          {errors.length > 0 && <span style={{ color: '#f7768e' }}> ({errors.length} errors)</span>}
        </span>
        <span>{collapsed ? '▲' : '▼'}</span>
      </div>
      {!collapsed && (
        <div style={{ padding: '6px 10px' }}>
          {/* Phase summary */}
          {Array.from(phases.entries()).map(([phase, entries]) => {
            const totalMs = entries.reduce((s, e) => s + (e.durationMs || 0), 0);
            const maxMs = Math.max(...entries.map(e => e.durationMs || 0));
            const hasRunning = entries.some(e => e.status === 'running');
            return (
              <div key={phase} style={{ marginBottom: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span style={{ color: PHASE_COLORS[phase], fontWeight: 'bold' }}>
                    {PHASE_LABELS[phase]}
                    {entries.length > 1 && ` (×${entries.length})`}
                  </span>
                  <span>
                    {hasRunning ? (
                      <span style={{ color: '#ffd43b' }}>⏳ running</span>
                    ) : entries.length > 1 ? (
                      `max ${formatMs(maxMs)} / total ${formatMs(totalMs)}`
                    ) : (
                      formatMs(entries[0].durationMs)
                    )}
                  </span>
                </div>
                {/* Individual entries for multi-item phases */}
                {entries.length > 1 && entries.map(e => (
                  <div key={e.id} style={{
                    paddingLeft: '12px', color: e.status === 'error' ? '#f7768e' : '#9aa5ce',
                    display: 'flex', justifyContent: 'space-between',
                  }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '250px' }}>
                      {e.status === 'running' ? '⏳' : e.status === 'error' ? '✗' : '✓'} {e.detail || e.label}
                    </span>
                    <span>{formatMs(e.durationMs)}</span>
                  </div>
                ))}
              </div>
            );
          })}
          {/* Waterfall bar */}
          {trace.entries.length > 0 && (() => {
            const minStart = Math.min(...trace.entries.map(e => e.startTime));
            const maxEnd = Math.max(...trace.entries.filter(e => e.endTime).map(e => e.endTime || 0));
            const span = maxEnd - minStart || 1;
            return (
              <div style={{ marginTop: '8px', borderTop: '1px solid #414868', paddingTop: '6px' }}>
                <div style={{ fontSize: '10px', color: '#565f89', marginBottom: '4px' }}>Waterfall</div>
                {trace.entries.map(e => {
                  const left = ((e.startTime - minStart) / span) * 100;
                  const width = Math.max(((e.durationMs || 0) / span) * 100, 1);
                  return (
                    <div key={e.id} style={{ position: 'relative', height: '10px', marginBottom: '1px' }}>
                      <div style={{
                        position: 'absolute', left: `${left}%`, width: `${width}%`,
                        height: '8px', background: PHASE_COLORS[e.phase],
                        borderRadius: '2px', opacity: e.status === 'error' ? 0.5 : 0.85,
                      }} title={`${e.label}: ${formatMs(e.durationMs)}`} />
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
