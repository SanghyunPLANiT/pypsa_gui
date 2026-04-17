import React from 'react';

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  notes: string[];
  snapshotCount: number;
  networkSummary: Record<string, number>;
}

interface Props {
  validateResult: ValidationResult | null;
  onValidate: () => void;
  onRun: () => void;
}

export function ValidationPane({ validateResult, onValidate, onRun }: Props) {
  if (!validateResult) {
    return (
      <div className="pane validation-pane">
        <div className="validation-empty">
          <p className="eyebrow">Validation</p>
          <h2>No validation result yet</h2>
          <p className="status-text" style={{ marginTop: 8 }}>
            Open <strong>Run</strong> → check <strong>Dry run</strong> → click <strong>Validate</strong> to check the model structure.
          </p>
          <button className="run-button" style={{ marginTop: 18 }} onClick={onValidate}>
            Validate now
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pane validation-pane">
      <div className="validation-report">
        <div className="validation-report-header">
          <div>
            <p className="eyebrow">Validation report</p>
            <h2 className={validateResult.valid ? 'text-ok' : 'text-error'}>
              {validateResult.valid ? 'Passed' : 'Failed'}
            </h2>
          </div>
          <div style={{ display: 'flex', gap: 8, alignSelf: 'flex-start', marginTop: 4 }}>
            <button className="tb-btn" onClick={onValidate}>Re-validate</button>
            {validateResult.valid && (
              <button className="run-button" onClick={onRun}>Run model</button>
            )}
          </div>
        </div>

        {validateResult.errors.length > 0 && (
          <div className="validation-section validation-section--error">
            <p className="validation-section-title">Errors ({validateResult.errors.length})</p>
            <ul className="validation-list">
              {validateResult.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        )}

        {validateResult.warnings.length > 0 && (
          <div className="validation-section validation-section--warn">
            <p className="validation-section-title">Warnings ({validateResult.warnings.length})</p>
            <ul className="validation-list">
              {validateResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}

        {Object.keys(validateResult.networkSummary).length > 0 && (
          <div className="validation-section">
            <p className="validation-section-title">Network summary</p>
            <div className="validation-summary-grid">
              {Object.entries(validateResult.networkSummary).map(([k, v]) => (
                <div key={k} className="metric-card">
                  <span>{k}</span>
                  <strong>{v}</strong>
                </div>
              ))}
            </div>
          </div>
        )}

        {validateResult.notes.length > 0 && (
          <div className="validation-section">
            <p className="validation-section-title">Build notes</p>
            <ul className="validation-list validation-list--notes">
              {validateResult.notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
