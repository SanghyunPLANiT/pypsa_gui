import React, { useRef, useState } from 'react';
import { RunResults, TimeSeriesRow, TimeSeriesSeries } from '../../types';
import { numberValue } from '../../utils/helpers';
import { exportChartToExcel } from '../../utils/exportChart';
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

// ── Collapsible section with optional export ───────────────────────────────────

interface SectionProps {
  title: string;
  defaultOpen?: boolean;
  onExport?: () => void;
  children: React.ReactNode;
}

function DashboardSection({ title, defaultOpen = false, onExport, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
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
          <span style={{ fontSize: '0.75rem', color: 'var(--muted)', userSelect: 'none' }}>
            {open ? '▲' : '▼'}
          </span>
        </button>
        {onExport && (
          <button
            type="button"
            className="chart-export-btn"
            title="Export data and chart to Excel"
            onClick={(e) => { e.stopPropagation(); onExport(); }}
          >
            ⬇ Export
          </button>
        )}
      </div>
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
  // Refs for chart containers (used to grab the SVG for export)
  const dispatchRef = useRef<HTMLDivElement>(null);
  const energyMixRef = useRef<HTMLDivElement>(null);
  const costRef = useRef<HTMLDivElement>(null);
  const loadDurRef = useRef<HTMLDivElement>(null);
  const priceDurRef = useRef<HTMLDivElement>(null);
  const storageRef = useRef<HTMLDivElement>(null);

  // KPI calculations
  const totalDispatch = results.carrierMix.reduce((s, m) => s + m.value, 0);
  const reCarriers = new Set(['Solar', 'Wind', 'Hydro']);
  const reDispatch = results.carrierMix.filter((m) => reCarriers.has(m.label)).reduce((s, m) => s + m.value, 0);
  const reShare = totalDispatch > 0 ? (reDispatch / totalDispatch) * 100 : 0;

  const avgPrice = systemPriceRows.length
    ? systemPriceRows.reduce((s, r) => s + numberValue(r['price'] as number | string | undefined), 0) / systemPriceRows.length
    : 0;

  const emissionsSummary = results.summary.find((s) => s.label === 'System emissions');
  const emissionsDisplay = emissionsSummary ? emissionsSummary.value : '—';

  const sortedLoad: number[] = systemLoadRows
    .map((r) => numberValue(r['load'] as number | string | undefined))
    .filter((v) => v > 0)
    .sort((a, b) => b - a);

  const sortedPrice: number[] = systemPriceRows
    .map((r) => numberValue(r['price'] as number | string | undefined))
    .sort((a, b) => b - a);

  const costMix = results.costBreakdown
    .filter((item) => item.value > 0)
    .map((item) => ({
      label: item.label,
      value: item.value,
      color: COST_COLORS[item.label] ?? '#94a3b8',
    }));

  const storageStateSeries: TimeSeriesSeries[] = [{ key: 'state', label: 'State of charge', color: '#14b8a6' }];
  const hasStorage = storageRows.length > 0 && storageRows.some((r) => numberValue(r['state'] as number | string | undefined) > 0);

  // ── Export helpers ────────────────────────────────────────────────────────

  const exportDispatch = () => {
    const carriers = dispatchSeries.map((s) => s.key);
    const headers = ['timestamp', ...carriers];
    const rows = dispatchRows.map((r) => {
      const row: Record<string, unknown> = { timestamp: r.timestamp ?? r.label };
      carriers.forEach((c) => { row[c] = numberValue(r[c] as number | string | undefined); });
      return row;
    });
    exportChartToExcel('generation_dispatch', headers, rows, dispatchRef.current);
  };

  const exportEnergyMix = () => {
    const headers = ['carrier', 'energy_MWh'];
    const rows = results.carrierMix.map((m) => ({ carrier: m.label, energy_MWh: m.value }));
    exportChartToExcel('energy_mix', headers, rows, energyMixRef.current);
  };

  const exportCostBreakdown = () => {
    const headers = ['category', 'cost'];
    const rows = results.costBreakdown.map((c) => ({ category: c.label, cost: c.value }));
    exportChartToExcel('cost_breakdown', headers, rows, costRef.current);
  };

  const exportLoadDuration = () => {
    const headers = ['rank', 'load_MW'];
    const rows = sortedLoad.map((v, i) => ({ rank: i + 1, load_MW: v }));
    exportChartToExcel('load_duration_curve', headers, rows, loadDurRef.current);
  };

  const exportPriceDuration = () => {
    const headers = ['rank', 'price_per_MWh'];
    const rows = sortedPrice.map((v, i) => ({ rank: i + 1, price_per_MWh: v }));
    exportChartToExcel('price_duration_curve', headers, rows, priceDurRef.current);
  };

  const exportStorage = () => {
    const headers = ['timestamp', 'state_MWh'];
    const rows = storageRows.map((r) => ({
      timestamp: r.timestamp ?? r.label,
      state_MWh: numberValue(r['state'] as number | string | undefined),
    }));
    exportChartToExcel('storage_state_of_charge', headers, rows, storageRef.current);
  };

  return (
    <div className="results-dashboard">
      {/* KPI strip */}
      <div className="kpi-strip">
        <KpiCard label="Total dispatch" value={Math.round(totalDispatch).toLocaleString()} unit="MWh" />
        <KpiCard label="RE share" value={`${reShare.toFixed(1)}`} unit="%" green />
        <KpiCard label="Avg price" value={`${avgPrice.toFixed(1)}`} unit="$/MWh" />
        <KpiCard label="Emissions" value={emissionsDisplay} unit="" />
      </div>

      {/* Dispatch stack */}
      <DashboardSection title="Generation dispatch" defaultOpen onExport={exportDispatch}>
        <div ref={dispatchRef}>
          <InteractiveTimeSeriesCard
            title="Generation dispatch by carrier"
            description="Stacked area of generation over all snapshots"
            data={dispatchRows}
            series={dispatchSeries}
            mode="area"
            stacked
          />
        </div>
      </DashboardSection>

      {/* Energy mix + Cost breakdown side by side */}
      <div className="dashboard-row">
        <DashboardSection title="Energy mix" onExport={exportEnergyMix}>
          <div ref={energyMixRef}>
            <DonutChart data={results.carrierMix} />
          </div>
        </DashboardSection>
        <DashboardSection title="Cost breakdown" onExport={exportCostBreakdown}>
          <div ref={costRef}>
            {costMix.length > 0 ? (
              <DonutChart data={costMix} />
            ) : (
              <p className="empty-text" style={{ padding: '16px' }}>
                No cost data available — set a carbon price or run with marginal costs to see breakdown.
              </p>
            )}
          </div>
        </DashboardSection>
      </div>

      {/* Duration curves side by side */}
      <div className="dashboard-row">
        <DashboardSection title="Load duration curve" onExport={exportLoadDuration}>
          <div ref={loadDurRef}>
            <DurationCurveCard title="Load (MW)" data={sortedLoad} unit="MW" color="#f97316" />
          </div>
        </DashboardSection>
        <DashboardSection title="Price duration curve" onExport={exportPriceDuration}>
          <div ref={priceDurRef}>
            <DurationCurveCard title="Marginal price ($/MWh)" data={sortedPrice} unit="$/MWh" color="#111827" />
          </div>
        </DashboardSection>
      </div>

      {/* Storage SoC */}
      {hasStorage && (
        <DashboardSection title="Storage state of charge" onExport={exportStorage}>
          <div ref={storageRef}>
            <InteractiveTimeSeriesCard
              title="Storage state of charge"
              description="State of charge (MWh) over all snapshots"
              data={storageRows}
              series={storageStateSeries}
              mode="area"
              stacked={false}
            />
          </div>
        </DashboardSection>
      )}
    </div>
  );
}
