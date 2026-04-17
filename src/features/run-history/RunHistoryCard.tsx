import React, { useState } from 'react';
import { RunHistoryEntry } from '../../shared/types';
import { formatRelTime } from '../../shared/utils/formatRelTime';

export interface RunHistoryCardProps {
  entry: RunHistoryEntry;
  onView: () => void;
  onRename: (label: string) => void;
  onPin: (pinned: boolean) => void;
  onDelete: () => void;
}

export function RunHistoryCard({ entry, onView, onRename, onPin, onDelete }: RunHistoryCardProps) {
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
            📌
          </button>
          <button className="hist-delete-btn" title="Delete" onClick={onDelete}>✕</button>
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
        {entry.carbonPrice > 0 && <span>💨 ${entry.carbonPrice}/t</span>}
        {entry.activeConstraints.length > 0 && (
          <span title={entry.activeConstraints.map((c) => c.label).join(', ')}>
            ⛓ {entry.activeConstraints.length}
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
