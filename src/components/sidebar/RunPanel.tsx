import React from 'react';
import { DualRangeSlider } from '../common/DualRangeSlider';
import type { MacroSettings } from '../../types';
import { deriveInvestmentPeriods } from './MultiYearPanel';

interface RunPanelProps {
  mode: 'single' | 'multiyear';
  onModeChange: (m: 'single' | 'multiyear') => void;

  // single-year options
  snapshotStart: number;
  snapshotEnd: number;
  snapshotWeight: number;
  maxSnapshots: number;
  dryRun: boolean;
  carbonPrice: number;
  onSnapshotStartChange: (v: number) => void;
  onSnapshotEndChange: (v: number) => void;
  onSnapshotWeightChange: (v: number) => void;
  onDryRunChange: (v: boolean) => void;
  onCarbonPriceChange: (v: number) => void;

  // macro settings (for multi-year summary)
  macroSettings: MacroSettings;

  // actions
  onRunSingle: () => void;
  onRunMultiYear: () => void;
  singleRunStatus: 'idle' | 'running' | 'done' | 'error';
  multiYearRunStatus: 'idle' | 'running' | 'done' | 'error';
}

export function RunPanel({
  mode,
  onModeChange,
  snapshotStart,
  snapshotEnd,
  snapshotWeight,
  maxSnapshots,
  dryRun,
  carbonPrice,
  onSnapshotStartChange,
  onSnapshotEndChange,
  onSnapshotWeightChange,
  onDryRunChange,
  onCarbonPriceChange,
  macroSettings,
  onRunSingle,
  onRunMultiYear,
  singleRunStatus,
  multiYearRunStatus,
}: RunPanelProps) {
  const investmentYears = deriveInvestmentPeriods(macroSettings);
  const snapshotCount = snapshotEnd - snapshotStart;
  const modeledSnapshots = Math.ceil(snapshotCount / snapshotWeight);

  return (
    <div className="rp-panel">
      {/* Mode toggle */}
      <div className="rp-mode-toggle">
        <button
          className={`rp-mode-btn${mode === 'single' ? ' rp-mode-btn--active' : ''}`}
          onClick={() => onModeChange('single')}
        >
          Single Year
        </button>
        <button
          className={`rp-mode-btn${mode === 'multiyear' ? ' rp-mode-btn--active' : ''}`}
          onClick={() => onModeChange('multiyear')}
        >
          Multi Year
        </button>
      </div>

      {/* ── Single Year section ── */}
      {mode === 'single' && (
        <div className="rp-section">
          {maxSnapshots <= 1 ? (
            <div className="rp-static-notice">
              <strong>Static single-period model</strong>
              <p>1 snapshot defined. Runs as a single dispatch period.</p>
            </div>
          ) : (
            <>
              <div className="rp-field">
                <span className="rp-field-label">
                  Window — <strong>{snapshotCount} steps</strong>
                  {' '}({snapshotStart} → {snapshotEnd} of {maxSnapshots})
                </span>
                <DualRangeSlider
                  min={0}
                  max={maxSnapshots}
                  low={snapshotStart}
                  high={snapshotEnd}
                  formatLabel={(v) => `${v}`}
                  onChange={(lo, hi) => {
                    onSnapshotStartChange(lo);
                    onSnapshotEndChange(hi);
                  }}
                />
              </div>
              <div className="rp-field">
                <span className="rp-field-label">
                  Resolution — <strong>every {snapshotWeight}h</strong>
                  {' '}({modeledSnapshots} snapshots)
                </span>
                <div className="rp-res-btns">
                  {[1, 2, 3, 4, 6, 8, 12, 24].map((n) => (
                    <button
                      key={n}
                      className={`tb-btn${snapshotWeight === n ? '' : ' tb-btn--muted'}`}
                      onClick={() => onSnapshotWeightChange(n)}
                    >
                      {n}h
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="rp-field">
            <span className="rp-field-label">💨 Carbon price ($/tCO₂)</span>
            <input
              type="number"
              className="my-input"
              min={0}
              max={1000}
              step={1}
              value={carbonPrice}
              onChange={(e) => onCarbonPriceChange(Math.max(0, parseFloat(e.target.value) || 0))}
              style={{ width: '100%' }}
            />
          </div>

          <label className="rp-dryrun-row">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => onDryRunChange(e.target.checked)}
            />
            <span>Dry run (validate only)</span>
          </label>

          <button
            className={`run-button rp-run-btn${singleRunStatus === 'running' ? ' run-button--running' : ''}`}
            onClick={onRunSingle}
            disabled={singleRunStatus === 'running'}
          >
            {singleRunStatus === 'running'
              ? 'Running…'
              : dryRun
              ? '✓ Validate'
              : '▶ Run'}
          </button>

          {singleRunStatus === 'done' && (
            <span className="rp-status rp-status--done">Done</span>
          )}
          {singleRunStatus === 'error' && (
            <span className="rp-status rp-status--error">Error</span>
          )}
        </div>
      )}

      {/* ── Multi Year section ── */}
      {mode === 'multiyear' && (
        <div className="rp-section">
          <div className="rp-my-summary">
            <span className="rp-my-timeline">
              {investmentYears.join(' → ')} → {investmentYears[investmentYears.length - 1] + macroSettings.periodLength}
            </span>
            <span className="rp-my-hint">Configure periods and demand in Multi Year ↑</span>
          </div>

          <button
            className={`run-button rp-run-btn${multiYearRunStatus === 'running' ? ' run-button--running' : ''}`}
            onClick={onRunMultiYear}
            disabled={multiYearRunStatus === 'running'}
          >
            {multiYearRunStatus === 'running' ? 'Running…' : '▶ Run Multi Year'}
          </button>

          {multiYearRunStatus === 'done' && (
            <span className="rp-status rp-status--done">Done</span>
          )}
          {multiYearRunStatus === 'error' && (
            <span className="rp-status rp-status--error">Error</span>
          )}
        </div>
      )}
    </div>
  );
}
