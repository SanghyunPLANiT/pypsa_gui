import React, { useMemo, useState } from 'react';
import { RunHistoryEntry, RunResults } from '../../shared/types';
import { RunComparisonTable } from '../run-history/RunComparisonTable';

// ── Mini horizontal-bar chart ─────────────────────────────────────────────────

interface BarEntry { id: string; label: string; value: number; active: boolean }

function MiniBarChart({ title, unit, entries }: { title: string; unit: string; entries: BarEntry[] }) {
  const maxAbs = Math.max(...entries.map((e) => Math.abs(e.value)), 0.001);
  return (
    <div className="cmp-bar-chart">
      <div className="cmp-bar-chart-title">{title}</div>
      {entries.map((e) => (
        <div key={e.id} className="cmp-bar-row">
          <div className="cmp-bar-label" title={e.label}>{e.label}</div>
          <div className="cmp-bar-track">
            <div
              className={`cmp-bar-fill${e.active ? ' cmp-bar-fill--active' : ''}`}
              style={{ width: `${(Math.abs(e.value) / maxAbs) * 100}%` }}
            />
          </div>
          <div className="cmp-bar-value">
            {e.value.toLocaleString(undefined, { maximumFractionDigits: 1 })}{unit}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const RE_CARRIERS = new Set(['Solar', 'Wind', 'Hydro']);

function firstNumericSummary(entry: RunHistoryEntry, predicate: (label: string) => boolean): number {
  const s = entry.results.summary.find((x) => predicate(x.label));
  if (!s) return 0;
  const m = s.value.replace(/,/g, '').match(/[-+]?[0-9]*\.?[0-9]+/);
  const n = m ? parseFloat(m[0]) : NaN;
  return isNaN(n) ? 0 : n;
}

// ── Comparison pane ───────────────────────────────────────────────────────────

interface Props {
  runHistory: RunHistoryEntry[];
  activeResults: RunResults | null;
}

export function ComparisonPane({ runHistory, activeResults }: Props) {
  // Store which run IDs are hidden; default = none (show all)
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());

  const filteredHistory = useMemo(
    () => runHistory.filter((e) => !excludedIds.has(e.id)),
    [runHistory, excludedIds],
  );

  const toggleId = (id: string) => {
    setExcludedIds((prev) => {
      // Don't allow dropping below 2 visible runs
      const wouldBeVisible = runHistory.filter((e) => {
        const nextExcluded = new Set(prev);
        nextExcluded.has(id) ? nextExcluded.delete(id) : nextExcluded.add(id);
        return !nextExcluded.has(e.id);
      });
      if (wouldBeVisible.length < 2) return prev;
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  if (runHistory.length < 2) {
    return (
      <div className="analytics-empty">
        <h3>No runs to compare yet</h3>
        <p>
          Run the model at least twice — with different settings, carbon prices, or
          constraints — and the comparison table will appear here automatically.
        </p>
      </div>
    );
  }

  // ── KPI bar data ────────────────────────────────────────────────────────────

  const dispatchEntries: BarEntry[] = filteredHistory.map((e) => ({
    id: e.id,
    label: e.label,
    value: e.results.carrierMix.reduce((s, m) => s + m.value, 0) / 1000, // GWh
    active: e.results === activeResults,
  }));

  const reEntries: BarEntry[] = filteredHistory.map((e) => {
    const total = e.results.carrierMix.reduce((s, m) => s + m.value, 0);
    const re = e.results.carrierMix
      .filter((m) => RE_CARRIERS.has(m.label))
      .reduce((s, m) => s + m.value, 0);
    return { id: e.id, label: e.label, value: total > 0 ? (re / total) * 100 : 0, active: e.results === activeResults };
  });

  const emissionsEntries: BarEntry[] = filteredHistory.map((e) => ({
    id: e.id,
    label: e.label,
    value: firstNumericSummary(e, (l) => l.toLowerCase().includes('emission')),
    active: e.results === activeResults,
  }));

  const priceEntries: BarEntry[] = filteredHistory.map((e) => ({
    id: e.id,
    label: e.label,
    value: firstNumericSummary(e, (l) => l.toLowerCase().includes('price')),
    active: e.results === activeResults,
  }));

  const showKpiCharts = filteredHistory.some((e) => e.results.carrierMix.length > 0);

  return (
    <div className="results-dashboard">

      {/* ── Run selector ─────────────────────────────────────────────────── */}
      <div className="cmp-run-selector">
        <span className="cmp-run-selector-label">Include runs</span>
        <div className="cmp-run-pills">
          {runHistory.map((e) => (
            <button
              key={e.id}
              className={`asset-pill${!excludedIds.has(e.id) ? ' asset-pill--active' : ''}`}
              onClick={() => toggleId(e.id)}
            >
              {e.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI bar charts ────────────────────────────────────────────────── */}
      {showKpiCharts && (
        <div className="cmp-bar-strip">
          <MiniBarChart title="Total dispatch" unit=" GWh" entries={dispatchEntries} />
          <MiniBarChart title="RE share" unit="%" entries={reEntries} />
          <MiniBarChart title="Emissions" unit="" entries={emissionsEntries} />
          <MiniBarChart title="Avg system price" unit="" entries={priceEntries} />
        </div>
      )}

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      {filteredHistory.length >= 2 ? (
        <RunComparisonTable
          runHistory={filteredHistory}
          activeResults={activeResults ?? filteredHistory[0].results}
        />
      ) : (
        <p className="cmp-need-two">Select at least 2 runs above to see the comparison table.</p>
      )}
    </div>
  );
}
