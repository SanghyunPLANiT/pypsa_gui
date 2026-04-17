import React, { useRef } from 'react';
import {
  AnalyticsFocus,
  ChartSectionConfig,
  ChartSectionType,
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

// ── Component types shown in the selector ─────────────────────────────────────
type FocusType = AnalyticsFocus['type'];

const FOCUS_LABELS: Record<FocusType, string> = {
  system:      'System',
  generator:   'Generator',
  bus:         'Bus',
  storageUnit: 'Storage Unit',
  store:       'Store',
  branch:      'Branch',
};

// Returns the list of asset names for a given focus type from the model
function assetNamesFor(focusType: FocusType, model: WorkbookModel): string[] {
  switch (focusType) {
    case 'generator':   return model.generators.map((r) => stringValue(r.name)).filter(Boolean);
    case 'bus':         return model.buses.map((r) => stringValue(r.name)).filter(Boolean);
    case 'storageUnit': return model.storage_units.map((r) => stringValue(r.name)).filter(Boolean);
    case 'store':       return model.stores.map((r) => stringValue(r.name)).filter(Boolean);
    case 'branch':      return [
      ...model.lines.map((r) => stringValue(r.name)),
      ...model.links.map((r) => stringValue(r.name)),
      ...model.transformers.map((r) => stringValue(r.name)),
    ].filter(Boolean);
    default:            return [];
  }
}

// Build an AnalyticsFocus object from the section's stored type/key
function sectionFocus(section: ChartSectionConfig): AnalyticsFocus {
  if (section.focusType === 'system') return { type: 'system' };
  return { type: section.focusType, key: section.focusKey } as AnalyticsFocus;
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

  // Per-card metric options derived from the card's own focusType/focusKey
  const focus = sectionFocus(section);
  const metricOptions: MetricOption[] = useMetricOptions(results, model, focus);

  const metric = metricOptions.find((item) => item.key === section.metricKey);
  const hasMetric = Boolean(metric);
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
  const allowDonut = Boolean(metric?.allowDonut);

  // Asset names for the sub-selector (non-system components)
  const assetNames = assetNamesFor(section.focusType, model);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleFocusTypeChange = (newType: FocusType) => {
    const firstAsset = assetNamesFor(newType, model)[0] || '';
    onChange({
      ...section,
      focusType: newType,
      focusKey: newType === 'system' ? '' : firstAsset,
      metricKey: EMPTY_METRIC_KEY,
      startIndex: 0,
      endIndex: 0,
    });
  };

  const handleFocusKeyChange = (newKey: string) => {
    onChange({
      ...section,
      focusKey: newKey,
      metricKey: EMPTY_METRIC_KEY,
      startIndex: 0,
      endIndex: 0,
    });
  };

  const handleMetricChange = (newKey: string) => {
    const newMetric = metricOptions.find((m) => m.key === newKey);
    const len = newMetric?.rows.length || 1;
    onChange({
      ...section,
      metricKey: newKey,
      startIndex: 0,
      endIndex: Math.max(len - 1, 0),
      chartType:
        newKey !== EMPTY_METRIC_KEY && newMetric?.allowDonut
          ? section.chartType
          : section.chartType === 'donut' ? 'line' : section.chartType,
    });
  };

  const handleExport = () => {
    if (!metric) return;
    let promise: Promise<void>;
    if (section.chartType === 'donut') {
      const donutData = buildDonutFromMetric(metric, safeStart, safeEnd);
      promise = exportChartToExcel(
        metric.label,
        ['label', 'value'],
        donutData.map((d) => ({ label: d.label, value: d.value })),
        chartContainerRef.current,
      );
    } else {
      const seriesKeys = metric.series.map((s) => s.key);
      const headers = ['timestamp', ...seriesKeys];
      const rows = aggregatedRows.map((r) => {
        const row: Record<string, unknown> = { timestamp: r.timestamp ?? r.label };
        seriesKeys.forEach((k) => { row[k] = numberValue(r[k] as number | string | undefined); });
        return row;
      });
      promise = exportChartToExcel(metric.label, headers, rows, chartContainerRef.current);
    }
    promise
      .then(() => showToast(`Exported ${metric.label}`, 'success'))
      .catch(() => showToast('Export failed', 'error'));
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <section className="chart-card chart-builder-card">
      <div className="chart-card-header chart-card-controls">
        <div>
          <h3>{hasMetric ? metric!.label : 'Empty chart'}</h3>
          <p>{hasMetric ? metric!.unit : 'Select a component and value to render a chart.'}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {hasMetric && (
            <button
              className="ghost-button chart-export-btn"
              title="Export data and chart to Excel"
              onClick={handleExport}
            >
              ⬇ Export
            </button>
          )}
          <button className="ghost-button" onClick={onClean}>Clean</button>
          <button className="ghost-button" style={{ color: '#dc2626' }} onClick={onRemove}>Remove</button>
        </div>
      </div>

      {/* ── Controls row ─────────────────────────────────────────────── */}
      <div className="chart-builder-controls">

        {/* Component type */}
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

        {/* Asset name sub-selector (hidden for system) */}
        {section.focusType !== 'system' && assetNames.length > 0 && (
          <label className="chart-control">
            <span>Asset</span>
            <select
              value={section.focusKey}
              onChange={(e) => handleFocusKeyChange(e.target.value)}
            >
              {assetNames.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>
        )}

        {/* Value */}
        <label className="chart-control">
          <span>Value</span>
          <select
            value={section.metricKey}
            onChange={(e) => handleMetricChange(e.target.value)}
            disabled={!results}
          >
            <option value={EMPTY_METRIC_KEY}>Select value</option>
            {metricOptions.map((item) => (
              <option key={item.key} value={item.key}>{item.label}</option>
            ))}
          </select>
        </label>

        {/* Temporal resolution (was "Group") */}
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
            <option value="donut" disabled={!allowDonut}>Donut</option>
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

      {/* ── Timeline slider ──────────────────────────────────────────── */}
      {hasMetric && (
        <TimelineSlider
          data={metric!.rows}
          startIndex={safeStart}
          endIndex={safeEnd}
          onChange={(lo, hi) => onChange({ ...section, startIndex: lo, endIndex: hi })}
        />
      )}

      {/* ── Chart area ───────────────────────────────────────────────── */}
      <div ref={chartContainerRef}>
        {!hasMetric ? (
          <div className="chart-empty-state">
            <p className="empty-text">
              Choose a component, value, temporal resolution, and chart type for this section.
            </p>
          </div>
        ) : section.chartType === 'donut' ? (
          <section className="chart-card">
            <div className="chart-card-header">
              <div>
                <h3>{metric!.label}</h3>
                <p>{`average ${metric!.unit} over selected time window`}</p>
              </div>
            </div>
            {buildDonutFromMetric(metric!, safeStart, safeEnd).length > 0 ? (
              <DonutChart data={buildDonutFromMetric(metric!, safeStart, safeEnd)} />
            ) : (
              <p className="empty-text">No aggregated values available for the current selection.</p>
            )}
          </section>
        ) : (
          <InteractiveTimeSeriesCard
            title={metric!.label}
            description={`${section.timeframe} ${metric!.unit}`}
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
