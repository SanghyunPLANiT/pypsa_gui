import React, { useRef } from 'react';
import {
  AnalyticsFocus,
  ChartSectionConfig,
  ChartSectionType,
  GroupByOption,
  MetricOption,
  RunResults,
  TimeframeOption,
  WorkbookModel,
} from '../../types';
import { clamp, numberValue, stringValue } from '../../shared/utils/helpers';
import { aggregateMetricRows, buildDonutFromMetric } from '../../utils/analytics';
import { EMPTY_METRIC_KEY } from '../../constants';
import { exportChartToExcel } from '../../utils/exportChart';
import { useToast } from '../common/Toast';
import { DonutChart } from './DonutChart';
import { InteractiveTimeSeriesCard } from './InteractiveTimeSeriesCard';
import { TimelineSlider } from '../common/DualRangeSlider';
import { useMetricOptions } from '../../features/analytics/useMetricOptions';

// ── Helpers ───────────────────────────────────────────────────────────────────
type FocusType = AnalyticsFocus['type'];

const FOCUS_LABELS: Record<FocusType, string> = {
  system:      'System',
  generator:   'Generator',
  bus:         'Bus',
  storageUnit: 'Storage Unit',
  store:       'Store',
  branch:      'Branch',
};

function assetNamesFor(focusType: FocusType, model: WorkbookModel): string[] {
  switch (focusType) {
    case 'generator':   return model.generators.map((r)    => stringValue(r.name)).filter(Boolean);
    case 'bus':         return model.buses.map((r)          => stringValue(r.name)).filter(Boolean);
    case 'storageUnit': return model.storage_units.map((r) => stringValue(r.name)).filter(Boolean);
    case 'store':       return model.stores.map((r)         => stringValue(r.name)).filter(Boolean);
    case 'branch':      return [
      ...model.lines.map((r)        => stringValue(r.name)),
      ...model.links.map((r)        => stringValue(r.name)),
      ...model.transformers.map((r) => stringValue(r.name)),
    ].filter(Boolean);
    default:            return [];
  }
}

