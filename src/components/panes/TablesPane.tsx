import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { GridRow, Primitive, SheetName, TableSel, WorkbookModel } from '../../types';
import { TABLE_GROUPS } from '../../constants';
import { AttrDef, PYPSA_OPTIONAL_ATTRS } from '../../constants/pypsa_attributes';
import { getColumns, stringValue } from '../../utils/helpers';

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Column filter dropdown (rendered as a portal so overflow never clips it) ──

interface FilterDropdownProps {
  col: string;
  allValues: string[];
  selected: Set<string>;
  anchorRect: DOMRect;
  onToggle: (val: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onClose: () => void;
}

function FilterDropdown({
  col, allValues, selected, anchorRect,
  onToggle, onSelectAll, onClear, onClose,
}: FilterDropdownProps) {
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const visible = search
    ? allValues.filter((v) => v.toLowerCase().includes(search.toLowerCase()))
    : allValues;

  const allChecked = allValues.every((v) => selected.has(v));

  const top = Math.min(anchorRect.bottom + 2, window.innerHeight - 320);
  const left = Math.min(anchorRect.left, window.innerWidth - 220);

  return ReactDOM.createPortal(
    <div
      ref={ref}
      className="col-filter-dropdown"
      style={{ top, left }}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      {/* Search */}
      <div className="cfd-search-wrap">
        <input
          className="cfd-search"
          autoFocus
          placeholder="Search values…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Select all row */}
      <label className="cfd-option cfd-select-all">
        <input
          type="checkbox"
          checked={allChecked}
          onChange={allChecked ? onClear : onSelectAll}
        />
        <span>(Select All)</span>
      </label>

      <div className="cfd-divider" />

      {/* Value list */}
      <div className="cfd-list">
        {visible.length === 0 && <div className="cfd-empty">No matches</div>}
        {visible.map((val) => (
          <label key={val} className="cfd-option">
            <input
              type="checkbox"
              checked={selected.has(val)}
              onChange={() => onToggle(val)}
            />
            <span className="cfd-val">{val === '' ? <em style={{ color: '#94a3b8' }}>(blank)</em> : val}</span>
          </label>
        ))}
      </div>

      {/* Footer */}
      <div className="cfd-footer">
        <button className="cfd-btn" onClick={() => { onClear(); onClose(); }}>Clear</button>
        <button className="cfd-btn cfd-btn--primary" onClick={onClose}>OK</button>
      </div>
    </div>,
    document.body,
  );
}

// ── AddColumnDropdown ─────────────────────────────────────────────────────────

interface AddColumnDropdownProps {
  sheet: SheetName;
  existingCols: string[];
  anchorRect: DOMRect;
  onAdd: (attr: AttrDef) => void;
  onClose: () => void;
}

function AddColumnDropdown({ sheet, existingCols, anchorRect, onAdd, onClose }: AddColumnDropdownProps) {
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const allAttrs: AttrDef[] = PYPSA_OPTIONAL_ATTRS[sheet] ?? [];
  const available = allAttrs.filter(
    (a) =>
      !existingCols.includes(a.col) &&
      (!search || a.col.toLowerCase().includes(search.toLowerCase()) || a.label.toLowerCase().includes(search.toLowerCase())),
  );

  const top = Math.min(anchorRect.bottom + 4, window.innerHeight - 420);
  const left = Math.min(anchorRect.left, window.innerWidth - 300);

  return ReactDOM.createPortal(
    <div
      ref={ref}
      className="add-col-dropdown"
      style={{ top, left }}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div className="add-col-header">Add column to <strong>{sheet}</strong></div>
      <div className="cfd-search-wrap">
        <input
          className="cfd-search"
          autoFocus
          placeholder="Search attributes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="add-col-list">
        {available.length === 0 && (
          <div className="cfd-empty">
            {allAttrs.length === 0
              ? 'No optional attributes defined for this sheet.'
              : 'All known attributes are already present.'}
          </div>
        )}
        {available.map((attr) => (
          <button
            key={attr.col}
            className="add-col-item"
            onClick={() => { onAdd(attr); onClose(); }}
          >
            <div className="add-col-item-top">
              <span className="add-col-name">{attr.col}</span>
              {attr.unit && <span className="add-col-unit">{attr.unit}</span>}
              <span className={`add-col-type add-col-type--${attr.type}`}>{attr.type}</span>
            </div>
            <div className="add-col-desc">{attr.desc}</div>
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}

// ── SpreadsheetGrid ───────────────────────────────────────────────────────────

interface SpreadsheetGridProps {
  rows: GridRow[];
  cols: string[];
  readOnly?: boolean;
  onUpdate?: (rowIndex: number, col: string, val: Primitive) => void;
}

function SpreadsheetGrid({ rows, cols, readOnly = false, onUpdate }: SpreadsheetGridProps) {
  const [editCell, setEditCell] = useState<{ row: number; col: string; val: string } | null>(null);
  // col → Set of values TO SHOW. Missing key = show all.
  const [colFilters, setColFilters] = useState<Record<string, Set<string>>>({});
  const [openCol, setOpenCol] = useState<string | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  // Refs to <th> elements so we can read getBoundingClientRect() on click
  const thRefs = useRef<Record<string, HTMLTableCellElement | null>>({});

  // Reset filters whenever the sheet changes (cols change)
  useEffect(() => {
    setColFilters({});
    setOpenCol(null);
  }, [cols.join('|')]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Unique values per column (computed from ALL rows, not filtered)
  const uniqueValues = (col: string): string[] => {
    const s = new Set(rows.map((r) => stringValue(r[col])));
    return Array.from(s).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  };

  // Resolved "selected" set — if no filter entry, all values are selected
  const selectedFor = (col: string): Set<string> =>
    colFilters[col] ?? new Set(uniqueValues(col));

  // Is the column actively filtered (a proper subset of all values)?
  const isActive = (col: string): boolean => {
    const f = colFilters[col];
    if (!f) return false;
    const all = uniqueValues(col);
    return f.size < all.length;
  };

  const hasAnyFilter = cols.some(isActive);

  // Apply filters
  const filteredRows = rows.filter((row) =>
    cols.every((col) => {
      const f = colFilters[col];
      return !f || f.has(stringValue(row[col]));
    }),
  );

  const openDropdown = (col: string) => {
    if (openCol === col) { setOpenCol(null); return; }
    const thEl = thRefs.current[col];
    if (thEl) setAnchorRect(thEl.getBoundingClientRect());
    setOpenCol(col);
  };

  const toggleValue = (col: string, val: string) => {
    const all = uniqueValues(col);
    const cur = selectedFor(col);
    const next = new Set(cur);
    next.has(val) ? next.delete(val) : next.add(val);
    if (next.size >= all.length) {
      setColFilters((p) => { const n = { ...p }; delete n[col]; return n; });
    } else {
      setColFilters((p) => ({ ...p, [col]: next }));
    }
  };

  const selectAll = (col: string) =>
    setColFilters((p) => { const n = { ...p }; delete n[col]; return n; });

  const clearFilter = (col: string) =>
    setColFilters((p) => { const n = { ...p }; delete n[col]; return n; });

  const clearAll = () => setColFilters({});

  if (rows.length === 0) return <div className="grid-empty">No data</div>;

  return (
    <div className="spreadsheet-scroll">
      {hasAnyFilter && (
        <div className="filter-status-bar">
          <span>
            Showing <strong>{filteredRows.length}</strong> of {rows.length} rows
          </span>
          <button className="ghost-button sm" onClick={clearAll}>✕ Clear all filters</button>
        </div>
      )}
      <table className="spreadsheet-table">
        <thead>
          <tr>
            <th className="rn-col">#</th>
            {cols.map((c) => {
              const active = isActive(c);
              return (
                <th
                  key={c}
                  title={c}
                  className={active ? 'col-filtered' : undefined}
                  ref={(el) => { thRefs.current[c] = el; }}
                >
                  <div className="col-header-inner">
                    <span className="col-header-label">{c}</span>
                    <button
                      className={`col-filter-btn${active ? ' col-filter-btn--active' : ''}`}
                      title={active ? 'Filter active' : 'Filter'}
                      onClick={(e) => {
                        e.stopPropagation();
                        openDropdown(c);
                      }}
                    >
                      ▾
                    </button>
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {filteredRows.map((row) => {
            const origIdx = rows.indexOf(row);
            return (
              <tr key={origIdx}>
                <td className="rn-col">{origIdx + 1}</td>
                {cols.map((c) => {
                  const isEditing = !readOnly && editCell?.row === origIdx && editCell?.col === c;
                  return (
                    <td
                      key={c}
                      className={isEditing ? 'cell-editing' : readOnly ? 'cell-readonly' : 'cell-editable'}
                      onDoubleClick={() => {
                        if (!readOnly) setEditCell({ row: origIdx, col: c, val: stringValue(row[c]) });
                      }}
                    >
                      {isEditing ? (
                        <input
                          autoFocus
                          className="cell-input"
                          value={editCell!.val}
                          onChange={(e) =>
                            setEditCell((prev) => (prev ? { ...prev, val: e.target.value } : null))
                          }
                          onBlur={() => {
                            if (editCell && onUpdate)
                              onUpdate(origIdx, editCell.col, inferInputValue(editCell.val, row[editCell.col]));
                            setEditCell(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === 'Tab') {
                              if (editCell && onUpdate)
                                onUpdate(origIdx, editCell.col, inferInputValue(editCell.val, row[editCell.col]));
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
            );
          })}
        </tbody>
      </table>

      {/* Portal dropdown */}
      {openCol && anchorRect && (
        <FilterDropdown
          col={openCol}
          allValues={uniqueValues(openCol)}
          selected={selectedFor(openCol)}
          anchorRect={anchorRect}
          onToggle={(val) => toggleValue(openCol, val)}
          onSelectAll={() => selectAll(openCol)}
          onClear={() => clearFilter(openCol)}
          onClose={() => setOpenCol(null)}
        />
      )}
    </div>
  );
}

// ── TablesPane ────────────────────────────────────────────────────────────────

interface TablesPaneProps {
  model: WorkbookModel;
  onUpdate: (sheet: SheetName, rowIndex: number, col: string, val: Primitive) => void;
  onAddRow: (sheet: SheetName) => void;
  onDeleteRow: (sheet: SheetName, rowIndex: number) => void;
  onAddColumn: (sheet: SheetName, col: string, defaultValue: string | number | boolean) => void;
}

export function TablesPane({ model, onUpdate, onAddRow, onDeleteRow, onAddColumn }: TablesPaneProps) {
  const [sel, setSel] = useState<TableSel>({ kind: 'static', sheet: 'buses' });
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [navSearch, setNavSearch] = useState('');
  const [addColOpen, setAddColOpen] = useState(false);
  const [addColAnchor, setAddColAnchor] = useState<DOMRect | null>(null);
  const addColBtnRef = useRef<HTMLButtonElement | null>(null);

  const toggleGroup = (sheet: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      n.has(sheet) ? n.delete(sheet) : n.add(sheet);
      return n;
    });

  const isTs = sel.kind === 'ts';
  const rows: GridRow[] = isTs
    ? ((model as any)[sel.sheet] as GridRow[]) ?? []
    : (model as any)[sel.sheet] ?? [];
  const cols: string[] =
    rows.length > 0
      ? isTs
        ? Object.keys(rows[0])
        : getColumns(rows, sel.sheet as SheetName)
      : isTs
        ? []
        : getColumns([], sel.sheet as SheetName);

  const parentGroup = isTs
    ? TABLE_GROUPS.find((g) => g.tsSheet === sel.sheet)
    : TABLE_GROUPS.find((g) => g.sheet === sel.sheet);

  return (
    <div className="tables-layout">
      <nav className="tables-nav">
        <div className="nav-search-wrap">
          <input
            className="nav-search"
            type="text"
            placeholder="Filter sheets…"
            value={navSearch}
            onChange={(e) => setNavSearch(e.target.value)}
            aria-label="Filter sheets"
          />
          {navSearch && (
            <button className="nav-search-clear" onClick={() => setNavSearch('')} aria-label="Clear filter">
              ×
            </button>
          )}
        </div>
        <div className="nav-toolbar">
          <button
            className="tb-btn"
            onClick={() => setCollapsed(new Set(TABLE_GROUPS.map((g) => g.sheet)))}
          >
            Collapse all
          </button>
          <button className="tb-btn" onClick={() => setCollapsed(new Set())}>
            Expand all
          </button>
        </div>
        {TABLE_GROUPS.filter(
          (g) =>
            !navSearch ||
            g.label.toLowerCase().includes(navSearch.toLowerCase()) ||
            g.sheet.toLowerCase().includes(navSearch.toLowerCase()),
        ).map((g) => {
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
                  <button
                    className={`nav-item${staticActive ? ' active' : ''}`}
                    onClick={() => { setSel({ kind: 'static', sheet: g.sheet }); setAddColOpen(false); }}
                  >
                    <span className="nav-item-icon">≡</span>
                    <span className="nav-item-label">static</span>
                    <span className="nav-count">{model[g.sheet].length}</span>
                  </button>
                  {g.tsSheet && (
                    <button
                      className={`nav-item ts-item${tsActive ? ' active' : ''}`}
                      onClick={() => setSel({ kind: 'ts', sheet: g.tsSheet! })}
                    >
                      <span className="nav-item-icon">⏱</span>
                      <span className="nav-item-label">temporal</span>
                      <span className={`nav-count${tsRows.length > 0 ? ' has-data' : ''}`}>
                        {tsRows.length > 0 ? `${tsRows.length}t` : '—'}
                      </span>
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
            <h2>
              {parentGroup?.label ?? sel.sheet}{' '}
              <span className="sheet-name-chip">{sel.sheet}</span>
            </h2>
          </div>
          <div className="inline-stats">
            <span>{rows.length} rows</span>
            {cols.length > 0 && <span>{cols.length} cols</span>}
            {isTs && <span className="ts-chip">read-only · double-click to inspect</span>}
          </div>
        </div>

        {!isTs && (
          <div className="section-toolbar">
            <button className="ghost-button sm" onClick={() => onAddRow(sel.sheet as SheetName)}>
              + Row
            </button>
            {rows.length > 0 && (
              <button
                className="ghost-button sm danger"
                onClick={() => onDeleteRow(sel.sheet as SheetName, rows.length - 1)}
              >
                − Last row
              </button>
            )}
            <button
              ref={addColBtnRef}
              className="ghost-button sm"
              onClick={() => {
                if (addColOpen) { setAddColOpen(false); return; }
                const rect = addColBtnRef.current?.getBoundingClientRect();
                if (rect) setAddColAnchor(rect);
                setAddColOpen(true);
              }}
            >
              + Column
            </button>
          </div>
        )}
        {addColOpen && addColAnchor && (
          <AddColumnDropdown
            sheet={sel.sheet as SheetName}
            existingCols={cols}
            anchorRect={addColAnchor}
            onAdd={(attr) => onAddColumn(sel.sheet as SheetName, attr.col, attr.default)}
            onClose={() => setAddColOpen(false)}
          />
        )}

        <div className="tables-grid-wrap">
          {rows.length === 0 ? (
            <div className="grid-empty">
              {isTs ? 'No temporal data in this sheet.' : 'No rows yet — use "+ Row" to add one.'}
            </div>
          ) : (
            <SpreadsheetGrid
              rows={rows}
              cols={cols}
              readOnly={isTs}
              onUpdate={
                isTs ? undefined : (ri, col, val) => onUpdate(sel.sheet as SheetName, ri, col, val)
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
