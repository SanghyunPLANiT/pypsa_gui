import React, { useState } from 'react';
import { RunResults, TimeSeriesRow, TimeSeriesSeries } from '../../types';
import { numberValue } from '../../utils/helpers';
import { InteractiveTimeSeriesCard } from './InteractiveTimeSeriesCard';
import { DonutChart } from './DonutChart';
import { DurationCurveCard } from './DurationCurveCard';

// ── KPI card ──────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string;
  unit: string;
  green?: boolean;
}

function KpiCard({ label, value, unit, green }: KpiCardProps) {
  return (
    <div className={`kpi-card${green ? ' kpi-card--green' : ''}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-unit">{unit}</div>
    </div>
  );
}

// ── Collapsible section ───────────────────────────────────────────────────────

interface SectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function DashboardSection({ title, defaultOpen = false, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="dashboard-section">
      <button
        type="button"
        className="dashboard-section-header"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <h3>{title}</h3>
        <span style={{ fontSize: '0.75rem', color: 'var(--muted)', userSelect: 'none' }}>
          {open ? '▲' : '▼'}
        </span>
      </button>
      {open && <div className="dashboard-section-body">{children}</div>}
    </div>
  );
}

// ── Cost breakdown color palette ──────────────────────────────────────────────

const COST_COLORS: Record<string, string> = {
  'Fuel cost': '#f97316',
  'Carbon cost': '#16a34a',
  'Load shedding': '#dc2626',
};

// ── Main dashboard ────────────────────────────────────────────────────────────

interface Props {
  results: RunResults;
  dispatchRows: TimeSeriesRow[];
  dispatchSeries: TimeSeriesSeries[];
  systemLoadRows: TimeSeriesRow[];
  systemPriceRows: TimeSeriesRow[];
  storageRows: TimeSeriesRow[];
}

export function ResultsDashboard({
  results,
  dispatchRows,
  dispatchSeries,
  systemLoadRows,
  systemPriceRows,
  storageRows,
}: Props) {
  // KPI calculations
  const totalDispatch = results.carrierMix.reduce((s, m) => s + m.value, 0);
  const reCarriers = new Set(['Solar', 'Wind', 'Hydro']);
  const reDispatch = results.carrierMix.filter((m) => reCarriers.has(m.label)).reduce((s, m) => s + m.value, 0);
  const reShare = totalDispatch > 0 ? (reDispatch / totalDispatch) * 100 : 0;

  const avgPrice = systemPriceRows.length
    ? systemPriceRows.reduce((s, r) => s + numberValue(r['price'] as number | string | undefined), 0) / systemPriceRows.length
    : 0;

  // Total emissions from summary if available, else 0
  const emissionsSummary = results.summary.find((s) => s.label === 'System emissions');
  const emissionsDisplay = emissionsSummary ? emissionsSummary.value : '—';

  // Duration curves: sorted descending
  const sortedLoad: number[] = systemLoadRows
    .map((r) => numberValue(r['load'] as number | string | undefined))
    .filter((v) => v > 0)
    .sort((a, b) => b - a);

  const sortedPrice: number[] = systemPriceRows
    .map((r) => numberValue(r['price'] as number | string | undefined))
    .sort((a, b) => b - a);

  // Cost breakdown mix items (add colors)
  const costMix = results.costBreakdown
    .filter((item) => item.value > 0)
    .map((item) => ({
      label: item.label,
      value: item.value,
      color: COST_COLORS[item.label] ?? '#94a3b8',
    }));

  // Storage series for SoC chart
  const storageStateSeries: TimeSeriesSeries[] = [{ key: 'state', label: 'State of charge', color: '#14b8a6' }];

  const hasStorage = storageRows.length > 0 && storageRows.some((r) => numberValue(r['state'] as number | string | undefined) > 0);

  return (
    <div className="results-dashboard">
      {/* KPI strip */}
      <div className="kpi-strip">
        <KpiCard
          label="Total dispatch"
          value={Math.round(totalDispatch).toLocaleString()}
          unit="MWh"
        />
        <KpiCard
          label="RE share"
          value={`${reShare.toFixed(1)}`}
          unit="%"
          green
        />
        <KpiCard
          label="Avg price"
          value={`${avgPrice.toFixed(1)}`}
          unit="$/MWh"
        />
        <KpiCard
          label="Emissions"
          value={emissionsDisplay}
          unit=""
        />
      </div>

      {/* Dispatch stack */}
      <DashboardSection title="Generation dispatch" defaultOpen>
        <InteractiveTimeSeriesCard
          title="Generation dispatch by carrier"
          description="Stacked area of generation over all snapshots"
          data={dispatchRows}
          series={dispatchSeries}
          mode="area"
          stacked
        />
      </DashboardSection>

      {/* Energy mix + Cost breakdown side by side */}
      <div className="dashboard-row">
        <DashboardSection title="Energy mix">
          <DonutChart data={results.carrierMix} />
        </DashboardSection>
        <DashboardSection title="Cost breakdown">
          {costMix.length > 0 ? (
            <DonutChart data={costMix} />
          ) : (
            <p className="empty-text" style={{ padding: '16px' }}>No cost data available — set a carbon price or run with marginal costs to see breakdown.</p>
          )}
        </DashboardSection>
      </div>

      {/* Duration curves side by side */}
      <div className="dashboard-row">
        <DashboardSection title="Load duration curve">
          <DurationCurveCard
            title="Load (MW)"
            data={sortedLoad}
            unit="MW"
            color="#f97316"
          />
        </DashboardSection>
        <DashboardSection title="Price duration curve">
          <DurationCurveCard
            title="Marginal price ($/MWh)"
            data={sortedPrice}
            unit="$/MWh"
            color="#111827"
          />
        </DashboardSection>
      </div>

      {/* Storage SoC — only if storage data exists */}
      {hasStorage && (
        <DashboardSection title="Storage state of charge">
          <InteractiveTimeSeriesCard
            title="Storage state of charge"
            description="State of charge (MWh) over all snapshots"
            data={storageRows}
            series={storageStateSeries}
            mode="area"
            stacked={false}
          />
        </DashboardSection>
      )}
    </div>
  );
}
