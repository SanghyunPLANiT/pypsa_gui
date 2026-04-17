import React from 'react';
import type { MacroSettings, DemandForecastSettings, WorkbookModel, MultiYearResults } from '../../types';

// ── helpers ───────────────────────────────────────────────────────────────────

/** Derive the list of investment period years from macro settings. */
export function deriveInvestmentPeriods(s: MacroSettings): number[] {
  return Array.from({ length: s.periodCount }, (_, i) => s.baseYear + i * s.periodLength);
}

/** Scan the workbook to check multi-year data readiness. */
export function detectMultiYearReadiness(
  model: WorkbookModel,
  investmentPeriods: number[],
): { hasMultiYearLoads: boolean; detectedYears: number[]; hasBuildYear: boolean } {
  const loadsPSet: Record<string, unknown>[] = (model['loads-p_set'] as Record<string, unknown>[]) ?? [];
  const detectedYears: number[] = [];
  if (loadsPSet.length > 0) {
    const keys = Object.keys(loadsPSet[0]);
    for (const yr of investmentPeriods) {
      if (keys.includes(String(yr))) detectedYears.push(yr);
    }
  }
  const hasMultiYearLoads = detectedYears.length >= 2;
  const generators: Record<string, unknown>[] = (model.generators as Record<string, unknown>[]) ?? [];
  const hasBuildYear = generators.some(
    (row) => row['build_year'] != null && row['build_year'] !== '',
  );
  return { hasMultiYearLoads, detectedYears, hasBuildYear };
}

// ── sub-components ────────────────────────────────────────────────────────────

function StepHeader({
  number,
  title,
  status,
}: {
  number: number;
  title: string;
  status: 'ok' | 'warn' | 'idle';
}) {
  const icon = status === 'ok' ? '✓' : status === 'warn' ? '⚠' : '·';
  const cls = `my-step-icon my-step-icon--${status}`;
  return (
    <div className="my-step-header">
      <span className="my-step-num">{number}</span>
      <span className="my-step-title">{title}</span>
      <span className={cls}>{icon}</span>
    </div>
  );
}

// ── main panel ────────────────────────────────────────────────────────────────

interface Props {
  model: WorkbookModel;
  macroSettings: MacroSettings;
  onMacroChange: (s: MacroSettings) => void;
  demandForecast: DemandForecastSettings;
  onDemandChange: (s: DemandForecastSettings) => void;
  multiYearRunStatus: 'idle' | 'running' | 'done' | 'error';
  multiYearResults: MultiYearResults | null;
  onRunMultiYear: () => void;
}

