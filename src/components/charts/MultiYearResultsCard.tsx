/**
 * MultiYearResultsCard — shows multi-investment-period optimisation results.
 *
 * Sections:
 *   1. KPI row (periods, NPV, total new capacity, average SMP)
 *   2. Capacity timeline — stacked bar chart of new builds per period × carrier
 *   3. Cost breakdown table — period × {CAPEX $M, OPEX $M, Total $M}
 *   4. SMP trend — line of average SMP per period
 */

import React, { useState } from 'react';
import type { MultiYearResults, MultiYearPeriodResult } from '../../types';
import { carrierColor } from '../../utils/helpers';

interface Props {
  data: MultiYearResults;
}

// ── KPI row ───────────────────────────────────────────────────────────────────

function KpiRow({ data }: { data: MultiYearResults }) {
  const totalNewGw = data.periods.reduce((sum, p) => {
    return sum + Object.values(p.newCapacityMw).reduce((s, v) => s + v, 0);
  }, 0) / 1000;

  const avgSmp = data.periods.length
    ? data.periods.reduce((s, p) => s + p.avgSmpPerMwh, 0) / data.periods.length
    : 0;

  return (
    <div className="my-kpi-row">
      <div className="my-kpi">
        <span className="my-kpi-label">Periods</span>
        <span className="my-kpi-value">{data.periods.length}</span>
      </div>
      <div className="my-kpi">
        <span className="my-kpi-label">Total NPV</span>
        <span className="my-kpi-value">${data.totalNpvM.toFixed(0)}M</span>
      </div>
      <div className="my-kpi">
        <span className="my-kpi-label">New capacity</span>
        <span className="my-kpi-value">{totalNewGw.toFixed(1)} GW</span>
      </div>
      <div className="my-kpi">
        <span className="my-kpi-label">Avg SMP</span>
        <span className="my-kpi-value">${avgSmp.toFixed(0)}/MWh</span>
      </div>
    </div>
  );
}

// ── Capacity timeline (stacked bars) ─────────────────────────────────────────

