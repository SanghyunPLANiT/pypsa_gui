import { useMemo } from 'react';
import { WorkbookModel } from '../../shared/types';
import { numberValue, stringValue } from '../../shared/utils/helpers';

// ── Issue type ────────────────────────────────────────────────────────────────

export interface ModelIssue {
  sheet: string;
  rowIndex: number;
  col?: string;
  severity: 'error' | 'warning';
  message: string;
}

// ── Rule helpers ──────────────────────────────────────────────────────────────

type Row = Record<string, string | number | boolean | null>;

function checkDuplicateNames(sheet: string, rows: Row[], issues: ModelIssue[]) {
  const seen = new Map<string, number>();
  rows.forEach((row, i) => {
    const name = stringValue(row.name);
    if (!name) {
      issues.push({ sheet, rowIndex: i, col: 'name', severity: 'error', message: 'Name is empty' });
      return;
    }
    if (seen.has(name)) {
      issues.push({ sheet, rowIndex: i, col: 'name', severity: 'error',
        message: `Duplicate name "${name}" (first at row ${seen.get(name)! + 1})` });
    } else {
      seen.set(name, i);
    }
  });
}

function checkBusRef(
  sheet: string,
  rows: Row[],
  busNames: Set<string>,
  issues: ModelIssue[],
  col = 'bus',
) {
  rows.forEach((row, i) => {
    const ref = stringValue(row[col]);
    if (!ref) {
      issues.push({ sheet, rowIndex: i, col, severity: 'error', message: `${col}: missing bus reference` });
    } else if (!busNames.has(ref)) {
      issues.push({ sheet, rowIndex: i, col, severity: 'error',
        message: `${col} "${ref}" not found in buses` });
    }
  });
}

// ── Main hook ─────────────────────────────────────────────────────────────────

