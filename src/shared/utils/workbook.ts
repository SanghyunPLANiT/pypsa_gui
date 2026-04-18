import * as XLSX from 'xlsx';
import { SHEETS, TS_SHEETS, DEFAULT_SHEET_ROWS } from '../../constants';
import { AnySheetName, GridRow, Primitive, WorkbookModel } from '../../types';

export function normalizeCell(value: unknown): Primitive {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') return value;
  return String(value);
}

export function createEmptyWorkbook(): WorkbookModel {
  const base = Object.fromEntries(SHEETS.map((s) => [s, []]));
  const ts = Object.fromEntries(TS_SHEETS.map((s) => [s, []]));
  return { ...base, ...ts } as unknown as WorkbookModel;
}

export function parseSheets(workbook: ReturnType<typeof XLSX.read>): WorkbookModel {
  const model = createEmptyWorkbook();
  const allSheets: AnySheetName[] = [...SHEETS, ...TS_SHEETS];
  allSheets.forEach((sheet) => {
    const ws = workbook.Sheets[sheet];
    if (!ws) return;
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
    (model as any)[sheet] = rows.map((row) =>
      Object.fromEntries(Object.entries(row).map(([key, value]) => [key, normalizeCell(value)])),
    );
  });
  return model;
}

export async function loadSampleWorkbook(): Promise<WorkbookModel> {
  const res = await fetch('/sample_model.xlsx');
  if (!res.ok) throw new Error('Could not load sample_model.xlsx');
  const arrayBuffer = await res.arrayBuffer();
  return parseSheets(XLSX.read(arrayBuffer, { type: 'array' }));
}

/**
 * Create a minimal but complete sector coupling demo model.
 * Contains one power bus + coal generator + load, then adds
 * Power→Heat, Power→H₂, and Power→EV bundles on top.
 */
export function createSectorCouplingExample(): WorkbookModel {
  const base = createEmptyWorkbook();

  // ── Carriers ────────────────────────────────────────────────────────────────
  base.carriers = [
    { name: 'AC' },
    { name: 'Coal' },
    // Sector carriers
    { name: 'heat' },
    { name: 'power-to-heat' },
    { name: 'heat-pump' },
    { name: 'H2' },
    { name: 'electrolyzer' },
    { name: 'fuel-cell' },
    { name: 'EV' },
    { name: 'EV-charging' },
    { name: 'V2G' },
  ];

  // ── Buses ───────────────────────────────────────────────────────────────────
  base.buses = [
    { name: 'power_bus', carrier: 'AC', x: 126.98, y: 37.57, v_nom: 154 },
    { name: 'sc1_heat_bus', carrier: 'heat', x: 127.03, y: 37.52, v_nom: 1 },
    { name: 'sc1_h2_bus',   carrier: 'H2',   x: 127.03, y: 37.62, v_nom: 1 },
    { name: 'sc1_ev_bus',   carrier: 'EV',   x: 126.93, y: 37.52, v_nom: 1 },
  ];

  // ── Generators ──────────────────────────────────────────────────────────────
  base.generators = [
    {
      name: 'coal_plant', bus: 'power_bus', carrier: 'Coal',
      p_nom: 500, p_min_pu: 0.2, p_max_pu: 1,
      marginal_cost: 45, capital_cost: 0,
    },
    {
      name: 'solar_plant', bus: 'power_bus', carrier: 'Solar',
      p_nom: 200, p_min_pu: 0, p_max_pu: 1,
      marginal_cost: 0, capital_cost: 0,
    },
  ];

  // ── Loads ───────────────────────────────────────────────────────────────────
  base.loads = [
    { name: 'power_load', bus: 'power_bus',    carrier: 'AC',   p_set: 300 },
    { name: 'heat_load',  bus: 'sc1_heat_bus', carrier: 'heat', p_set: 80 },
    { name: 'h2_load',    bus: 'sc1_h2_bus',   carrier: 'H2',   p_set: 40 },
    { name: 'ev_load',    bus: 'sc1_ev_bus',   carrier: 'EV',   p_set: 50 },
  ];

  // ── Links ───────────────────────────────────────────────────────────────────
  base.links = [
    // Power → Heat
    {
      name: 'sc1_boiler',    bus0: 'power_bus', bus1: 'sc1_heat_bus',
      carrier: 'power-to-heat', p_nom: 120, p_min_pu: 0, p_max_pu: 1, efficiency: 0.99, marginal_cost: 0,
    },
    {
      name: 'sc1_heat_pump', bus0: 'power_bus', bus1: 'sc1_heat_bus',
      carrier: 'heat-pump',     p_nom: 60,  p_min_pu: 0, p_max_pu: 1, efficiency: 3.0,  marginal_cost: 0,
    },
    // Power → H₂ (bidirectional)
    {
      name: 'sc1_electrolyzer', bus0: 'power_bus', bus1: 'sc1_h2_bus',
      carrier: 'electrolyzer', p_nom: 100, p_min_pu: 0, p_max_pu: 1, efficiency: 0.70, marginal_cost: 0,
    },
    {
      name: 'sc1_fuel_cell',   bus0: 'sc1_h2_bus', bus1: 'power_bus',
      carrier: 'fuel-cell',   p_nom: 50,  p_min_pu: 0, p_max_pu: 1, efficiency: 0.50, marginal_cost: 0,
    },
    // Power → EV (bidirectional)
    {
      name: 'sc1_ev_charging', bus0: 'power_bus', bus1: 'sc1_ev_bus',
      carrier: 'EV-charging', p_nom: 80,  p_min_pu: 0, p_max_pu: 1, efficiency: 0.90, marginal_cost: 0,
    },
    {
      name: 'sc1_v2g',         bus0: 'sc1_ev_bus', bus1: 'power_bus',
      carrier: 'V2G',         p_nom: 40,  p_min_pu: 0, p_max_pu: 1, efficiency: 0.85, marginal_cost: 0,
    },
  ];

  return base;
}

