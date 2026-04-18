/**
 * Sidebar — collapsible left-panel content.
 *
 * Owns four SidebarGroup sections: File, Constraints, Results, History.
 * The parent (<App>) keeps the <aside> shell and the collapse toggle button.
 */
import React, { useState } from 'react';
import { CustomConstraint, RunHistoryEntry, RunResults, WorkbookModel } from '../../types';
import { SidebarGroup } from './SidebarGroup';
import { GlobalConstraintsSection } from '../constraints/GlobalConstraintsSection';

const MAX_UNPINNED = 5;

// ── Relative-time helper ──────────────────────────────────────────────────────

function formatRelTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── RunHistoryCard ────────────────────────────────────────────────────────────

interface RunHistoryCardProps {
  entry: RunHistoryEntry;
  onView: () => void;
  onRename: (label: string) => void;
  onPin: (pinned: boolean) => void;
  onDelete: () => void;
}

function RunHistoryCard({ entry, onView, onRename, onPin, onDelete }: RunHistoryCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.label);

  const commitRename = () => {
    onRename(draft.trim() || entry.label);
    setEditing(false);
  };

  // Show system emissions (index 4) and peak price (index 3) as quick KPIs
  const kpiEmissions = entry.results.summary[4];
  const kpiPrice = entry.results.summary[3];

  return (
    <div className={`hist-card${entry.pinned ? ' hist-card--pinned' : ''}`}>
      <div className="hist-card-header">
        {editing ? (
          <input
            className="hist-label-input"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
            }}
          />
        ) : (
          <span
            className="hist-label"
            onClick={() => { setDraft(entry.label); setEditing(true); }}
            title="Click to rename"
          >
            {entry.label}
          </span>
        )}
        <div className="hist-card-actions">
          <button
            className={`hist-pin-btn${entry.pinned ? ' active' : ''}`}
            title={entry.pinned ? 'Unpin' : "Pin — won't auto-expire"}
            onClick={() => onPin(!entry.pinned)}
          >
            {entry.pinned ? 'Unpin' : 'Pin'}
          </button>
          <button className="hist-delete-btn" title="Delete" onClick={onDelete}>x</button>
        </div>
      </div>

      <div className="hist-meta">
        <span>{formatRelTime(entry.savedAt)}</span>
        <span>·</span>
        <span className="hist-meta-filename">{entry.filename}</span>
      </div>

      <div className="hist-settings">
        <span>{entry.results.runMeta.snapshotCount} snaps</span>
        <span>{entry.snapshotWeight}h</span>
        {entry.carbonPrice > 0 && <span>${entry.carbonPrice}/t CO₂</span>}
        {entry.activeConstraints.length > 0 && (
          <span title={entry.activeConstraints.map((c) => c.label).join(', ')}>
            {entry.activeConstraints.length} constraint{entry.activeConstraints.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {(kpiEmissions || kpiPrice) && (
        <div className="hist-kpis">
          {kpiEmissions && (
            <span className="hist-kpi">
              <strong>{kpiEmissions.value}</strong> {kpiEmissions.label}
            </span>
          )}
          {kpiPrice && (
            <span className="hist-kpi">
              <strong>{kpiPrice.value}</strong> {kpiPrice.label}
            </span>
          )}
        </div>
      )}

      <button className="ghost-button sm hist-view-btn" onClick={onView}>
        View results →
      </button>
    </div>
  );
}

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
          <div className="hist-list">
            {runHistory.map((entry) => (
              <RunHistoryCard
                key={entry.id}
                entry={entry}
                onView={() => onRestoreRun(entry)}
                onRename={(label) => onRenameHistoryEntry(entry.id, label)}
                onPin={(pinned) => onPinHistoryEntry(entry.id, pinned)}
                onDelete={() => onDeleteHistoryEntry(entry.id)}
              />
            ))}
          </div>
          <p className="hist-footnote">
            Last {MAX_UNPINNED} runs kept · pin to preserve
          </p>
        </SidebarGroup>
      )}
    </>
  );
}
