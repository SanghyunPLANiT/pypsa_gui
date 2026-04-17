/**
 * Sidebar — collapsible left-panel content.
 *
 * Extracted from App.tsx to keep the root component focused on state and
 * routing. Owns the three SidebarGroup sections: File, Constraints, Results.
 * The parent (<App>) keeps the <aside> shell and the collapse toggle button.
 */
import React from 'react';
import { CustomConstraint, RunResults, WorkbookModel } from '../../types';
import { SidebarGroup } from './SidebarGroup';
import { GlobalConstraintsSection } from '../constraints/GlobalConstraintsSection';

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
}: SidebarProps) {
  const carriers = Array.from(
    new Set(model.carriers.map((c) => String(c.name ?? '')).filter(Boolean)),
  );

  return (
    <>
      <SidebarGroup title="File" icon="📁" defaultOpen>
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
        icon="⛓"
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
        <SidebarGroup title="Results" icon="📊" defaultOpen>
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
    </>
  );
}