function CapacityTimeline({ periods }: { periods: MultiYearPeriodResult[] }) {
  // Collect all unique carriers across periods
  const carriers = Array.from(
    new Set(periods.flatMap((p) => Object.keys(p.newCapacityMw))),
  );

  const maxTotal = Math.max(
    1,
    ...periods.map((p) => Object.values(p.newCapacityMw).reduce((s, v) => s + v, 0)),
  );

  const barWidth = 60;
  const gap = 20;
  const totalWidth = periods.length * (barWidth + gap);
  const chartH = 140;

  if (carriers.length === 0 || periods.every((p) => Object.keys(p.newCapacityMw).length === 0)) {
    return <p className="my-empty">No new capacity built in any period.</p>;
  }

  return (
    <div>
      <svg
        viewBox={`0 0 ${totalWidth + 10} ${chartH + 36}`}
        style={{ width: '100%', maxWidth: 560, display: 'block' }}
      >
        {periods.map((p, pi) => {
          const x = pi * (barWidth + gap) + gap / 2;
          let y = chartH;
          return (
            <g key={p.year}>
              {carriers.map((carrier) => {
                const val = p.newCapacityMw[carrier] ?? 0;
                if (val <= 0) return null;
                const h = (val / maxTotal) * chartH;
                y -= h;
                return (
                  <rect
                    key={carrier}
                    x={x}
                    y={y}
                    width={barWidth}
                    height={h}
                    fill={carrierColor(carrier)}
                    fillOpacity={0.85}
                    rx={2}
                  />
                );
              })}
              <text
                x={x + barWidth / 2}
                y={chartH + 14}
                textAnchor="middle"
                fontSize={10}
                fill="var(--fg)"
                fontFamily="IBM Plex Sans, sans-serif"
              >
                {p.year}
              </text>
              <text
                x={x + barWidth / 2}
                y={chartH + 26}
                textAnchor="middle"
                fontSize={9}
                fill="var(--muted)"
                fontFamily="IBM Plex Sans, sans-serif"
              >
                {(Object.values(p.newCapacityMw).reduce((s, v) => s + v, 0)).toFixed(0)} MW
              </text>
            </g>
          );
        })}
      </svg>
      {/* Legend */}
      <div className="my-legend">
        {carriers.map((c) => (
          <span key={c} className="my-legend-item">
            <span className="my-legend-dot" style={{ background: carrierColor(c) }} />
            {c}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Cost breakdown table ──────────────────────────────────────────────────────

function CostTable({ periods }: { periods: MultiYearPeriodResult[] }) {
  return (
    <table className="my-cost-table">
      <thead>
        <tr>
          <th>Year</th>
          <th>CAPEX $M</th>
          <th>OPEX $M</th>
          <th>Total $M</th>
          <th>Avg SMP</th>
        </tr>
      </thead>
      <tbody>
        {periods.map((p) => (
          <tr key={p.year}>
            <td>{p.year}</td>
            <td>{p.capexM.toFixed(1)}</td>
            <td>{p.opexM.toFixed(1)}</td>
            <td>{(p.capexM + p.opexM).toFixed(1)}</td>
            <td>${p.avgSmpPerMwh.toFixed(1)}/MWh</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── SMP trend ─────────────────────────────────────────────────────────────────

function SmpTrend({ periods }: { periods: MultiYearPeriodResult[] }) {
  if (periods.every((p) => p.avgSmpPerMwh === 0)) return null;

  const maxSmp = Math.max(1, ...periods.map((p) => p.avgSmpPerMwh));
  const w = 340;
  const h = 80;
  const pts = periods.map((p, i) => {
    const x = (i / (periods.length - 1 || 1)) * w;
    const y = h - (p.avgSmpPerMwh / maxSmp) * (h - 10) - 5;
    return `${x},${y}`;
  });

  return (
    <svg
      viewBox={`0 0 ${w + 40} ${h + 28}`}
      style={{ width: '100%', maxWidth: 420, display: 'block' }}
    >
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke="var(--accent, #3b82f6)"
        strokeWidth={2}
      />
      {periods.map((p, i) => {
        const x = (i / (periods.length - 1 || 1)) * w;
        const y = h - (p.avgSmpPerMwh / maxSmp) * (h - 10) - 5;
        return (
          <g key={p.year}>
            <circle cx={x} cy={y} r={4} fill="var(--accent, #3b82f6)" />
            <text x={x} y={h + 14} textAnchor="middle" fontSize={9} fill="var(--fg)" fontFamily="IBM Plex Sans, sans-serif">
              {p.year}
            </text>
            <text x={x} y={y - 7} textAnchor="middle" fontSize={8} fill="var(--muted)" fontFamily="IBM Plex Sans, sans-serif">
              ${p.avgSmpPerMwh.toFixed(0)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Main card ─────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="dashboard-section">
      <div className="dashboard-section-header-row">
        <button
          type="button"
          className="dashboard-section-header"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          <h3>{title}</h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{open ? '▲' : '▼'}</span>
        </button>
      </div>
      {open && <div className="dashboard-section-body">{children}</div>}
    </div>
  );
}

export function MultiYearResultsCard({ data }: Props) {
  if (!data || !data.periods || data.periods.length === 0) {
    return (
      <div className="dashboard-section">
        <p className="my-empty">No multi-year results available.</p>
      </div>
    );
  }

  return (
    <div className="my-results-card">
      <Section title="Multi-Year Overview">
        <KpiRow data={data} />
        {data.narrative.length > 0 && (
          <details className="my-narrative">
            <summary>Run notes ({data.narrative.length})</summary>
            <ul>
              {data.narrative.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          </details>
        )}
      </Section>

      <Section title="New Capacity by Period">
        <CapacityTimeline periods={data.periods} />
      </Section>

      <Section title="Cost Breakdown">
        <CostTable periods={data.periods} />
      </Section>

      <Section title="System Marginal Price Trend">
        <SmpTrend periods={data.periods} />
      </Section>
    </div>
  );
}
