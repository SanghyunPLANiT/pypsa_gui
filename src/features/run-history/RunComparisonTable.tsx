import React from 'react';
import { RunHistoryEntry, RunResults } from '../../shared/types';
import { formatRelTime } from '../../shared/utils/formatRelTime';

interface RunComparisonTableProps {
  runHistory: RunHistoryEntry[];
  activeResults: RunResults;
}

export function RunComparisonTable({ runHistory, activeResults }: RunComparisonTableProps) {
  if (runHistory.length < 2) return null;

  // Determine which column is the active one (match by reference equality)
  const activeIdx = runHistory.findIndex((e) => e.results === activeResults);

  const summaryLabels = runHistory[0].results.summary.map((s) => s.label);

  const settingRows: Array<{ label: string; fn: (e: RunHistoryEntry) => string }> = [
    { label: 'Carbon price',  fn: (e) => e.carbonPrice > 0 ? `$${e.carbonPrice}/t` : '—' },
    { label: 'Window',        fn: (e) => `${e.snapshotStart} → ${e.snapshotEnd}` },
    { label: 'Resolution',    fn: (e) => `${e.snapshotWeight}h` },
    { label: 'Constraints',   fn: (e) => e.activeConstraints.length > 0
        ? e.activeConstraints.map((c) => c.label).join(', ')
        : '—' },
  ];

  return (
    <div className="cmp-table-wrap">
      <table className="cmp-table">
        <thead>
          <tr>
            <th style={{ width: 140 }}></th>
            {runHistory.map((entry, i) => (
              <th
                key={entry.id}
                className={`cmp-th${i === activeIdx ? ' cmp-col--active' : ''}`}
              >
                <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{entry.label}</div>
                <div style={{ fontWeight: 400, fontSize: '0.72rem', marginTop: 2 }}>
                  {formatRelTime(entry.savedAt)}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Settings section header */}
          <tr className="cmp-section-header">
            <td colSpan={runHistory.length + 1}>Settings</td>
          </tr>
          {settingRows.map((row) => (
            <tr key={row.label}>
              <td className="cmp-row-label">{row.label}</td>
              {runHistory.map((entry, i) => (
                <td key={entry.id} className={i === activeIdx ? 'cmp-col--active' : ''}>
                  {row.fn(entry)}
                </td>
              ))}
            </tr>
          ))}

          {/* Results section header */}
          <tr className="cmp-section-header">
            <td colSpan={runHistory.length + 1}>Results</td>
          </tr>
          {summaryLabels.map((label, si) => (
            <tr key={label}>
              <td className="cmp-row-label">{label}</td>
              {runHistory.map((entry, i) => (
                <td key={entry.id} className={i === activeIdx ? 'cmp-col--active' : ''}>
                  {entry.results.summary[si]?.value ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
