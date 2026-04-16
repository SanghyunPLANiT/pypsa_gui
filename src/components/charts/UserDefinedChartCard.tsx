import React from 'react';
import { ChartSectionConfig, ChartSectionType, MetricOption, TimeframeOption } from '../../types';
import { clamp } from '../../utils/helpers';
import { aggregateMetricRows, buildDonutFromMetric } from '../../utils/analytics';
import { EMPTY_METRIC_KEY } from '../../constants';
import { DonutChart } from './DonutChart';
import { InteractiveTimeSeriesCard } from './InteractiveTimeSeriesCard';
import { TimelineSlider } from '../common/DualRangeSlider';

export function UserDefinedChartCard({
  section,
  metricOptions,
  onChange,
  onClean,
  onRemove,
}: {
  section: ChartSectionConfig;
  metricOptions: MetricOption[];
  onChange: (next: ChartSectionConfig) => void;
  onClean: () => void;
  onRemove: () => void;
}) {
  const metric = metricOptions.find((item) => item.key === section.metricKey);
  const hasMetric = Boolean(metric);
  const metricRows = metric?.rows || [];
  const safeStart = hasMetric ? clamp(Math.min(section.startIndex, section.endIndex), 0, Math.max(metricRows.length - 1, 0)) : 0;
  const safeEnd = hasMetric ? clamp(Math.max(section.endIndex, safeStart), safeStart, Math.max(metricRows.length - 1, 0)) : 0;
  const aggregatedRows = hasMetric ? aggregateMetricRows(metric!, safeStart, safeEnd, section.timeframe) : [];
  const allowDonut = Boolean(metric?.allowDonut);

  return (
    <section className="chart-card chart-builder-card">
      <div className="chart-card-header chart-card-controls">
        <div>
          <h3>{hasMetric ? metric!.label : 'Empty chart'}</h3>
          <p>{hasMetric ? metric!.unit : 'Select a value to render a chart.'}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="ghost-button" onClick={onClean}>Clean</button>
          <button className="ghost-button" style={{ color: '#dc2626' }} onClick={onRemove}>Remove</button>
        </div>
      </div>
      <div className="chart-builder-controls">
        <label className="chart-control">
          <span>Value</span>
          <select
            value={section.metricKey}
            onChange={(event) =>
              onChange({
                ...section,
                metricKey: event.target.value,
                startIndex: 0,
                endIndex: Math.max((metricOptions.find((item) => item.key === event.target.value)?.rows.length || 1) - 1, 0),
                chartType:
                  event.target.value !== EMPTY_METRIC_KEY && metricOptions.find((item) => item.key === event.target.value)?.allowDonut
                    ? section.chartType
                    : section.chartType === 'donut' ? 'line' : section.chartType,
              })
            }
          >
            <option value={EMPTY_METRIC_KEY}>Select value</option>
            {metricOptions.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
        </label>
        <label className="chart-control">
          <span>Timeframe</span>
          <select value={section.timeframe} onChange={(event) => onChange({ ...section, timeframe: event.target.value as TimeframeOption })}>
            <option value="aggregated">All aggregated</option>
            <option value="yearly">Yearly</option>
            <option value="monthly">Monthly</option>
            <option value="weekly">Weekly</option>
            <option value="daily">Daily</option>
            <option value="hourly">Hourly</option>
          </select>
        </label>
        <label className="chart-control">
          <span>Chart</span>
          <select value={section.chartType} onChange={(event) => onChange({ ...section, chartType: event.target.value as ChartSectionType })} disabled={!hasMetric}>
            <option value="line">Line</option>
            <option value="area">Area</option>
            <option value="bar">Bar</option>
            <option value="donut" disabled={!allowDonut}>Donut</option>
          </select>
        </label>
        {section.chartType !== 'donut' && (
          <label className="chart-control">
            <span>Stacking</span>
            <select value={section.stacked ? 'stacked' : 'normal'} onChange={(event) => onChange({ ...section, stacked: event.target.value === 'stacked' })} disabled={!hasMetric}>
              <option value="stacked">Stacked</option>
              <option value="normal">Normal</option>
            </select>
          </label>
        )}
      </div>
      {hasMetric && (
        <TimelineSlider
          data={metric!.rows}
          startIndex={safeStart}
          endIndex={safeEnd}
          onChange={(lo, hi) => onChange({ ...section, startIndex: lo, endIndex: hi })}
        />
      )}
      {!hasMetric ? (
        <div className="chart-empty-state">
          <p className="empty-text">Choose a value, timeframe, and chart type for this section.</p>
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
    </section>
  );
}