export function useModelIssues(model: WorkbookModel): ModelIssue[] {
  return useMemo(() => {
    const issues: ModelIssue[] = [];

    const busNames = new Set(
      model.buses.map((b) => stringValue(b.name)).filter(Boolean),
    );
    const carrierNames = new Set(
      model.carriers.map((c) => stringValue(c.name)).filter(Boolean),
    );

    // ── Buses ─────────────────────────────────────────────────────────────
    checkDuplicateNames('buses', model.buses, issues);

    // ── Generators ────────────────────────────────────────────────────────
    checkDuplicateNames('generators', model.generators, issues);
    checkBusRef('generators', model.generators, busNames, issues);
    model.generators.forEach((g, i) => {
      const carrier = stringValue(g.carrier);
      if (carrier && carrierNames.size > 0 && !carrierNames.has(carrier)) {
        issues.push({ sheet: 'generators', rowIndex: i, col: 'carrier', severity: 'warning',
          message: `Carrier "${carrier}" not in carriers sheet` });
      }
      const pNom = numberValue(g.p_nom);
      if (g.p_nom !== undefined && g.p_nom !== null && g.p_nom !== '' && pNom < 0) {
        issues.push({ sheet: 'generators', rowIndex: i, col: 'p_nom', severity: 'error',
          message: `p_nom is negative (${pNom})` });
      }
    });

    // ── Loads ─────────────────────────────────────────────────────────────
    checkDuplicateNames('loads', model.loads, issues);
    checkBusRef('loads', model.loads, busNames, issues);

    // ── Lines ─────────────────────────────────────────────────────────────
    checkDuplicateNames('lines', model.lines, issues);
    model.lines.forEach((line, i) => {
      const b0 = stringValue(line.bus0);
      const b1 = stringValue(line.bus1);
      if (!b0) issues.push({ sheet: 'lines', rowIndex: i, col: 'bus0', severity: 'error', message: 'bus0 is empty' });
      else if (!busNames.has(b0)) issues.push({ sheet: 'lines', rowIndex: i, col: 'bus0', severity: 'error', message: `bus0 "${b0}" not found in buses` });
      if (!b1) issues.push({ sheet: 'lines', rowIndex: i, col: 'bus1', severity: 'error', message: 'bus1 is empty' });
      else if (!busNames.has(b1)) issues.push({ sheet: 'lines', rowIndex: i, col: 'bus1', severity: 'error', message: `bus1 "${b1}" not found in buses` });
      if (b0 && b1 && b0 === b1) issues.push({ sheet: 'lines', rowIndex: i, col: 'bus0', severity: 'warning', message: 'bus0 equals bus1 (self-loop)' });
    });

    // ── Links ─────────────────────────────────────────────────────────────
    checkDuplicateNames('links', model.links, issues);
    model.links.forEach((link, i) => {
      const b0 = stringValue(link.bus0);
      const b1 = stringValue(link.bus1);
      if (!b0) issues.push({ sheet: 'links', rowIndex: i, col: 'bus0', severity: 'error', message: 'bus0 is empty' });
      else if (!busNames.has(b0)) issues.push({ sheet: 'links', rowIndex: i, col: 'bus0', severity: 'error', message: `bus0 "${b0}" not found in buses` });
      if (!b1) issues.push({ sheet: 'links', rowIndex: i, col: 'bus1', severity: 'error', message: 'bus1 is empty' });
      else if (!busNames.has(b1)) issues.push({ sheet: 'links', rowIndex: i, col: 'bus1', severity: 'error', message: `bus1 "${b1}" not found in buses` });
    });

    // ── Storage units ─────────────────────────────────────────────────────
    checkDuplicateNames('storage_units', model.storage_units, issues);
    checkBusRef('storage_units', model.storage_units, busNames, issues);
    model.storage_units.forEach((u, i) => {
      const pNom = numberValue(u.p_nom);
      if (u.p_nom !== undefined && u.p_nom !== null && u.p_nom !== '' && pNom < 0) {
        issues.push({ sheet: 'storage_units', rowIndex: i, col: 'p_nom', severity: 'error',
          message: `p_nom is negative (${pNom})` });
      }
    });

    // ── Stores ────────────────────────────────────────────────────────────
    checkDuplicateNames('stores', model.stores, issues);
    checkBusRef('stores', model.stores, busNames, issues);

    // ── Transformers ──────────────────────────────────────────────────────
    checkDuplicateNames('transformers', model.transformers, issues);
    model.transformers.forEach((t, i) => {
      const b0 = stringValue(t.bus0);
      const b1 = stringValue(t.bus1);
      if (!b0) issues.push({ sheet: 'transformers', rowIndex: i, col: 'bus0', severity: 'error', message: 'bus0 is empty' });
      else if (!busNames.has(b0)) issues.push({ sheet: 'transformers', rowIndex: i, col: 'bus0', severity: 'error', message: `bus0 "${b0}" not found in buses` });
      if (!b1) issues.push({ sheet: 'transformers', rowIndex: i, col: 'bus1', severity: 'error', message: 'bus1 is empty' });
      else if (!busNames.has(b1)) issues.push({ sheet: 'transformers', rowIndex: i, col: 'bus1', severity: 'error', message: `bus1 "${b1}" not found in buses` });
    });

    // ── Time-series sheets ────────────────────────────────────────────────
    const snapshotCount = model.snapshots.length;

    // Helper: check TS sheet for value range and row-count mismatches.
    // Reports one issue per column (not per row) to avoid flooding the list.
    const checkTsSheet = (
      sheetKey: keyof typeof model,
      label: string,
      minVal: number | null,
      maxVal: number | null,
    ) => {
      const tsRows = model[sheetKey] as Row[];
      if (!tsRows || tsRows.length === 0) return;

      // Row-count check
      if (snapshotCount > 0 && tsRows.length !== snapshotCount) {
        issues.push({
          sheet: sheetKey as string,
          rowIndex: 0,
          severity: 'warning',
          message: `Row count ${tsRows.length} ≠ snapshot count ${snapshotCount}`,
        });
      }

      // Per-column range check — report only the first offending row per column
      const ignoreCols = new Set(['snapshot', 'name', 'datetime', 'timestep', 'period', '']);
      const cols = Object.keys(tsRows[0]).filter((c) => !ignoreCols.has(c.toLowerCase()));

      cols.forEach((col) => {
        let firstBadRow = -1;
        let badCount = 0;
        for (let i = 0; i < tsRows.length; i++) {
          const raw = tsRows[i][col];
          if (raw === null || raw === '' || raw === undefined) continue;
          const v = numberValue(raw);
          if ((minVal !== null && v < minVal) || (maxVal !== null && v > maxVal)) {
            if (firstBadRow === -1) firstBadRow = i;
            badCount++;
          }
        }
        if (firstBadRow !== -1) {
          const rangeStr = minVal !== null && maxVal !== null
            ? `[${minVal}, ${maxVal}]`
            : minVal !== null ? `≥ ${minVal}` : `≤ ${maxVal}`;
          issues.push({
            sheet: sheetKey as string,
            rowIndex: firstBadRow,
            col,
            severity: 'warning',
            message: `"${col}": ${badCount} value${badCount > 1 ? 's' : ''} outside ${rangeStr}${badCount > 1 ? ` (first at row ${firstBadRow + 1})` : ''}`,
          });
        }
      });
    };

    checkTsSheet('generators-p_max_pu', 'generators-p_max_pu', 0, 1);
    checkTsSheet('generators-p_min_pu', 'generators-p_min_pu', 0, 1);
    checkTsSheet('loads-p_set', 'loads-p_set', 0, null);
    checkTsSheet('storage_units-inflow', 'storage_units-inflow', 0, null);
    checkTsSheet('links-p_max_pu', 'links-p_max_pu', 0, 1);

    return issues;
  }, [model]);
}
