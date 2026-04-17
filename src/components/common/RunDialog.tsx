/**
 * RunDialog — floating modal for single-year run configuration.
 *
 * Extracted from App.tsx to keep the root component focused on state
 * and routing. All run options (snapshot window, resolution, carbon
 * price, dry-run toggle) live here; the parent owns the state values.
 */
import React from 'react';
import { DualRangeSlider } from './DualRangeSlider';

export interface RunDialogProps {
  open: boolean;
  onClose: () => void;

  maxSnapshots: number;
  snapshotStart: number;
  snapshotEnd: number;
  snapshotWeight: number;
  carbonPrice: number;
  dryRun: boolean;

  onSnapshotStartChange: (v: number) => void;
  onSnapshotEndChange: (v: number) => void;
  onSnapshotWeightChange: (v: number) => void;
  onCarbonPriceChange: (v: number) => void;
  onDryRunChange: (v: boolean) => void;

  onRun: () => void;
}

export function RunDialog({
  open,
  onClose,
  maxSnapshots,
  snapshotStart,
  snapshotEnd,
  snapshotWeight,
  carbonPrice,
  dryRun,
  onSnapshotStartChange,
  onSnapshotEndChange,
  onSnapshotWeightChange,
  onCarbonPriceChange,
  onDryRunChange,
  onRun,
}: RunDialogProps) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="panel-title-row">
          <div>
            <p className="eyebrow">Run</p>
            <h2>Run configuration</h2>
          </div>
        </div>

        {maxSnapshots <= 1 ? (
          <div className="run-static-notice">
            <strong>Static single-period model</strong>
            <p>The workbook defines 1 snapshot (<code>now</code>). This runs as a single dispatch period.</p>
          </div>
        ) : (
          <>
            <div className="field" style={{ marginBottom: 16 }}>
              <span style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>
                Simulation window — <strong>{snapshotEnd - snapshotStart} hourly steps</strong>
                {' '}(step {snapshotStart} → {snapshotEnd} of {maxSnapshots})
              </span>
              <DualRangeSlider
                min={0}
                max={maxSnapshots}
                low={snapshotStart}
                high={snapshotEnd}
                formatLabel={(v) => `${v}`}
                onChange={(lo, hi) => { onSnapshotStartChange(lo); onSnapshotEndChange(hi); }}
              />
            </div>

            <div className="field" style={{ marginBottom: 8 }}>
              {(() => {
                const windowSize = snapshotEnd - snapshotStart;
                const modeledSnapshots = Math.ceil(windowSize / snapshotWeight);
                return (
                  <>
                    <span style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>
                      Time resolution — <strong>every {snapshotWeight}h</strong>
                      {' '}({modeledSnapshots} snapshots of {windowSize} hourly steps)
                    </span>
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                      {[1, 2, 3, 4, 6, 8, 12, 24].map((n) => (
                        <button
                          key={n}
                          className={`tb-btn${snapshotWeight === n ? '' : ' tb-btn--muted'}`}
                          style={{ minWidth: 40 }}
                          onClick={() => onSnapshotWeightChange(n)}
                        >
                          {n}h
                        </button>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>

            <p className="status-text" style={{ marginBottom: 12 }}>
              Resolution selects every Nth step — <code>snapshots[::N]</code> with{' '}
              <code>snapshot_weightings = N</code>. Higher N = coarser resolution, faster solve.
            </p>
          </>
        )}

        <div className="run-carbon-row">
          <label className="run-carbon-label" htmlFor="run-carbon-price">
            <span>💨 Carbon price</span>
            <span className="run-carbon-unit">$/tCO₂</span>
          </label>
          <input
            id="run-carbon-price"
            type="number"
            className="run-carbon-input"
            min={0}
            max={1000}
            step={1}
            value={carbonPrice}
            onChange={(e) => onCarbonPriceChange(Math.max(0, parseFloat(e.target.value) || 0))}
          />
          {carbonPrice > 0 && (
            <span className="run-carbon-hint">
              Added to each generator's marginal cost proportional to CO₂ emissions
            </span>
          )}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={dryRun}
            onChange={(e) => onDryRunChange(e.target.checked)}
            style={{ width: 16, height: 16, cursor: 'pointer' }}
          />
          <span style={{ fontSize: '0.9rem' }}>
            <strong>Dry run</strong> — validate model structure without optimising
          </span>
        </label>

        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose}>Cancel</button>
          <button className="run-button" onClick={onRun}>
            {dryRun ? 'Validate' : 'Run model'}
          </button>
        </div>
      </div>
    </div>
  );
}
