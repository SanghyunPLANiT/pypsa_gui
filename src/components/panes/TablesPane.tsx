import React, { useState } from 'react';
import { GridRow, Primitive, SheetName, TableSel, WorkbookModel } from '../../types';
import { TABLE_GROUPS } from '../../constants';
import { getColumns, stringValue } from '../../utils/helpers';

interface SpreadsheetGridProps {
  rows: GridRow[];
  cols: string[];
  readOnly?: boolean;
  onUpdate?: (rowIndex: number, col: string, val: Primitive) => void;
}

function inferInputValue(raw: string, current: Primitive): Primitive {
  if (raw === '') return '';
  if (typeof current === 'number') {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : current;
  }
  if (typeof current === 'boolean') return raw.toLowerCase() === 'true';
  if (raw.toLowerCase() === 'true') return true;
  if (raw.toLowerCase() === 'false') return false;
  const parsed = Number(raw);
  if (Number.isFinite(parsed) && /^-?\d+(\.\d+)?$/.test(raw.trim())) return parsed;
  return raw;
}

function SpreadsheetGrid({ rows, cols, readOnly = false, onUpdate }: SpreadsheetGridProps) {
  const [editCell, setEditCell] = useState<{ row: number; col: string; val: string } | null>(null);

  if (rows.length === 0) return <div className="grid-empty">No data</div>;

  return (
    <div className="spreadsheet-scroll">
      <table className="spreadsheet-table">
        <thead>
          <tr>
            <th className="rn-col">#</th>
            {cols.map((c) => <th key={c} title={c}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              <td className="rn-col">{ri + 1}</td>
              {cols.map((c) => {
                const isEditing = !readOnly && editCell?.row === ri && editCell?.col === c;
                return (
                  <td
                    key={c}
                    className={isEditing ? 'cell-editing' : readOnly ? 'cell-readonly' : 'cell-editable'}
                    onDoubleClick={() => {
                      if (!readOnly) setEditCell({ row: ri, col: c, val: stringValue(row[c]) });
                    }}
                  >
                    {isEditing ? (
                      <input
                        autoFocus
                        className="cell-input"
                        value={editCell!.val}
                        onChange={(e) => setEditCell((prev) => prev ? { ...prev, val: e.target.value } : null)}
                        onBlur={() => {
                          if (editCell && onUpdate) onUpdate(ri, editCell.col, inferInputValue(editCell.val, row[editCell.col]));
                          setEditCell(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === 'Tab') {
                            if (editCell && onUpdate) onUpdate(ri, editCell.col, inferInputValue(editCell.val, row[editCell.col]));
                            setEditCell(null);
                          }
                          if (e.key === 'Escape') setEditCell(null);
                        }}
                      />
                    ) : (
                      <span className="cell-value">{stringValue(row[c])}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface TablesPaneProps {
  model: WorkbookModel;
  onUpdate: (sheet: SheetName, rowIndex: number, col: string, val: Primitive) => void;
  onAddRow: (sheet: SheetName) => void;
  onDeleteRow: (sheet: SheetName, rowIndex: number) => void;
}

export function TablesPane({ model, onUpdate, onAddRow, onDeleteRow }: TablesPaneProps) {
  const [sel, setSel] = useState<TableSel>({ kind: 'static', sheet: 'buses' });
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleGroup = (sheet: string) =>
    setCollapsed((s) => { const n = new Set(s); n.has(sheet) ? n.delete(sheet) : n.add(sheet); return n; });

  const isTs = sel.kind === 'ts';
  const rows: GridRow[] = isTs
    ? ((model as any)[sel.sheet] as GridRow[]) ?? []
    : (model as any)[sel.sheet] ?? [];
  const cols: string[] = rows.length > 0
    ? (isTs ? Object.keys(rows[0]) : getColumns(rows, sel.sheet as SheetName))
    : (isTs ? [] : getColumns([], sel.sheet as SheetName));

  const parentGroup = isTs
    ? TABLE_GROUPS.find((g) => g.tsSheet === sel.sheet)
    : TABLE_GROUPS.find((g) => g.sheet === sel.sheet);

  return (
    <div className="tables-layout">
      <nav className="tables-nav">
        <div className="nav-toolbar">
          <button className="tb-btn" onClick={() => setCollapsed(new Set(TABLE_GROUPS.map((g) => g.sheet)))}>Collapse all</button>
          <button className="tb-btn" onClick={() => setCollapsed(new Set())}>Expand all</button>
        </div>
        {TABLE_GROUPS.map((g) => {
          const open = !collapsed.has(g.sheet);
          const tsRows: GridRow[] = g.tsSheet ? ((model as any)[g.tsSheet] as GridRow[]) ?? [] : [];
          const staticActive = sel.kind === 'static' && sel.sheet === g.sheet;
          const tsActive = sel.kind === 'ts' && sel.sheet === g.tsSheet;
          return (
            <div key={g.sheet} className="nav-group">
              <div className="nav-group-header" onClick={() => toggleGroup(g.sheet)}>
                <span className={`nav-chevron${open ? ' open' : ''}`}>›</span>
                <span className="nav-group-label">{g.label}</span>
                <span className="nav-count">{model[g.sheet].length}</span>
              </div>
              {open && (
                <div className="nav-items">
                  <button className={`nav-item${staticActive ? ' active' : ''}`} onClick={() => setSel({ kind: 'static', sheet: g.sheet })}>
                    <span className="nav-item-icon">≡</span>
                    <span className="nav-item-label">static</span>
                    <span className="nav-count">{model[g.sheet].length}</span>
                  </button>
                  {g.tsSheet && (
                    <button className={`nav-item ts-item${tsActive ? ' active' : ''}`} onClick={() => setSel({ kind: 'ts', sheet: g.tsSheet! })}>
                      <span className="nav-item-icon">⏱</span>
                      <span className="nav-item-label">temporal</span>
                      <span className={`nav-count${tsRows.length > 0 ? ' has-data' : ''}`}>{tsRows.length > 0 ? `${tsRows.length}t` : '—'}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="tables-content">
        <div className="tables-content-header">
          <div>
            <p className="eyebrow">{isTs ? 'Temporal (_t)' : 'Static'}</p>
            <h2>{parentGroup?.label ?? sel.sheet} <span className="sheet-name-chip">{sel.sheet}</span></h2>
          </div>
          <div className="inline-stats">
            <span>{rows.length} rows</span>
            {cols.length > 0 && <span>{cols.length} cols</span>}
            {isTs && <span className="ts-chip">read-only · double-click to inspect</span>}
          </div>
        </div>

        {!isTs && (
          <div className="section-toolbar">
            <button className="ghost-button sm" onClick={() => onAddRow(sel.sheet as SheetName)}>+ Row</button>
            {rows.length > 0 && (
              <button className="ghost-button sm danger" onClick={() => onDeleteRow(sel.sheet as SheetName, rows.length - 1)}>− Last row</button>
            )}
          </div>
        )}

        <div className="tables-grid-wrap">
          {rows.length === 0
            ? <div className="grid-empty">{isTs ? 'No temporal data in this sheet.' : 'No rows yet — use "+ Row" to add one.'}</div>
            : <SpreadsheetGrid
                rows={rows}
                cols={cols}
                readOnly={isTs}
                onUpdate={isTs ? undefined : (ri, col, val) => onUpdate(sel.sheet as SheetName, ri, col, val)}
              />
          }
        </div>
      </div>
    </div>
  );
}
