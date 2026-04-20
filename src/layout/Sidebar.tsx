/**
 * Sidebar — collapsible left-panel content.
 *
 * Owns four SidebarGroup sections: File, Constraints, Results, History.
 * The parent (<App>) keeps the <aside> shell and the collapse toggle button.
 */
import React from 'react';
import { CustomConstraint, RunHistoryEntry, RunResults, WorkbookModel } from '../shared/types';
import { SidebarGroup } from '../shared/components/SidebarGroup';
import { GlobalConstraintsSection } from '../features/constraints/GlobalConstraintsSection';
import { RunHistoryList } from '../features/run-history/RunHistoryList';
import { DateFormat } from '../features/settings/useSettings';

const MAX_UNPINNED = 5;

// ── Sidebar ───────────────────────────────────────────────────────────────────

export interface SidebarProps {
  model: WorkbookModel;
  results: RunResults | null;
  constraints: CustomConstraint[];
  onConstraintsChange: (c: CustomConstraint[]) => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onDemo: () => void;
  onExport: () => void;
  runHistory: RunHistoryEntry[];
  onRestoreRun: (entry: RunHistoryEntry) => void;
  onRenameHistoryEntry: (id: string, label: string) => void;
  onPinHistoryEntry: (id: string, pinned: boolean) => void;
  onDeleteHistoryEntry: (id: string) => void;
  onToggleComparison: (id: string, inComparison: boolean) => void;
  dateFormat: DateFormat;
  onDateFormatChange: (f: DateFormat) => void;
}

export function Sidebar({
  model,
  results,
  constraints,
  onConstraintsChange,
  onOpen,
  onSave,
  onSaveAs,
  onDemo,
  onExport,
  runHistory,
  onRestoreRun,
  onRenameHistoryEntry,
  onPinHistoryEntry,
  onDeleteHistoryEntry,
  onToggleComparison,
  dateFormat,
  onDateFormatChange,
}: SidebarProps) {
  const carriers = Array.from(
    new Set(model.carriers.map((c) => String(c.name ?? '')).filter(Boolean)),
  );

  return (
    <>
      <SidebarGroup title="File" defaultOpen>
        <div className="sg-btn-grid">
          <button className="tb-btn sg-full" onClick={onOpen}>Open</button>
          <button className="tb-btn sg-full" onClick={onSave}>Save</button>
          <button className="tb-btn sg-full" onClick={onSaveAs}>Save As</button>
          <button className="tb-btn tb-btn--muted sg-full" onClick={onDemo}>Demo</button>
          <button
            className="tb-btn sg-full"
            disabled={!results}
            title={results ? 'Export all inputs and outputs to Excel' : 'Run the model first to export results'}
            onClick={onExport}
          >
            Export
          </button>
        </div>
      </SidebarGroup>

      <SidebarGroup
        title="Constraints"
        badge={
          constraints.filter((c) => c.enabled).length > 0
            ? <span className="sg-badge">{constraints.filter((c) => c.enabled).length}</span>
            : undefined
        }
      >
        <GlobalConstraintsSection
          constraints={constraints}
          carriers={carriers}
          onChange={onConstraintsChange}
        />
      </SidebarGroup>

      {results && (
        <SidebarGroup title="Results" defaultOpen>
          <div className="sg-summary">
            {results.summary.map((s) => (
              <div key={s.label} className="sg-summary-item">
                <span className="sg-summary-label">{s.label}</span>
                <span className="sg-summary-value">{s.value}</span>
                <span className="sg-summary-detail">{s.detail}</span>
              </div>
            ))}
          </div>
        </SidebarGroup>
      )}

      {runHistory.length > 0 && (
        <SidebarGroup
          title="History"
          badge={<span className="sg-badge">{runHistory.length}</span>}
        >
          <RunHistoryList
            runHistory={runHistory}
            onRestoreRun={onRestoreRun}
            onRenameHistoryEntry={onRenameHistoryEntry}
            onPinHistoryEntry={onPinHistoryEntry}
            onDeleteHistoryEntry={onDeleteHistoryEntry}
            onToggleComparison={onToggleComparison}
          />
          <p className="hist-footnote">
            Last {MAX_UNPINNED} runs kept · pin to preserve
          </p>
        </SidebarGroup>
      )}

      <SidebarGroup title="Settings">
        <div className="sg-setting-row">
          <label className="sg-setting-label" htmlFor="date-format-select">
            Date format
          </label>
          <select
            id="date-format-select"
            className="sg-setting-select"
            value={dateFormat}
            onChange={(e) => onDateFormatChange(e.target.value as DateFormat)}
          >
            <option value="auto">Auto-detect</option>
            <option value="ymd">YYYY-MM-DD (ISO)</option>
            <option value="dmy">DD-MM-YYYY</option>
            <option value="mdy">MM-DD-YYYY</option>
          </select>
          <p className="sg-setting-hint">
            Applies to snapshot and time-series date columns.
          </p>
        </div>
      </SidebarGroup>
    </>
  );
}