export function parseWorkbook(file: File): Promise<WorkbookModel> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const arrayBuffer = event.target?.result;
        if (!(arrayBuffer instanceof ArrayBuffer)) {
          reject(new Error('Could not read workbook.'));
          return;
        }
        const wb = XLSX.read(arrayBuffer, { type: 'array' });
        resolve(parseSheets(wb));
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Workbook import failed.'));
      }
    };
    reader.onerror = () => reject(new Error('Workbook import failed.'));
    reader.readAsArrayBuffer(file);
  });
}

export function buildWorkbook(model: WorkbookModel) {
  const workbook = XLSX.utils.book_new();
  SHEETS.forEach((sheet) => {
    const rows = model[sheet].length > 0 ? model[sheet] : [DEFAULT_SHEET_ROWS[sheet]];
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, ws, sheet);
  });
  TS_SHEETS.forEach((sheet) => {
    const rows = (model as any)[sheet] as GridRow[];
    if (rows && rows.length > 0) {
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(workbook, ws, sheet);
    }
  });
  return workbook;
}

export function exportWorkbook(model: WorkbookModel, filename = 'ragnarok_case.xlsx') {
  XLSX.writeFile(buildWorkbook(model), filename);
}

export function workbookToArrayBuffer(model: WorkbookModel): ArrayBuffer {
  return XLSX.write(buildWorkbook(model), { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}

/**
 * Parse a CSV (or TSV) file into GridRow[] for use as a time-series sheet.
 *
 * Expected shape:
 *   Column 0  — snapshot label (string, e.g. "2019-01-01 00:00")
 *   Columns 1+ — component names → numeric values
 *
 * SheetJS auto-detects comma vs tab delimiter.  BOM-prefixed files are handled
 * transparently.  All numeric cells are cast to `number`; the label column is
 * kept as `string`.  Unparseable numeric cells become `null`.
 */
export async function parseCsvToGridRows(file: File): Promise<GridRow[]> {
  const text = await file.text();
  const wb = XLSX.read(text, { type: 'string', raw: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });

  return raw.map((row) => {
    const entries = Object.entries(row).map(([k, v], i): [string, Primitive] => {
      if (i === 0) {
        // Snapshot label — keep as string
        return [k, v == null ? '' : String(v)];
      }
      // Numeric value column
      const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
      return [k, Number.isFinite(n) ? n : null];
    });
    return Object.fromEntries(entries) as GridRow;
  });
}