// ── Asset pill multi-select ───────────────────────────────────────────────────
function AssetPills({
  assetNames,
  focusKeys,
  onChange,
}: {
  assetNames: string[];
  focusKeys: string[];
  onChange: (keys: string[]) => void;
}) {
  const allSelected = focusKeys.length === 0;

  const toggle = (name: string) => {
    if (allSelected) {
      // Start with everything selected except the clicked one
      onChange(assetNames.filter((n) => n !== name));
    } else if (focusKeys.includes(name)) {
      const next = focusKeys.filter((k) => k !== name);
      onChange(next.length === 0 ? [] : next); // empty = all
    } else {
      onChange([...focusKeys, name]);
    }
  };

  return (
    <div className="asset-pills">
      {/* "All" pill */}
      <button
        type="button"
        className={`asset-pill${allSelected ? ' asset-pill--active' : ''}`}
        onClick={() => onChange([])}
      >
        All
      </button>
      {assetNames.map((name) => {
        const active = allSelected || focusKeys.includes(name);
        return (
          <button
            key={name}
            type="button"
            className={`asset-pill${active ? ' asset-pill--active' : ''}`}
            onClick={() => toggle(name)}
          >
            {name}
          </button>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function UserDefinedChartCard({
  section,
  results,
  model,
  onChange,
  onClean,
  onRemove,
}: {
  section: ChartSectionConfig;
  results: RunResults | null;
  model: WorkbookModel;
  onChange: (next: ChartSectionConfig) => void;
  onClean: () => void;
  onRemove: () => void;
}) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  const assetNames = assetNamesFor(section.focusType, model);

  // Per-card metric options from the card's own focus/keys/groupBy
  const metricOptions: MetricOption[] = useMetricOptions(
    results,
    model,
    section.focusType,
    section.focusKeys,
    section.groupBy,
  );

  const metric     = metricOptions.find((m) => m.key === section.metricKey);
  const hasMetric  = Boolean(metric);
  const metricRows = metric?.rows || [];

  const safeStart = hasMetric
    ? clamp(Math.min(section.startIndex, section.endIndex), 0, Math.max(metricRows.length - 1, 0))
    : 0;
  const safeEnd = hasMetric
    ? clamp(Math.max(section.endIndex, safeStart), safeStart, Math.max(metricRows.length - 1, 0))
    : 0;
  const aggregatedRows = hasMetric
    ? aggregateMetricRows(metric!, safeStart, safeEnd, section.timeframe)
    : [];

  // Show Group by only when: non-system, multi/all selected, generator type (carriers meaningful)
  const isMultiOrAll  = section.focusType !== 'system' && section.focusKeys.length !== 1;
  const showGroupBy   = isMultiOrAll && section.focusType === 'generator';

  // ── Handlers ──────────────────────────────────────────────────────────────

  const resetMetric = (extra: Partial<ChartSectionConfig> = {}) =>
    onChange({ ...section, metricKey: EMPTY_METRIC_KEY, startIndex: 0, endIndex: 0, ...extra });

  const handleFocusTypeChange = (newType: FocusType) => {
    const names = assetNamesFor(newType, model);
    resetMetric({
      focusType: newType,
      focusKeys: newType === 'system' ? [] : [],  // start with "All" for non-system too
      groupBy: 'carrier',
    });
    void names; // suppress lint
  };

  const handleMetricChange = (newKey: string) => {
    const m   = metricOptions.find((x) => x.key === newKey);
    const len = m?.rows.length || 1;
    onChange({ ...section, metricKey: newKey, startIndex: 0, endIndex: Math.max(len - 1, 0) });
  };

  const handleExport = () => {
    if (!metric) return;
    let promise: Promise<void>;
    if (section.chartType === 'donut') {
      const data = buildDonutFromMetric(metric, safeStart, safeEnd);
      promise = exportChartToExcel(
        metric.label,
        ['label', 'value'],
        data.map((d) => ({ label: d.label, value: d.value })),
        chartContainerRef.current,
      );
    } else {
      const keys    = metric.series.map((s) => s.key);
      const headers = ['timestamp', ...keys];
      const rows    = aggregatedRows.map((r) => {
        const row: Record<string, unknown> = { timestamp: r.timestamp ?? r.label };
        keys.forEach((k) => { row[k] = numberValue(r[k] as any); });
        return row;
      });
      promise = exportChartToExcel(metric.label, headers, rows, chartContainerRef.current);
    }
    promise
      .then(() => showToast(`Exported ${metric.label}`, 'success'))
      .catch(()  => showToast('Export failed', 'error'));
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <section className="chart-card chart-builder-card">

      {/* header row */}
      <div className="chart-card-header chart-card-controls">
        <div>
          <h3>{hasMetric ? metric!.label : 'Empty chart'}</h3>
          <p>{hasMetric ? metric!.unit : 'Select a component and value to render a chart.'}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {hasMetric && (
            <button className="ghost-button chart-export-btn" onClick={handleExport}>⬇ Export</button>
          )}
          <button className="ghost-button" onClick={onClean}>Clean</button>
          <button className="ghost-button" style={{ color: '#dc2626' }} onClick={onRemove}>Remove</button>
        </div>
      </div>

      {/* controls row */}
      <div className="chart-builder-controls">

        {/* Component */}
        <label className="chart-control">
          <span>Component</span>
          <select
            value={section.focusType}
            onChange={(e) => handleFocusTypeChange(e.target.value as FocusType)}
          >
            {(Object.keys(FOCUS_LABELS) as FocusType[]).map((ft) => (
              <option key={ft} value={ft} disabled={ft !== 'system' && assetNamesFor(ft, model).length === 0}>
                {FOCUS_LABELS[ft]}
              </option>
            ))}
          </select>
        </label>

        {/* Value */}
        <label className="chart-control">
          <span>Value</span>
          <select
            value={section.metricKey}
            onChange={(e) => handleMetricChange(e.target.value)}
            disabled={!results}
          >
            <option value={EMPTY_METRIC_KEY}>Select value</option>
            {metricOptions.map((m) => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
        </label>

        {/* Group by — only for generator multi/all */}
        {showGroupBy && (
          <label className="chart-control">
            <span>Group by</span>
            <select
              value={section.groupBy}
              onChange={(e) =>
                onChange({ ...section, groupBy: e.target.value as GroupByOption, metricKey: EMPTY_METRIC_KEY, startIndex: 0, endIndex: 0 })
              }
            >
              <option value="carrier">Carrier</option>
              <option value="asset">Asset</option>
            </select>
          </label>
        )}

        {/* Temporal resolution */}
        <label className="chart-control">
          <span>Temporal resolution</span>
          <select
            value={section.timeframe}
            onChange={(e) => onChange({ ...section, timeframe: e.target.value as TimeframeOption })}
          >
            <option value="aggregated">Aggregated</option>
            <option value="yearly">By year</option>
            <option value="monthly">By month</option>
            <option value="weekly">By week</option>
            <option value="daily">By day</option>
            <option value="hourly">By hour</option>
          </select>
        </label>

        {/* Chart type */}
        <label className="chart-control">
          <span>Chart</span>
          <select
            value={section.chartType}
            onChange={(e) => onChange({ ...section, chartType: e.target.value as ChartSectionType })}
            disabled={!hasMetric}
          >
            <option value="line">Line</option>
            <option value="area">Area</option>
            <option value="bar">Bar</option>
            <option value="donut">Donut</option>
          </select>
        </label>

        {/* Stack */}
        {section.chartType !== 'donut' && (
          <label className="chart-control">
            <span>Stack</span>
            <select
              value={section.stacked ? 'stacked' : 'normal'}
              onChange={(e) => onChange({ ...section, stacked: e.target.value === 'stacked' })}
              disabled={!hasMetric}
            >
              <option value="stacked">Stacked</option>
              <option value="normal">Normal</option>
            </select>
          </label>
        )}
      </div>

      {/* Asset pill multi-select (hidden for system) */}
      {section.focusType !== 'system' && assetNames.length > 0 && (
        <div className="chart-control-row">
          <span className="chart-control-label">Assets</span>
          <AssetPills
            assetNames={assetNames}
            focusKeys={section.focusKeys}
            onChange={(keys) => resetMetric({ focusKeys: keys })}
          />
        </div>
      )}

      {/* Timeline slider */}
      {hasMetric && (
        <TimelineSlider
          data={metric!.rows}
          startIndex={safeStart}
          endIndex={safeEnd}
          onChange={(lo, hi) => onChange({ ...section, startIndex: lo, endIndex: hi })}
        />
      )}

      {/* Chart */}
      <div ref={chartContainerRef}>
        {!hasMetric ? (
          <div className="chart-empty-state">
            <p className="empty-text">Choose component, assets, value and chart type.</p>
          </div>
        ) : section.chartType === 'donut' ? (
          <section className="chart-card">
            <div className="chart-card-header">
              <div><h3>{metric!.label}</h3><p>average {metric!.unit} over window</p></div>
            </div>
            {buildDonutFromMetric(metric!, safeStart, safeEnd).length > 0
              ? <DonutChart data={buildDonutFromMetric(metric!, safeStart, safeEnd)} />
              : <p className="empty-text">No data for current selection.</p>
            }
          </section>
        ) : (
          <InteractiveTimeSeriesCard
            title={metric!.label}
            description={`${section.timeframe} · ${metric!.unit}`}
            data={aggregatedRows}
            series={metric!.series}
            mode={section.chartType}
            stacked={section.stacked}
          />
        )}
      </div>
    </section>
  );
}