export function MultiYearPanel({
  model,
  macroSettings,
  onMacroChange,
  demandForecast,
  onDemandChange,
  multiYearRunStatus,
  multiYearResults,
  onRunMultiYear,
}: Props) {
  const investmentPeriods = deriveInvestmentPeriods(macroSettings);
  const readiness = detectMultiYearReadiness(model, investmentPeriods);

  const timelineStr = investmentPeriods.join(' → ') + ' → ' + (investmentPeriods[investmentPeriods.length - 1] + macroSettings.periodLength);

  // helpers
  const setMacro = (patch: Partial<MacroSettings>) => onMacroChange({ ...macroSettings, ...patch });
  const setForecast = (patch: Partial<DemandForecastSettings>) => onDemandChange({ ...demandForecast, ...patch });

  const handleAnnualChange = (val: number) => {
    setForecast({
      annualGrowthPct: val,
      peakGrowthPct: demandForecast.peakTouched ? demandForecast.peakGrowthPct : null,
      floorGrowthPct: demandForecast.floorTouched ? demandForecast.floorGrowthPct : null,
    });
  };

  const effectivePeak = demandForecast.peakTouched && demandForecast.peakGrowthPct != null
    ? demandForecast.peakGrowthPct
    : demandForecast.annualGrowthPct;

  const effectiveFloor = demandForecast.floorTouched && demandForecast.floorGrowthPct != null
    ? demandForecast.floorGrowthPct
    : demandForecast.annualGrowthPct;

  const nYears = macroSettings.periodLength;
  const peakPreview = ((1 + effectivePeak / 100) ** nYears - 1) * 100;
  const floorPreview = ((1 + effectiveFloor / 100) ** nYears - 1) * 100;

  const step2Status: 'ok' | 'warn' | 'idle' =
    readiness.hasMultiYearLoads ? 'ok' : 'warn';

  const step3Status: 'ok' | 'warn' | 'idle' =
    macroSettings.discountRate > 0 ? 'ok' : 'warn';

  const numFmt = (n: number) => n.toFixed(1);

  return (
    <div className="my-panel">

      {/* ── Step 1: Investment Periods ── */}
      <div className="my-step">
        <StepHeader number={1} title="Investment Periods" status="ok" />
        <div className="my-step-body">
          <div className="my-field-row">
            <label>Base year</label>
            <input
              type="number"
              className="my-input my-input--sm"
              value={macroSettings.baseYear}
              min={2000}
              max={2100}
              step={1}
              onChange={(e) => setMacro({ baseYear: parseInt(e.target.value) || new Date().getFullYear() })}
            />
          </div>
          <div className="my-field-row">
            <label>Periods</label>
            <input
              type="number"
              className="my-input my-input--sm"
              value={macroSettings.periodCount}
              min={2}
              max={10}
              step={1}
              onChange={(e) => setMacro({ periodCount: Math.max(2, parseInt(e.target.value) || 3) })}
            />
          </div>
          <div className="my-field-row">
            <label>Period length</label>
            <div className="my-input-unit">
              <input
                type="number"
                className="my-input my-input--sm"
                value={macroSettings.periodLength}
                min={1}
                max={20}
                step={1}
                onChange={(e) => setMacro({ periodLength: Math.max(1, parseInt(e.target.value) || 5) })}
              />
              <span className="my-unit">yr</span>
            </div>
          </div>
          <div className="my-timeline">{timelineStr}</div>
        </div>
      </div>

      {/* ── Step 2: Demand Data ── */}
      <div className="my-step">
        <StepHeader number={2} title="Demand Data" status={step2Status} />
        <div className="my-step-body">
          {readiness.hasMultiYearLoads ? (
            <div className="my-detect-ok">
              <span className="my-detect-row">✓ Multi-year loads ({readiness.detectedYears.join(', ')})</span>
              {readiness.hasBuildYear && (
                <span className="my-detect-row">✓ Generator build years</span>
              )}
            </div>
          ) : (
            <>
              <p className="my-hint">No multi-year load data found — extrapolating from base year using growth rates.</p>
              {readiness.hasBuildYear && (
                <span className="my-detect-row my-detect-partial">✓ Generator build years detected</span>
              )}
              <div className="my-field-row">
                <label>Annual growth</label>
                <div className="my-input-unit">
                  <input
                    type="number"
                    className="my-input my-input--sm"
                    value={numFmt(demandForecast.annualGrowthPct)}
                    step={0.1}
                    min={-50}
                    max={100}
                    onChange={(e) => handleAnnualChange(parseFloat(e.target.value) || 0)}
                  />
                  <span className="my-unit">%</span>
                </div>
              </div>
              <div className="my-field-row">
                <label>Peak growth</label>
                <div className="my-input-unit">
                  <input
                    type="number"
                    className="my-input my-input--sm"
                    value={numFmt(effectivePeak)}
                    step={0.1}
                    min={-50}
                    max={100}
                    onChange={(e) => {
                      setForecast({ peakGrowthPct: parseFloat(e.target.value) || 0, peakTouched: true });
                    }}
                  />
                  <span className="my-unit">%</span>
                </div>
              </div>
              <div className="my-field-row">
                <label>Floor growth</label>
                <div className="my-input-unit">
                  <input
                    type="number"
                    className="my-input my-input--sm"
                    value={numFmt(effectiveFloor)}
                    step={0.1}
                    min={-50}
                    max={100}
                    onChange={(e) => {
                      setForecast({ floorGrowthPct: parseFloat(e.target.value) || 0, floorTouched: true });
                    }}
                  />
                  <span className="my-unit">%</span>
                </div>
              </div>
              <div className="my-preview">
                Period +{nYears}yr: peak {peakPreview >= 0 ? '+' : ''}{numFmt(peakPreview)}%,
                {' '}floor {floorPreview >= 0 ? '+' : ''}{numFmt(floorPreview)}%
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Step 3: Macro Settings ── */}
      <div className="my-step">
        <StepHeader number={3} title="Macro Settings" status={step3Status} />
        <div className="my-step-body">
          <div className="my-field-row">
            <label>Discount rate</label>
            <div className="my-input-unit">
              <input
                type="number"
                className="my-input my-input--sm"
                value={numFmt(macroSettings.discountRate * 100)}
                step={0.5}
                min={0}
                max={30}
                onChange={(e) => setMacro({ discountRate: Math.max(0, (parseFloat(e.target.value) || 0) / 100) })}
              />
              <span className="my-unit">%</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Step 4: Run ── */}
      <div className="my-step">
        <StepHeader number={4} title="Run" status="idle" />
        <div className="my-step-body">
          <button
            className={`run-button my-run-btn${multiYearRunStatus === 'running' ? ' run-button--running' : ''}`}
            onClick={onRunMultiYear}
            disabled={multiYearRunStatus === 'running'}
          >
            {multiYearRunStatus === 'running' ? 'Running…' : '▶ Run Multi Year'}
          </button>
          {multiYearRunStatus === 'done' && multiYearResults && (
            <div className="my-run-summary">
              <span className="my-run-status my-run-status--done">Done</span>
              <span className="my-run-detail">
                {multiYearResults.periods.length} periods · NPV ${multiYearResults.totalNpvM.toFixed(1)}M
              </span>
            </div>
          )}
          {multiYearRunStatus === 'error' && (
            <span className="my-run-status my-run-status--error">Error — check console</span>
          )}
        </div>
      </div>

    </div>
  );
}
