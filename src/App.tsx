import React, { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  CircleMarker,
  MapContainer,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet';
import { LatLngBoundsExpression } from 'leaflet';
import * as XLSX from 'xlsx';
import 'leaflet/dist/leaflet.css';

const SHEETS = [
  'network',
  'snapshots',
  'carriers',
  'buses',
  'generators',
  'loads',
  'links',
  'lines',
  'stores',
  'storage_units',
  'transformers',
  'shunt_impedances',
  'global_constraints',
  'shapes',
  'processes',
] as const;

// Time-series (_t) sheets: rows = timesteps, columns = component names
const TS_SHEETS = [
  'generators-p_max_pu',
  'generators-p_min_pu',
  'loads-p_set',
  'storage_units-inflow',
  'links-p_max_pu',
] as const;

type SheetName = (typeof SHEETS)[number];
type TsSheetName = (typeof TS_SHEETS)[number];
type AnySheetName = SheetName | TsSheetName;
type Primitive = string | number | boolean | null;
type GridRow = Record<string, Primitive>;
type WorkspaceTab = 'Map' | 'Tables' | 'Validation' | 'Analytics';
type BrowserFileHandle = any;
type ChartMode = 'line' | 'area' | 'bar';
type ChartSectionType = ChartMode | 'donut';
type TimeframeOption = 'aggregated' | 'yearly' | 'monthly' | 'weekly' | 'daily' | 'hourly';

interface WorkbookModel {
  network: GridRow[];
  snapshots: GridRow[];
  carriers: GridRow[];
  buses: GridRow[];
  generators: GridRow[];
  loads: GridRow[];
  links: GridRow[];
  lines: GridRow[];
  stores: GridRow[];
  storage_units: GridRow[];
  transformers: GridRow[];
  shunt_impedances: GridRow[];
  global_constraints: GridRow[];
  shapes: GridRow[];
  processes: GridRow[];
  // Time-series sheets
  'generators-p_max_pu': GridRow[];
  'generators-p_min_pu': GridRow[];
  'loads-p_set': GridRow[];
  'storage_units-inflow': GridRow[];
  'links-p_max_pu': GridRow[];
}


interface ScenarioSettings {
  caseName: string;
  planningYear: number;
  demandGrowth: number;
  renewableTarget: number;
  storageExpansion: number;
  transmissionExpansion: number;
  carbonPrice: number;
  reserveMargin: number;
  priceSensitivity: number;
}

interface RunSettings {
  snapshotStart: number;
  snapshotEnd: number;
  snapshotWeight: number;
}

interface SummaryItem {
  label: string;
  value: string;
  detail: string;
}

interface SeriesPoint {
  label: string;
  timestamp: string;
  values: Record<string, number>;
  total?: number;
}

interface ValuePoint {
  label: string;
  timestamp?: string;
  value: number;
}

interface StoragePoint {
  label: string;
  timestamp: string;
  charge: number;
  discharge: number;
  state: number;
}

interface MixItem {
  label: string;
  value: number;
  color: string;
}

interface MetricOption {
  key: string;
  label: string;
  unit: string;
  rows: TimeSeriesRow[];
  series: TimeSeriesSeries[];
  reducer: 'sum' | 'mean' | 'last';
  allowDonut: boolean;
}

interface ChartSectionConfig {
  id: number;
  metricKey: string;
  chartType: ChartSectionType;
  timeframe: TimeframeOption;
  startIndex: number;
  endIndex: number;
  stacked: boolean;
}

const EMPTY_METRIC_KEY = '__empty__';

interface GeneratorDetail {
  name: string;
  carrier: string;
  bus: string;
  summary: SummaryItem[];
  outputSeries: Array<{ label: string; timestamp: string; output: number }>;
  emissionsSeries: Array<{ label: string; timestamp: string; emissions: number }>;
  availableSeries: Array<{ label: string; timestamp: string; available: number }>;
  curtailmentSeries: Array<{ label: string; timestamp: string; curtailment: number }>;
}

interface BusDetail {
  name: string;
  summary: SummaryItem[];
  netSeries: Array<{
    label: string;
    timestamp: string;
    load: number;
    generation: number;
    smp: number;
    emissions: number;
    v_mag_pu: number;
    v_ang: number;
  }>;
  hasVoltageMagnitude: boolean;
  hasVoltageAngle: boolean;
  carrierMix: MixItem[];
}

interface StorageUnitDetail {
  name: string;
  bus: string;
  summary: SummaryItem[];
  dispatchSeries: Array<{ label: string; timestamp: string; dispatch: number }>;
  chargeSeries: Array<{ label: string; timestamp: string; charge: number }>;
  dischargeSeries: Array<{ label: string; timestamp: string; discharge: number }>;
  stateSeries: Array<{ label: string; timestamp: string; state: number }>;
}

interface StoreDetail {
  name: string;
  bus: string;
  summary: SummaryItem[];
  energySeries: Array<{ label: string; timestamp: string; energy: number }>;
  powerSeries: Array<{ label: string; timestamp: string; power: number }>;
}

interface BranchDetail {
  name: string;
  component: string;
  bus0: string;
  bus1: string;
  summary: SummaryItem[];
  flowSeries: Array<{ label: string; timestamp: string; p0: number; p1: number }>;
  loadingSeries: Array<{ label: string; timestamp: string; loading: number }>;
  lossesSeries: Array<{ label: string; timestamp: string; losses: number }>;
}

interface RunResults {
  summary: SummaryItem[];
  dispatchSeries: SeriesPoint[];
  generatorDispatchSeries: SeriesPoint[];
  systemPriceSeries: ValuePoint[];
  systemEmissionsSeries: ValuePoint[];
  storageSeries: StoragePoint[];
  carrierMix: MixItem[];
  nodalBalance: Array<{ label: string; load: number; generation: number }>;
  lineLoading: Array<{ label: string; value: number }>;
  narrative: string[];
  runMeta: {
    snapshotCount: number;
    snapshotWeight: number;
    modeledHours: number;
    storeWeight: number;
  };
  assetDetails: {
    generators: Record<string, GeneratorDetail>;
    buses: Record<string, BusDetail>;
    storageUnits: Record<string, StorageUnitDetail>;
    stores: Record<string, StoreDetail>;
    branches: Record<string, BranchDetail>;
  };
}

type AnalyticsFocus =
  | { type: 'system' }
  | { type: 'generator'; key: string }
  | { type: 'bus'; key: string }
  | { type: 'storageUnit'; key: string }
  | { type: 'store'; key: string }
  | { type: 'branch'; key: string };

interface TimeSeriesSeries {
  key: string;
  label: string;
  color: string;
}

interface TimeSeriesRow {
  label: string;
  timestamp?: string;
  [key: string]: string | number | undefined;
}

const API_BASE =
  window.location.hostname === 'localhost' ? 'http://127.0.0.1:8000' : '';

const DEFAULT_SHEET_ROWS: Record<SheetName, GridRow> = {
  network: { name: 'Untitled PyPSA Case', _multi_invest: false, pypsa_version: '1.1.2', srid: 4326 },
  snapshots: { snapshot: 'now', objective: 1, stores: 1, generators: 1 },
  carriers: { name: 'AC' },
  buses: {
    name: 'New Bus',
    x: 126.978,
    y: 37.5665,
    v_nom: 154,
    carrier: 'AC',
    unit: 'kV',
    control: 'PQ',
    v_mag_pu_set: 1,
    v_mag_pu_min: 0.95,
    v_mag_pu_max: 1.05,
    sub_network: 0,
  },
  generators: {
    name: 'new_generator',
    bus: 'New Bus',
    control: 'PV',
    carrier: 'LNG',
    p_nom: 100,
    p_nom_min: 0,
    p_min_pu: 0.3,
    p_max_pu: 1,
    p_set: 70,
    q_set: 0,
    marginal_cost: 75,
    capital_cost: 0,
    committable: true,
  },
  loads: { name: 'new_load', bus: 'New Bus', carrier: 'load', p_set: 100, q_set: 0, sign: 1 },
  links: {
    name: 'new_link',
    bus0: 'New Bus',
    bus1: 'New Bus',
    carrier: 'HVDC',
    p_nom: 250,
    p_min_pu: -1,
    p_max_pu: 1,
    efficiency: 0.97,
    marginal_cost: 0,
  },
  lines: {
    name: 'new_line',
    bus0: 'New Bus',
    bus1: 'New Bus',
    type: '',
    x: 0.15,
    r: 0.03,
    b: 0,
    s_nom: 250,
    length: 20,
    num_parallel: 1,
    s_max_pu: 1,
  },
  stores: {
    name: 'new_store',
    bus: 'New Bus',
    carrier: 'battery',
    e_nom: 500,
    e_initial: 100,
    e_min_pu: 0,
    e_max_pu: 1,
    standing_loss: 0.001,
    marginal_cost: 0,
  },
  storage_units: {
    name: 'new_storage_unit',
    bus: 'New Bus',
    carrier: 'battery',
    p_nom: 200,
    max_hours: 4,
    efficiency_store: 0.91,
    efficiency_dispatch: 0.91,
    state_of_charge_initial: 0,
    cyclic_state_of_charge: true,
    marginal_cost: 5,
  },
  transformers: {
    name: 'new_transformer',
    bus0: 'New Bus',
    bus1: 'New Bus',
    type: '',
    model: 't',
    x: 0.02,
    r: 0.002,
    g: 0,
    b: 0.05,
    s_nom: 250,
    tap_ratio: 1,
    tap_side: 0,
    phase_shift: 0,
    s_max_pu: 1,
  },
  shunt_impedances: {
    name: 'new_shunt',
    bus: 'New Bus',
    g: 0,
    b: 0.01,
    sign: 1,
  },
  global_constraints: {
    name: 'co2_cap',
    type: 'primary_energy',
    carrier_attribute: 'co2_emissions',
    sense: '<=',
    constant: 1000000,
    investment_period: '',
  },
  shapes: {
    name: 'new_shape',
    component: 'Bus',
    idx: 'New Bus',
    x1: 126.97,
    y1: 37.56,
    x2: 127.02,
    y2: 37.61,
  },
  processes: {
    name: 'new_process',
    bus0: 'New Bus',
    bus1: 'New Bus',
    carrier: 'hydrogen',
    p_nom: 100,
    efficiency: 0.75,
    marginal_cost: 20,
  },
};

// Carrier colors (sourced from public/sample_model.xlsx carriers sheet)
const CARRIER_COLORS: Record<string, string> = {
  AC: '#475569', LNG: '#1f4e79', Coal: '#374151', Nuclear: '#7c3aed',
  Solar: '#f59e0b', Wind: '#0f766e', Hydro: '#2563eb', Storage: '#14b8a6',
  battery: '#0ea5e9', Imports: '#dc2626', LoadShedding: '#991b1b',
  load: '#94a3b8', HVDC: '#6366f1', Other: '#94a3b8',
};

const DEFAULT_SCENARIO: ScenarioSettings = {
  caseName: 'Base Network',
  planningYear: 2026,
  demandGrowth: 3.2,
  renewableTarget: 42,
  storageExpansion: 900,
  transmissionExpansion: 8,
  carbonPrice: 42,
  reserveMargin: 18,
  priceSensitivity: 0.65,
};

const DEFAULT_RUN_SETTINGS: RunSettings = {
  snapshotStart: 0,
  snapshotEnd: 24,
  snapshotWeight: 1,
};

function createEmptyWorkbook(): WorkbookModel {
  const base = Object.fromEntries(SHEETS.map((s) => [s, []]));
  const ts = Object.fromEntries(TS_SHEETS.map((s) => [s, []]));
  return { ...base, ...ts } as unknown as WorkbookModel;
}

function parseSheets(workbook: ReturnType<typeof XLSX.read>): WorkbookModel {
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

async function loadSampleWorkbook(): Promise<WorkbookModel> {
  const res = await fetch('/sample_model.xlsx');
  if (!res.ok) throw new Error('Could not load sample_model.xlsx');
  const arrayBuffer = await res.arrayBuffer();
  return parseSheets(XLSX.read(arrayBuffer, { type: 'array' }));
}

function normalizeCell(value: unknown): Primitive {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') return value;
  return String(value);
}

function parseWorkbook(file: File): Promise<WorkbookModel> {
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

function buildWorkbook(model: WorkbookModel) {
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

function exportWorkbook(model: WorkbookModel, filename = 'pypsa_studio_case.xlsx') {
  XLSX.writeFile(buildWorkbook(model), filename);
}

function workbookToArrayBuffer(model: WorkbookModel): ArrayBuffer {
  return XLSX.write(buildWorkbook(model), { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}

function numberValue(value: Primitive | string | number | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  return 0;
}

function stringValue(value: Primitive | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

function hashColor(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = value.charCodeAt(index) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 65% 46%)`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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

function getColumns(rows: GridRow[], sheet: SheetName): string[] {
  const ordered = new Set<string>(Object.keys(DEFAULT_SHEET_ROWS[sheet]));
  rows.forEach((row) => Object.keys(row).forEach((key) => ordered.add(key)));
  return Array.from(ordered);
}

function carrierColor(carrier: string): string {
  return CARRIER_COLORS[carrier] || CARRIER_COLORS.Other;
}

function getBounds(model: WorkbookModel): LatLngBoundsExpression | null {
  const points = model.buses
    .map((bus) => [numberValue(bus.y), numberValue(bus.x)] as [number, number])
    .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
  return points.length ? points : null;
}

function getBusIndex(model: WorkbookModel): Record<string, GridRow> {
  const index: Record<string, GridRow> = {};
  model.buses.forEach((bus) => {
    index[stringValue(bus.name)] = bus;
  });
  return index;
}

function formatTimestamp(raw?: string) {
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function normalizeSeriesPoint(point: SeriesPoint): TimeSeriesRow {
  const fallbackValues = Object.fromEntries(
    Object.entries(point as Record<string, unknown>).filter(
      ([key, value]) => !['label', 'timestamp', 'total', 'values'].includes(key) && typeof value === 'number',
    ),
  ) as Record<string, number>;
  return {
    label: point.label,
    timestamp: point.timestamp,
    total: point.total || 0,
    ...fallbackValues,
    ...(point.values || {}),
  };
}

function buildRowsFromGeneratorDetails(
  generators: Record<string, GeneratorDetail>,
  mode: 'generator' | 'carrier',
): TimeSeriesRow[] {
  const buckets = new Map<string, TimeSeriesRow>();
  Object.values(generators).forEach((generator) => {
    generator.outputSeries.forEach((point) => {
      const key = mode === 'carrier' ? generator.carrier : generator.name;
      const row = buckets.get(point.timestamp) || { label: point.label, timestamp: point.timestamp };
      row[key] = numberValue(row[key] as string | number | undefined) + Math.max(point.output, 0);
      buckets.set(point.timestamp, row);
    });
  });
  return Array.from(buckets.values()).sort((left, right) => String(left.timestamp).localeCompare(String(right.timestamp)));
}

function buildSystemLoadRows(results: RunResults | null): TimeSeriesRow[] {
  if (!results) return [];
  const dispatchRows = (results.dispatchSeries || []).map((point) => ({
    label: point.label,
    timestamp: point.timestamp,
    load: numberValue((point as Record<string, unknown>).total as number | string | undefined),
  }));
  const hasPositiveDispatchLoad = dispatchRows.some((row) => numberValue(row.load as string | number | undefined) > 0);
  if (hasPositiveDispatchLoad) return dispatchRows;

  const buckets = new Map<string, TimeSeriesRow>();
  Object.values(results.assetDetails.buses || {}).forEach((bus) => {
    bus.netSeries.forEach((point) => {
      const row = buckets.get(point.timestamp) || { label: point.label, timestamp: point.timestamp, load: 0 };
      row.load = numberValue(row.load as string | number | undefined) + point.load;
      buckets.set(point.timestamp, row);
    });
  });
  return Array.from(buckets.values()).sort((left, right) => String(left.timestamp).localeCompare(String(right.timestamp)));
}

function FitToBounds({ bounds }: { bounds: LatLngBoundsExpression | null }) {
  const map = useMap();
  const fitted = useRef(false);

  useEffect(() => {
    if (bounds && !fitted.current) {
      map.fitBounds(bounds, { padding: [30, 30] });
      fitted.current = true;
    }
  }, [bounds, map]);

  return null;
}

function SummaryCards({ items }: { items: SummaryItem[] }) {
  return (
    <div className="analytics-summary">
      {items.map((item) => (
        <div key={item.label} className="summary-card">
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          <p>{item.detail}</p>
        </div>
      ))}
    </div>
  );
}

function DualRangeSlider({
  min, max, low, high, step = 1,
  formatLabel,
  onChange,
}: {
  min: number; max: number; low: number; high: number; step?: number;
  formatLabel?: (v: number) => string;
  onChange: (low: number, high: number) => void;
}) {
  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  const fmt = formatLabel ?? String;
  return (
    <div className="dual-range">
      <div className="dual-range-labels">
        <span>{fmt(low)}</span>
        <span>{fmt(high)}</span>
      </div>
      <div className="dual-range-track">
        <div className="dual-range-fill" style={{ left: `${pct(low)}%`, width: `${pct(high) - pct(low)}%` }} />
        <input
          type="range" min={min} max={max} step={step} value={low}
          className="dual-range-input"
          onChange={(e) => {
            const v = Number(e.target.value);
            onChange(Math.min(v, high - step), high);
          }}
        />
        <input
          type="range" min={min} max={max} step={step} value={high}
          className="dual-range-input"
          onChange={(e) => {
            const v = Number(e.target.value);
            onChange(low, Math.max(v, low + step));
          }}
        />
      </div>
    </div>
  );
}

function DonutChart({ data }: { data: MixItem[] }) {
  const cx = 190, cy = 190, outerR = 168, innerR = 100;
  const total = data.reduce((sum, item) => sum + item.value, 0) || 1;
  const [tooltip, setTooltip] = useState<{ label: string; value: number; x: number; y: number } | null>(null);

  const arc = (startAngle: number, endAngle: number): string => {
    const gap = 0.012; // small gap between segments in radians
    const s = startAngle + gap / 2;
    const e = endAngle - gap / 2;
    const cos = Math.cos, sin = Math.sin;
    const ox1 = cx + outerR * cos(s), oy1 = cy + outerR * sin(s);
    const ox2 = cx + outerR * cos(e), oy2 = cy + outerR * sin(e);
    const ix1 = cx + innerR * cos(e), iy1 = cy + innerR * sin(e);
    const ix2 = cx + innerR * cos(s), iy2 = cy + innerR * sin(s);
    const large = endAngle - startAngle > Math.PI ? 1 : 0;
    return `M${ox1} ${oy1} A${outerR} ${outerR} 0 ${large} 1 ${ox2} ${oy2} L${ix1} ${iy1} A${innerR} ${innerR} 0 ${large} 0 ${ix2} ${iy2} Z`;
  };

  const handleMove = (e: React.MouseEvent<SVGPathElement>, label: string, value: number) => {
    const svgEl = e.currentTarget.ownerSVGElement as SVGSVGElement;
    const pt = svgEl.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svgEl.getScreenCTM()!.inverse());
    setTooltip({ label, value, x: p.x, y: p.y });
  };

  let angle = -Math.PI / 2; // start at 12 o'clock

  return (
    <div className="donut-layout">
      <svg className="donut-chart" viewBox="0 0 380 380" role="img" aria-label="Mix chart"
        onMouseLeave={() => setTooltip(null)}>
        {data.map((item) => {
          const sweep = (item.value / total) * 2 * Math.PI;
          const endAngle = angle + sweep;
          const d = arc(angle, endAngle);
          angle = endAngle;
          return (
            <path
              key={item.label}
              d={d}
              fill={item.color}
              style={{ cursor: 'pointer' }}
              onMouseEnter={(e) => handleMove(e, item.label, item.value)}
              onMouseMove={(e) => handleMove(e, item.label, item.value)}
              onMouseLeave={() => setTooltip(null)}
            />
          );
        })}
        <circle cx={cx} cy={cy} r={innerR} fill="#ffffff" />
        <text x={cx} y={cy - 8} textAnchor="middle" className="donut-total-label">Total</text>
        <text x={cx} y={cy + 20} textAnchor="middle" className="donut-total-value">
          {Math.round(total).toLocaleString()}
        </text>
        {tooltip && (() => {
          const tx = tooltip.x + 14 + 160 > 370 ? tooltip.x - 174 : tooltip.x + 14;
          const ty = Math.max(8, Math.min(tooltip.y - 30, 380 - 56));
          return (
            <g transform={`translate(${tx},${ty})`} style={{ pointerEvents: 'none' }}>
              <rect rx="7" ry="7" width="160" height="48" fill="rgba(15,23,42,0.88)" />
              <text y="18" x="10" fill="rgba(255,255,255,0.75)" fontSize="11" fontFamily="IBM Plex Sans, sans-serif">{tooltip.label}</text>
              <text y="36" x="10" fill="white" fontSize="13" fontWeight="700" fontFamily="IBM Plex Sans, sans-serif">
                {Math.round(tooltip.value).toLocaleString()}
              </text>
            </g>
          );
        })()}
      </svg>
      <div className="legend-list">
        {data.map((item) => (
          <div key={item.label} className="legend-item">
            <span className="legend-swatch" style={{ backgroundColor: item.color }} />
            <span>{item.label}</span>
            <strong>{Math.round(item.value).toLocaleString()}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function TimelineSlider({
  data,
  startIndex,
  endIndex,
  onChange,
}: {
  data: Array<{ timestamp?: string }>;
  startIndex: number;
  endIndex: number;
  onChange: (start: number, end: number) => void;
}) {
  if (!data.length) return null;
  const maxIdx = Math.max(data.length - 1, 0);
  return (
    <div className="chart-time-controls analytics-time-controls">
      <div style={{ flex: 1, minWidth: 0 }}>
        <DualRangeSlider
          min={0} max={maxIdx}
          low={startIndex} high={endIndex}
          formatLabel={(v) => formatTimestamp(data[v]?.timestamp) ?? String(v)}
          onChange={(lo, hi) => onChange(lo, hi)}
        />
      </div>
      <div className="chart-window">
        <strong>{endIndex - startIndex + 1}</strong>
        <span>
          {formatTimestamp(data[startIndex]?.timestamp)} to {formatTimestamp(data[endIndex]?.timestamp)}
        </span>
      </div>
    </div>
  );
}

function aggregateValues(values: number[], reducer: MetricOption['reducer']) {
  if (!values.length) return 0;
  if (reducer === 'sum') return values.reduce((sum, value) => sum + value, 0);
  if (reducer === 'last') return values[values.length - 1];
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getTimeBucket(timestamp: string | undefined, timeframe: TimeframeOption) {
  if (!timestamp || timeframe === 'hourly') return timestamp || '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  if (timeframe === 'aggregated') return 'aggregated';
  if (timeframe === 'yearly') return `${date.getFullYear()}`;
  if (timeframe === 'monthly') return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  if (timeframe === 'daily') return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const start = new Date(date);
  const day = (date.getDay() + 6) % 7;
  start.setDate(date.getDate() - day);
  start.setHours(0, 0, 0, 0);
  return `${start.getFullYear()}-W${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
}

function aggregateMetricRows(metric: MetricOption, startIndex: number, endIndex: number, timeframe: TimeframeOption) {
  const rows = metric.rows.slice(startIndex, endIndex + 1);
  if (!rows.length) return [];
  if (timeframe === 'hourly') return rows;
  if (timeframe === 'aggregated') {
    const aggregated: TimeSeriesRow = { label: 'Total', timestamp: rows[rows.length - 1]?.timestamp };
    metric.series.forEach((item) => {
      aggregated[item.key] = aggregateValues(
        rows.map((row) => numberValue(row[item.key] as string | number | undefined)),
        metric.reducer,
      );
    });
    return [aggregated];
  }
  const buckets = new Map<string, TimeSeriesRow[]>();
  rows.forEach((row) => {
    const bucket = getTimeBucket(row.timestamp, timeframe);
    const current = buckets.get(bucket) || [];
    current.push(row);
    buckets.set(bucket, current);
  });
  return Array.from(buckets.entries()).map(([bucket, bucketRows]) => {
    const aggregated: TimeSeriesRow = { label: bucket, timestamp: bucketRows[bucketRows.length - 1]?.timestamp };
    metric.series.forEach((item) => {
      aggregated[item.key] = aggregateValues(
        bucketRows.map((row) => numberValue(row[item.key] as string | number | undefined)),
        metric.reducer,
      );
    });
    return aggregated;
  });
}

function buildDonutFromMetric(metric: MetricOption, startIndex: number, endIndex: number): MixItem[] {
  // Always aggregate to a single row so donut values are in the metric's native unit (e.g. avg MW, not sum-of-hours MWh)
  const rows = aggregateMetricRows(metric, startIndex, endIndex, 'aggregated');
  return metric.series
    .map((item) => ({
      label: item.label,
      value: rows.reduce((sum, row) => sum + Math.abs(numberValue(row[item.key] as string | number | undefined)), 0),
      color: item.color,
    }))
    .filter((item) => item.value > 0)
    .sort((left, right) => right.value - left.value);
}

function InteractiveTimeSeriesCard({
  title,
  description,
  data,
  series,
  mode,
  stacked,
}: {
  title: string;
  description: string;
  data: TimeSeriesRow[];
  series: TimeSeriesSeries[];
  mode: ChartMode;
  stacked: boolean;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  if (!series.length) {
    return (
      <section className="chart-card chart-card-wide">
        <div className="chart-card-header">
          <div>
            <h3>{title}</h3>
            <p>{description}</p>
          </div>
        </div>
        <p className="empty-text">No chart series are available for this selection.</p>
      </section>
    );
  }

  if (!data.length) {
    return (
      <section className="chart-card">
        <div className="chart-card-header">
          <div>
            <h3>{title}</h3>
            <p>{description}</p>
          </div>
        </div>
        <p className="empty-text">No series available for this selection.</p>
      </section>
    );
  }

  const visible = data;
  const width = 820;
  const height = 360;
  const padding = 38;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const visibleSeries = series.filter((item) =>
    visible.some((row) => Math.abs(numberValue(row[item.key] as string | number | undefined)) > 1e-6),
  );

  let maxValue = 1;
  let minValue = 0;
  if (stacked && (mode === 'area' || mode === 'bar' || mode === 'line')) {
    maxValue = Math.max(
      1,
      ...visible.map((row) =>
        visibleSeries.reduce((sum, item) => sum + Math.max(0, numberValue(row[item.key] as string | number | undefined)), 0),
      ),
    );
  } else {
    maxValue = Math.max(
      1,
      ...visible.flatMap((row) => visibleSeries.map((item) => Math.abs(numberValue(row[item.key] as string | number | undefined)))),
    );
    minValue = Math.min(
      0,
      ...visible.flatMap((row) => visibleSeries.map((item) => numberValue(row[item.key] as string | number | undefined))),
    );
  }

  const range = Math.max(maxValue - minValue, 1);

  const xForIndex = (index: number) => padding + (index / Math.max(visible.length - 1, 1)) * innerWidth;
  const yForValue = (value: number) => padding + innerHeight - ((value - minValue) / range) * innerHeight;
  const zeroY = yForValue(0);

  return (
    <section className="chart-card chart-card-wide">
      <div className="chart-card-header">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
      </div>
      <div className="chart-shell">
        <div className="chart-main">
          <svg className="chart-svg" viewBox={`0 0 ${width} ${height}`} role="img"
            onMouseLeave={() => setHoverIndex(null)}
            onMouseMove={(e) => {
              const svgEl = e.currentTarget as SVGSVGElement;
              const pt = svgEl.createSVGPoint();
              pt.x = e.clientX;
              pt.y = e.clientY;
              const svgPt = pt.matrixTransform(svgEl.getScreenCTM()!.inverse());
              const rawIndex = Math.round(((svgPt.x - padding) / innerWidth) * (visible.length - 1));
              setHoverIndex(Math.max(0, Math.min(visible.length - 1, rawIndex)));
            }}
          >
            {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
              <g key={tick}>
                <line
                  x1={padding}
                  x2={width - padding}
                  y1={padding + innerHeight - innerHeight * tick}
                  y2={padding + innerHeight - innerHeight * tick}
                  className="chart-grid"
                />
                <text x={8} y={padding + innerHeight - innerHeight * tick + 4} className="chart-axis">
                  {Math.round(minValue + range * tick)}
                </text>
              </g>
            ))}
            {mode === 'bar' &&
              visible.map((row, rowIndex) => {
                const groupWidth = innerWidth / Math.max(visible.length, 1);
                const baseX = padding + rowIndex * groupWidth;
                let runningStack = 0;
                return (
                  <g key={`${row.label}-${rowIndex}`}>
                    {visibleSeries.map((item, itemIndex) => {
                      const rawValue = numberValue(row[item.key] as string | number | undefined);
                      const value = stacked ? Math.max(0, rawValue) : rawValue;
                      if (stacked) {
                        const barHeight = (value / maxValue) * innerHeight;
                        const y = height - padding - (runningStack / maxValue) * innerHeight - barHeight;
                        runningStack += value;
                        return (
                          <rect
                            key={item.key}
                            x={baseX + 4}
                            y={y}
                            width={Math.max(groupWidth - 8, 3)}
                            height={barHeight}
                            fill={item.color}
                            fillOpacity={0.82}
                          />
                        );
                      }
                      const barWidth = Math.max((groupWidth - 10) / Math.max(visibleSeries.length, 1), 4);
                      const y = Math.min(zeroY, yForValue(value));
                      const barHeight = Math.abs(zeroY - yForValue(value));
                      return (
                        <rect
                          key={item.key}
                          x={baseX + 4 + itemIndex * barWidth}
                          y={y}
                          width={barWidth - 2}
                          height={barHeight}
                          fill={item.color}
                          fillOpacity={0.82}
                        />
                      );
                    })}
                  </g>
                );
              })}
            {mode === 'area' &&
              (() => {
                let runningBase = new Array(visible.length).fill(0);
                return visibleSeries.map((item) => {
                  const topPoints = visible.map((row, index) => {
                    const rawValue = numberValue(row[item.key] as string | number | undefined);
                    const value = stacked ? Math.max(0, rawValue) : rawValue;
                    const top = stacked ? runningBase[index] + value : value;
                    return `${xForIndex(index)},${yForValue(top)}`;
                  });
                  const bottomPoints = [...visible]
                    .reverse()
                    .map((row, reverseIndex) => {
                      const index = visible.length - 1 - reverseIndex;
                      const base = stacked ? runningBase[index] : 0;
                      return `${xForIndex(index)},${yForValue(base)}`;
                    });
                  const polygon = (
                    <polygon
                      key={item.key}
                      points={[...topPoints, ...bottomPoints].join(' ')}
                      fill={item.color}
                      fillOpacity={stacked ? 0.72 : 0.24}
                      stroke={item.color}
                      strokeWidth={1.8}
                    />
                  );
                  if (stacked) {
                    runningBase = runningBase.map(
                      (base, index) => base + Math.max(0, numberValue(visible[index][item.key] as string | number | undefined)),
                    );
                  }
                  return polygon;
                });
              })()}
            {mode === 'line' &&
              (() => {
                let runningBase = new Array(visible.length).fill(0);
                return visibleSeries.map((item) => {
                  const path = visible
                    .map((row, index) => {
                      const raw = numberValue(row[item.key] as string | number | undefined);
                      const value = stacked ? runningBase[index] + Math.max(0, raw) : raw;
                      return `${index === 0 ? 'M' : 'L'} ${xForIndex(index)} ${yForValue(value)}`;
                    })
                    .join(' ');
                  if (stacked) {
                    runningBase = runningBase.map(
                      (base, index) => base + Math.max(0, numberValue(visible[index][item.key] as string | number | undefined)),
                    );
                  }
                  return <path key={item.key} d={path} fill="none" stroke={item.color} strokeWidth={3} strokeLinecap="round" />;
                });
              })()}
            {visible.map((row, index) => (
              <text key={`${row.label}-${index}`} x={xForIndex(index)} y={height - 8} className="chart-axis chart-axis-x">
                {index % Math.max(1, Math.ceil(visible.length / 8)) === 0 ? row.label : ''}
              </text>
            ))}
            {minValue < 0 && maxValue > 0 && (
              <line x1={padding} x2={width - padding} y1={zeroY} y2={zeroY} stroke="rgba(15, 23, 42, 0.28)" strokeWidth={1.2} />
            )}
            {hoverIndex !== null && (() => {
              const hx = xForIndex(hoverIndex);
              const row = visible[hoverIndex];
              const tooltipItems = visibleSeries.map((s) => ({
                label: s.label,
                color: s.color,
                value: numberValue(row[s.key] as string | number | undefined),
              }));
              const tipWidth = 180;
              const tipHeight = 20 + tooltipItems.length * 18;
              const tx = hx + 12 + tipWidth > width - padding ? hx - tipWidth - 12 : hx + 12;
              const ty = Math.max(padding, padding + 4);
              return (
                <g style={{ pointerEvents: 'none' }}>
                  <line x1={hx} x2={hx} y1={padding} y2={height - padding} stroke="rgba(15,23,42,0.22)" strokeWidth={1.5} strokeDasharray="4 3" />
                  <g transform={`translate(${tx},${ty})`}>
                    <rect rx="7" ry="7" width={tipWidth} height={tipHeight} fill="rgba(15,23,42,0.88)" />
                    <text x="10" y="14" fill="rgba(255,255,255,0.7)" fontSize="10" fontFamily="IBM Plex Sans, sans-serif">{row.label}</text>
                    {tooltipItems.map((item, i) => (
                      <g key={item.label} transform={`translate(10,${22 + i * 18})`}>
                        <rect x="0" y="-8" width="8" height="8" rx="2" fill={item.color} />
                        <text x="12" y="0" fill="white" fontSize="11" fontFamily="IBM Plex Sans, sans-serif">
                          {item.label}: <tspan fontWeight="700">{Math.round(item.value).toLocaleString()}</tspan>
                        </text>
                      </g>
                    ))}
                  </g>
                </g>
              );
            })()}
            <rect x={padding} y={padding} width={innerWidth} height={innerHeight} fill="transparent" />
          </svg>
        </div>
        <div className="chart-legend chart-legend-side">
          {visibleSeries.map((item) => (
            <div key={item.key} className="legend-item-inline">
              <span className="legend-swatch" style={{ backgroundColor: item.color }} />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function UserDefinedChartCard({
  section,
  metricOptions,
  onChange,
  onClean,
  onRemove,
}: {
  section: ChartSectionConfig;
  metricOptions: MetricOption[];
  onChange: (next: ChartSectionConfig) => void;
  onClean: () => void;
  onRemove: () => void;
}) {
  const metric = metricOptions.find((item) => item.key === section.metricKey);
  const hasMetric = Boolean(metric);
  const metricRows = metric?.rows || [];
  const safeStart = hasMetric ? clamp(Math.min(section.startIndex, section.endIndex), 0, Math.max(metricRows.length - 1, 0)) : 0;
  const safeEnd = hasMetric ? clamp(Math.max(section.endIndex, safeStart), safeStart, Math.max(metricRows.length - 1, 0)) : 0;
  const aggregatedRows = hasMetric ? aggregateMetricRows(metric, safeStart, safeEnd, section.timeframe) : [];
  const allowDonut = Boolean(metric?.allowDonut);

  return (
    <section className="chart-card chart-builder-card">
      <div className="chart-card-header chart-card-controls">
        <div>
          <h3>{hasMetric ? metric.label : 'Empty chart'}</h3>
          <p>{hasMetric ? metric.unit : 'Select a value to render a chart.'}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="ghost-button" onClick={onClean}>Clean</button>
          <button className="ghost-button" style={{ color: '#dc2626' }} onClick={onRemove}>Remove</button>
        </div>
      </div>
      <div className="chart-builder-controls">
        <label className="chart-control">
          <span>Value</span>
          <select
            value={section.metricKey}
            onChange={(event) =>
              onChange({
                ...section,
                metricKey: event.target.value,
                startIndex: 0,
                endIndex: Math.max((metricOptions.find((item) => item.key === event.target.value)?.rows.length || 1) - 1, 0),
                chartType:
                  event.target.value !== EMPTY_METRIC_KEY &&
                  metricOptions.find((item) => item.key === event.target.value)?.allowDonut
                    ? section.chartType
                    : section.chartType === 'donut'
                      ? 'line'
                      : section.chartType,
              })
            }
          >
            <option value={EMPTY_METRIC_KEY}>Select value</option>
            {metricOptions.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="chart-control">
          <span>Timeframe</span>
          <select value={section.timeframe} onChange={(event) => onChange({ ...section, timeframe: event.target.value as TimeframeOption })}>
            <option value="aggregated">All aggregated</option>
            <option value="yearly">Yearly</option>
            <option value="monthly">Monthly</option>
            <option value="weekly">Weekly</option>
            <option value="daily">Daily</option>
            <option value="hourly">Hourly</option>
          </select>
        </label>
        <label className="chart-control">
          <span>Chart</span>
          <select
            value={section.chartType}
            onChange={(event) => onChange({ ...section, chartType: event.target.value as ChartSectionType })}
            disabled={!hasMetric}
          >
            <option value="line">Line</option>
            <option value="area">Area</option>
            <option value="bar">Bar</option>
            <option value="donut" disabled={!allowDonut}>
              Donut
            </option>
          </select>
        </label>
        {section.chartType !== 'donut' && (
          <label className="chart-control">
            <span>Stacking</span>
            <select
              value={section.stacked ? 'stacked' : 'normal'}
              onChange={(event) => onChange({ ...section, stacked: event.target.value === 'stacked' })}
              disabled={!hasMetric}
            >
              <option value="stacked">Stacked</option>
              <option value="normal">Normal</option>
            </select>
          </label>
        )}
      </div>
      {hasMetric && (
        <TimelineSlider
          data={metric.rows}
          startIndex={safeStart}
          endIndex={safeEnd}
          onChange={(lo, hi) => onChange({ ...section, startIndex: lo, endIndex: hi })}
        />
      )}
      {!hasMetric ? (
        <div className="chart-empty-state">
          <p className="empty-text">Choose a value, timeframe, and chart type for this section.</p>
        </div>
      ) : section.chartType === 'donut' ? (
        <section className="chart-card">
          <div className="chart-card-header">
            <div>
              <h3>{metric.label}</h3>
              <p>{`average ${metric.unit} over selected time window`}</p>
            </div>
          </div>
          {buildDonutFromMetric(metric, safeStart, safeEnd).length > 0 ? (
            <DonutChart data={buildDonutFromMetric(metric, safeStart, safeEnd)} />
          ) : (
            <p className="empty-text">No aggregated values available for the current selection.</p>
          )}
        </section>
      ) : (
        <InteractiveTimeSeriesCard
          title={metric.label}
          description={`${section.timeframe} ${metric.unit}`}
          data={aggregatedRows}
          series={metric.series}
          mode={section.chartType}
          stacked={section.stacked}
        />
      )}
    </section>
  );
}

function EmptyAnalytics() {
  return (
    <div className="analytics-empty">
      <h3>Analytics is empty until you run the model</h3>
      <p>
        Open the run dialog, set the number of snapshots and snapshot weight, then execute the case. The dashboard will populate after a successful backend run.
      </p>
    </div>
  );
}

// ── Spreadsheet components ────────────────────────────────────────────────────

interface SpreadsheetGridProps {
  rows: GridRow[];
  cols: string[];
  readOnly?: boolean;
  onUpdate?: (rowIndex: number, col: string, val: Primitive) => void;
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

// ── Tables two-panel layout ───────────────────────────────────────────────

type TableSelKind = 'static' | 'ts';
interface TableSel { kind: TableSelKind; sheet: AnySheetName }

const TABLE_GROUPS: Array<{
  label: string;
  sheet: SheetName;
  tsSheet?: TsSheetName;
}> = [
  { label: 'Network',           sheet: 'network' },
  { label: 'Snapshots',         sheet: 'snapshots' },
  { label: 'Carriers',          sheet: 'carriers' },
  { label: 'Buses',             sheet: 'buses' },
  { label: 'Generators',        sheet: 'generators',     tsSheet: 'generators-p_max_pu' },
  { label: 'Loads',             sheet: 'loads',          tsSheet: 'loads-p_set' },
  { label: 'Lines',             sheet: 'lines' },
  { label: 'Links',             sheet: 'links',          tsSheet: 'links-p_max_pu' },
  { label: 'Stores',            sheet: 'stores' },
  { label: 'Storage Units',     sheet: 'storage_units',  tsSheet: 'storage_units-inflow' },
  { label: 'Transformers',      sheet: 'transformers' },
  { label: 'Shunt Impedances',  sheet: 'shunt_impedances' },
  { label: 'Global Constraints',sheet: 'global_constraints' },
];

interface TablesPaneProps {
  model: WorkbookModel;
  onUpdate: (sheet: SheetName, rowIndex: number, col: string, val: Primitive) => void;
  onAddRow: (sheet: SheetName) => void;
  onDeleteRow: (sheet: SheetName, rowIndex: number) => void;
}

function TablesPane({ model, onUpdate, onAddRow, onDeleteRow }: TablesPaneProps) {
  const [sel, setSel] = useState<TableSel>({ kind: 'static', sheet: 'buses' });
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleGroup = (sheet: string) =>
    setCollapsed((s) => { const n = new Set(s); n.has(sheet) ? n.delete(sheet) : n.add(sheet); return n; });

  // Resolve current data
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
      {/* ── Left nav ── */}
      <nav className="tables-nav">
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
                  <button
                    className={`nav-item${staticActive ? ' active' : ''}`}
                    onClick={() => setSel({ kind: 'static', sheet: g.sheet })}
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

      {/* ── Main content ── */}
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
              <button className="ghost-button sm danger" onClick={() => onDeleteRow(sel.sheet as SheetName, rows.length - 1)}>
                − Last row
              </button>
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

/** Derive the max snapshot count exclusively from the workbook's snapshots sheet.
 *  'now' or empty → 1 (static single-period model).
 *  Real datetime rows → their count.
 *  Never fall back to a config value — the workbook is the only source of truth. */
function snapshotMaxFromWorkbook(rows: GridRow[]): number {
  if (!rows || rows.length === 0) return 1;
  if (rows.length === 1) {
    const label = String(
      rows[0].snapshot ?? rows[0].name ?? rows[0].datetime ?? ''
    ).trim().toLowerCase();
    if (label === 'now' || label === '') return 1;
  }
  return rows.length;
}

function App() {
  const [model, setModel] = useState<WorkbookModel>(() => createEmptyWorkbook());
  const [tab, setTab] = useState<WorkspaceTab>('Map');
  const [scenario] = useState<ScenarioSettings>(DEFAULT_SCENARIO);
  const [runSettings, setRunSettings] = useState<RunSettings>(DEFAULT_RUN_SETTINGS);
  const [maxSnapshots, setMaxSnapshots] = useState<number>(1);
  const [results, setResults] = useState<RunResults | null>(null);
  const [analyticsFocus, setAnalyticsFocus] = useState<AnalyticsFocus>({ type: 'system' });
  const [chartSections, setChartSections] = useState<ChartSectionConfig[]>([]);
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [validateResult, setValidateResult] = useState<{
    valid: boolean;
    errors: string[];
    warnings: string[];
    notes: string[];
    snapshotCount: number;
    networkSummary: Record<string, number>;
  } | null>(null);
  const [status, setStatus] = useState('Ready. Import a workbook or edit the demo model.');
  const [fileHandle, setFileHandle] = useState<BrowserFileHandle | null>(null);
  const [filename, setFilename] = useState('pypsa_studio_case.xlsx');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    loadSampleWorkbook().then((sampleModel) => {
      if (!sampleModel) return;
      const snapshotMax = snapshotMaxFromWorkbook(sampleModel.snapshots);
      setMaxSnapshots(snapshotMax);
      setModel(sampleModel);
      setRunSettings((s) => ({ ...s, snapshotEnd: Math.min(s.snapshotEnd, snapshotMax) }));
    }).catch(() => null);
  }, []);


  const bounds = useMemo(() => getBounds(model), [model.buses]);  // eslint-disable-line react-hooks/exhaustive-deps
  const busIndex = useMemo(() => getBusIndex(model), [model.buses]);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!results) {
      setAnalyticsFocus({ type: 'system' });
      return;
    }
    if (analyticsFocus.type === 'system') return;
    if (analyticsFocus.type === 'generator' && results.assetDetails.generators[analyticsFocus.key]) return;
    if (analyticsFocus.type === 'bus' && results.assetDetails.buses[analyticsFocus.key]) return;
    if (analyticsFocus.type === 'storageUnit' && results.assetDetails.storageUnits[analyticsFocus.key]) return;
    if (analyticsFocus.type === 'store' && results.assetDetails.stores[analyticsFocus.key]) return;
    if (analyticsFocus.type === 'branch' && results.assetDetails.branches[analyticsFocus.key]) return;
    setAnalyticsFocus({ type: 'system' });
  }, [results, analyticsFocus]);


  const resetForNewModel = (nextModel: WorkbookModel, name?: string) => {
    const snapshotMax = snapshotMaxFromWorkbook(nextModel.snapshots);
    setMaxSnapshots(snapshotMax);
    setModel(nextModel);
    setResults(null);
    setChartSections([]);
    setValidateResult(null);
    setAnalyticsFocus({ type: 'system' });
    setRunSettings({ ...DEFAULT_RUN_SETTINGS, snapshotEnd: Math.min(DEFAULT_RUN_SETTINGS.snapshotEnd, snapshotMax) });
    if (name) setFilename(name);
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const nextModel = await parseWorkbook(file);
      resetForNewModel(nextModel, file.name || 'pypsa_studio_case.xlsx');
      setFileHandle(null);
      setResults(null);
      setStatus(`Imported workbook: ${file.name}. Analytics will populate after the next run.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Workbook import failed.');
    } finally {
      if (event.target) event.target.value = '';
    }
  };

  const handleOpenWorkbook = async () => {
    const picker = (window as any).showOpenFilePicker;
    if (!picker) {
      fileInputRef.current?.click();
      return;
    }
    try {
      const [handle] = await picker({
        excludeAcceptAllOption: true,
        multiple: false,
        types: [{ description: 'Excel Workbook', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }],
      });
      const file = await handle.getFile();
      const nextModel = await parseWorkbook(file);
      resetForNewModel(nextModel, file.name || 'pypsa_studio_case.xlsx');
      setFileHandle(handle);
      setStatus(`Opened workbook: ${file.name}`);
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') setStatus('Workbook open failed.');
    }
  };

  const updateRowValue = (sheet: SheetName, rowIndex: number, key: string, value: Primitive) => {
    setModel((current) => {
      const nextRows = current[sheet].map((row, index) => (index === rowIndex ? { ...row, [key]: value } : row));
      return { ...current, [sheet]: nextRows };
    });
  };

  const addRow = (sheet: SheetName) => {
    setModel((current) => {
      const nextRows = [...current[sheet], { ...DEFAULT_SHEET_ROWS[sheet] }];
      return { ...current, [sheet]: nextRows };
    });
    setStatus(`Added a new row to ${sheet}.`);
  };

  const deleteRow = (sheet: SheetName, rowIndex: number) => {
    setModel((current) => {
      const nextRows = current[sheet].filter((_, i) => i !== rowIndex);
      return { ...current, [sheet]: nextRows };
    });
    setStatus(`Removed row ${rowIndex + 1} from ${sheet}.`);
  };

  const saveAsWorkbook = async () => {
    const saver = (window as any).showSaveFilePicker;
    const suggestedName = filename || 'pypsa_studio_case.xlsx';
    if (!saver) {
      const requested = window.prompt('Save workbook as', suggestedName) || suggestedName;
      exportWorkbook(model, requested);
      setFilename(requested);
      setStatus(`Saved workbook as ${requested}.`);
      return;
    }
    try {
      const handle = await saver({
        suggestedName,
        types: [{ description: 'Excel Workbook', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(workbookToArrayBuffer(model));
      await writable.close();
      setFileHandle(handle);
      setFilename(handle.name || suggestedName);
      setStatus(`Saved workbook as ${handle.name || suggestedName}.`);
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') setStatus('Save As failed.');
    }
  };

  const saveWorkbook = async () => {
    if (!fileHandle) {
      await saveAsWorkbook();
      return;
    }
    try {
      const writable = await fileHandle.createWritable();
      await writable.write(workbookToArrayBuffer(model));
      await writable.close();
      setStatus(`Saved workbook ${filename}.`);
    } catch {
      await saveAsWorkbook();
    }
  };

  const buildRunOptions = () => {
    const snapshotCount = runSettings.snapshotEnd - runSettings.snapshotStart;
    return {
      model,
      scenario,
      options: {
        snapshotCount,
        snapshotStart: runSettings.snapshotStart,
        snapshotWeight: runSettings.snapshotWeight,
      },
    };
  };

  const handleRunModel = async () => {
    setRunDialogOpen(false);
    const snapshotCount = runSettings.snapshotEnd - runSettings.snapshotStart;

    if (dryRun) {
      setStatus('Validating model structure...');
      try {
        const response = await fetch(`${API_BASE}/api/validate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildRunOptions()),
        });
        const result = await response.json();
        setValidateResult(result);
        setTab('Validation');
        setStatus(result.valid ? 'Validation passed — model structure is valid.' : `Validation failed: ${result.errors.length} error(s).`);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Validation request failed.');
      }
      return;
    }

    setStatus(`Running ${scenario.caseName} with ${snapshotCount} snapshots at ${runSettings.snapshotWeight} h weighting...`);
    try {
      const response = await fetch(`${API_BASE}/api/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildRunOptions()),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Backend run failed with status ${response.status}.`);
      }
      const nextResults = (await response.json()) as RunResults;
      setResults(nextResults);
      setAnalyticsFocus({ type: 'system' });
      setTab('Analytics');
      setStatus(`Backend PyPSA run completed with ${nextResults.runMeta.snapshotCount} snapshots over ${nextResults.runMeta.modeledHours} modeled hours.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Backend PyPSA run failed.');
    }
  };

  const lineGeometries = model.lines
    .map((line) => {
      const bus0 = busIndex[stringValue(line.bus0)];
      const bus1 = busIndex[stringValue(line.bus1)];
      if (!bus0 || !bus1) return null;
      return {
        name: stringValue(line.name),
        positions: [
          [numberValue(bus0.y), numberValue(bus0.x)],
          [numberValue(bus1.y), numberValue(bus1.x)],
        ] as [number, number][],
        sNom: numberValue(line.s_nom),
      };
    })
    .filter(Boolean) as Array<{ name: string; positions: [number, number][]; sNom: number }>;

  const linkGeometries = model.links
    .map((link) => {
      const bus0 = busIndex[stringValue(link.bus0)];
      const bus1 = busIndex[stringValue(link.bus1)];
      if (!bus0 || !bus1) return null;
      return {
        name: stringValue(link.name),
        positions: [
          [numberValue(bus0.y), numberValue(bus0.x)],
          [numberValue(bus1.y), numberValue(bus1.x)],
        ] as [number, number][],
        pNom: numberValue(link.p_nom),
      };
    })
    .filter(Boolean) as Array<{ name: string; positions: [number, number][]; pNom: number }>;

  const transformerGeometries = model.transformers
    .map((transformer) => {
      const bus0 = busIndex[stringValue(transformer.bus0)];
      const bus1 = busIndex[stringValue(transformer.bus1)];
      if (!bus0 || !bus1) return null;
      return {
        name: stringValue(transformer.name),
        positions: [
          [numberValue(bus0.y), numberValue(bus0.x)],
          [numberValue(bus1.y), numberValue(bus1.x)],
        ] as [number, number][],
      };
    })
    .filter(Boolean) as Array<{ name: string; positions: [number, number][] }>;

  const rawSystemDispatchRows: TimeSeriesRow[] = (results?.dispatchSeries || []).map(normalizeSeriesPoint);
  const systemDispatchRows: TimeSeriesRow[] =
    rawSystemDispatchRows.some((row) =>
      Object.keys(row).some((key) => !['label', 'timestamp', 'total'].includes(key) && Math.abs(numberValue(row[key] as string | number | undefined)) > 1e-6),
    )
      ? rawSystemDispatchRows
      : buildRowsFromGeneratorDetails(results?.assetDetails.generators || {}, 'carrier');
  const inferredDispatchKeys = Array.from(
    new Set(
      systemDispatchRows.flatMap((row) =>
        Object.keys(row).filter((key) => !['label', 'timestamp', 'total'].includes(key)),
      ),
    ),
  );
  const dispatchKeys =
    inferredDispatchKeys.length > 0
      ? inferredDispatchKeys
      : (results?.carrierMix || []).map((item) => item.label).filter(Boolean);
  const systemDispatchSeries: TimeSeriesSeries[] = dispatchKeys.map((key) => ({
    key,
    label: key,
    color: carrierColor(key),
  }));
  const rawSystemGeneratorDispatchRows: TimeSeriesRow[] = (results?.generatorDispatchSeries || []).map(normalizeSeriesPoint);
  const systemGeneratorDispatchRows: TimeSeriesRow[] =
    rawSystemGeneratorDispatchRows.some((row) =>
      Object.keys(row).some((key) => !['label', 'timestamp', 'total'].includes(key) && Math.abs(numberValue(row[key] as string | number | undefined)) > 1e-6),
    )
      ? rawSystemGeneratorDispatchRows
      : buildRowsFromGeneratorDetails(results?.assetDetails.generators || {}, 'generator');
  const generatorDispatchKeys = Array.from(
    new Set(
      systemGeneratorDispatchRows.flatMap((row) =>
        Object.keys(row).filter((key) => !['label', 'timestamp', 'total'].includes(key)),
      ),
    ),
  );
  const systemGeneratorDispatchSeries: TimeSeriesSeries[] = generatorDispatchKeys.map((key) => ({
    key,
    label: key,
    color: hashColor(key),
  }));
  const systemPriceRows: TimeSeriesRow[] = (results?.systemPriceSeries || []).map((point) => ({
    label: point.label,
    timestamp: point.timestamp,
    price: point.value,
  }));
  const systemEmissionsRows: TimeSeriesRow[] = (results?.systemEmissionsSeries || []).map((point) => ({
    label: point.label,
    timestamp: point.timestamp,
    emissions: point.value,
  }));
  const storageRows: TimeSeriesRow[] = (results?.storageSeries || []).map((point) => ({
    label: point.label,
    timestamp: point.timestamp,
    charge: point.charge,
    discharge: point.discharge,
    state: point.state,
  }));
  const systemLoadRows: TimeSeriesRow[] = buildSystemLoadRows(results);
  const focusSignature = `${analyticsFocus.type}:${analyticsFocus.type === 'system' ? 'system' : analyticsFocus.key}`;
  const metricOptions: MetricOption[] = useMemo(
    () =>
      !results
        ? []
        : analyticsFocus.type === 'generator'
          ? [
          { key: 'output', label: 'Output', unit: 'MW', rows: results.assetDetails.generators[analyticsFocus.key]?.outputSeries.map((p) => ({ label: p.label, timestamp: p.timestamp, output: p.output })) || [], series: [{ key: 'output', label: 'Output MW', color: carrierColor(results.assetDetails.generators[analyticsFocus.key]?.carrier || 'Other') }], reducer: 'mean', allowDonut: false },
          { key: 'available', label: 'Available output', unit: 'MW', rows: results.assetDetails.generators[analyticsFocus.key]?.availableSeries.map((p) => ({ label: p.label, timestamp: p.timestamp, available: p.available })) || [], series: [{ key: 'available', label: 'Available MW', color: '#0f766e' }], reducer: 'mean', allowDonut: false },
          { key: 'curtailment', label: 'Curtailment', unit: 'MW', rows: results.assetDetails.generators[analyticsFocus.key]?.curtailmentSeries.map((p) => ({ label: p.label, timestamp: p.timestamp, curtailment: p.curtailment })) || [], series: [{ key: 'curtailment', label: 'Curtailment MW', color: '#f59e0b' }], reducer: 'mean', allowDonut: false },
          { key: 'emissions', label: 'Emissions', unit: 'tCO2e', rows: results.assetDetails.generators[analyticsFocus.key]?.emissionsSeries.map((p) => ({ label: p.label, timestamp: p.timestamp, emissions: p.emissions })) || [], series: [{ key: 'emissions', label: 'Emissions tCO2e', color: '#16a34a' }], reducer: 'sum', allowDonut: false },
          ]
        : analyticsFocus.type === 'bus'
          ? [
            { key: 'load', label: 'Load', unit: 'MW', rows: results.assetDetails.buses[analyticsFocus.key]?.netSeries.map((p) => ({ label: p.label, timestamp: p.timestamp, load: p.load })) || [], series: [{ key: 'load', label: 'Load MW', color: '#f97316' }], reducer: 'mean', allowDonut: false },
            { key: 'generation', label: 'Generation', unit: 'MW', rows: results.assetDetails.buses[analyticsFocus.key]?.netSeries.map((p) => ({ label: p.label, timestamp: p.timestamp, generation: p.generation })) || [], series: [{ key: 'generation', label: 'Generation MW', color: '#2563eb' }], reducer: 'mean', allowDonut: false },
            { key: 'smp', label: 'SMP', unit: '$/MWh', rows: results.assetDetails.buses[analyticsFocus.key]?.netSeries.map((p) => ({ label: p.label, timestamp: p.timestamp, smp: p.smp })) || [], series: [{ key: 'smp', label: 'SMP $/MWh', color: '#111827' }], reducer: 'mean', allowDonut: false },
            { key: 'emissions', label: 'Emissions', unit: 'tCO2e', rows: results.assetDetails.buses[analyticsFocus.key]?.netSeries.map((p) => ({ label: p.label, timestamp: p.timestamp, emissions: p.emissions })) || [], series: [{ key: 'emissions', label: 'Emissions tCO2e', color: '#16a34a' }], reducer: 'sum', allowDonut: false },
            ...(results.assetDetails.buses[analyticsFocus.key]?.hasVoltageMagnitude ? [{ key: 'v_mag_pu', label: 'Voltage magnitude', unit: 'p.u.', rows: results.assetDetails.buses[analyticsFocus.key]?.netSeries.map((p) => ({ label: p.label, timestamp: p.timestamp, v_mag_pu: p.v_mag_pu })) || [], series: [{ key: 'v_mag_pu', label: 'Voltage p.u.', color: '#7c3aed' }], reducer: 'mean' as const, allowDonut: false }] : []),
            ...(results.assetDetails.buses[analyticsFocus.key]?.hasVoltageAngle ? [{ key: 'v_ang', label: 'Voltage angle', unit: 'deg/rad', rows: results.assetDetails.buses[analyticsFocus.key]?.netSeries.map((p) => ({ label: p.label, timestamp: p.timestamp, v_ang: p.v_ang })) || [], series: [{ key: 'v_ang', label: 'Voltage angle', color: '#8b5cf6' }], reducer: 'mean' as const, allowDonut: false }] : []),
          ]
        : analyticsFocus.type === 'storageUnit'
          ? [
              { key: 'dispatch', label: 'Dispatch', unit: 'MW', rows: results.assetDetails.storageUnits[analyticsFocus.key]?.dispatchSeries.map((p) => ({ label: p.label, timestamp: p.timestamp, dispatch: p.dispatch })) || [], series: [{ key: 'dispatch', label: 'Dispatch MW', color: '#2563eb' }], reducer: 'mean', allowDonut: false },
              { key: 'storage_power', label: 'Storage power', unit: 'MW', rows: results.assetDetails.storageUnits[analyticsFocus.key]?.chargeSeries.map((p, i) => ({ label: p.label, timestamp: p.timestamp, charge: p.charge, discharge: results.assetDetails.storageUnits[analyticsFocus.key]?.dischargeSeries[i]?.discharge || 0 })) || [], series: [{ key: 'charge', label: 'Charge MW', color: '#0ea5e9' }, { key: 'discharge', label: 'Discharge MW', color: '#f97316' }], reducer: 'mean', allowDonut: true },
              { key: 'state', label: 'State of charge', unit: 'MWh', rows: results.assetDetails.storageUnits[analyticsFocus.key]?.stateSeries.map((p) => ({ label: p.label, timestamp: p.timestamp, state: p.state })) || [], series: [{ key: 'state', label: 'State MWh', color: '#14b8a6' }], reducer: 'mean', allowDonut: false },
            ]
          : analyticsFocus.type === 'store'
            ? [
                { key: 'energy', label: 'Energy', unit: 'MWh', rows: results.assetDetails.stores[analyticsFocus.key]?.energySeries.map((p) => ({ label: p.label, timestamp: p.timestamp, energy: p.energy })) || [], series: [{ key: 'energy', label: 'Energy MWh', color: '#7c3aed' }], reducer: 'mean', allowDonut: false },
                { key: 'power', label: 'Power', unit: 'MW', rows: results.assetDetails.stores[analyticsFocus.key]?.powerSeries.map((p) => ({ label: p.label, timestamp: p.timestamp, power: p.power })) || [], series: [{ key: 'power', label: 'Power MW', color: '#6d28d9' }], reducer: 'mean', allowDonut: false },
              ]
            : analyticsFocus.type === 'branch'
              ? [
                  { key: 'terminal_flows', label: 'Terminal flows', unit: 'MW', rows: results.assetDetails.branches[analyticsFocus.key]?.flowSeries.map((p) => ({ label: p.label, timestamp: p.timestamp, p0: p.p0, p1: p.p1 })) || [], series: [{ key: 'p0', label: 'P0 MW', color: '#2563eb' }, { key: 'p1', label: 'P1 MW', color: '#1d4ed8' }], reducer: 'mean', allowDonut: true },
                  { key: 'loading', label: 'Loading', unit: '%', rows: results.assetDetails.branches[analyticsFocus.key]?.loadingSeries.map((p) => ({ label: p.label, timestamp: p.timestamp, loading: p.loading })) || [], series: [{ key: 'loading', label: 'Loading %', color: '#ea580c' }], reducer: 'mean', allowDonut: false },
                  { key: 'losses', label: 'Losses', unit: 'MW', rows: results.assetDetails.branches[analyticsFocus.key]?.lossesSeries.map((p) => ({ label: p.label, timestamp: p.timestamp, losses: p.losses })) || [], series: [{ key: 'losses', label: 'Losses MW', color: '#dc2626' }], reducer: 'mean', allowDonut: false },
                ]
              : [
                  { key: 'dispatch', label: 'Dispatch by carrier', unit: 'MW', rows: systemDispatchRows, series: systemDispatchSeries, reducer: 'mean', allowDonut: true },
                  { key: 'dispatch_by_generator', label: 'Dispatch by generator', unit: 'MW', rows: systemGeneratorDispatchRows, series: systemGeneratorDispatchSeries, reducer: 'mean', allowDonut: true },
                  { key: 'load', label: 'Total load', unit: 'MW', rows: systemLoadRows, series: [{ key: 'load', label: 'Load MW', color: '#f97316' }], reducer: 'mean', allowDonut: false },
                  { key: 'system_price', label: 'System marginal price', unit: '$/MWh', rows: systemPriceRows, series: [{ key: 'price', label: 'Price $/MWh', color: '#111827' }], reducer: 'mean', allowDonut: false },
                  { key: 'system_emissions', label: 'System emissions', unit: 'tCO2e', rows: systemEmissionsRows, series: [{ key: 'emissions', label: 'Emissions tCO2e', color: '#16a34a' }], reducer: 'sum', allowDonut: false },
                  { key: 'storage_power', label: 'Storage power', unit: 'MW', rows: storageRows, series: [{ key: 'charge', label: 'Charge MW', color: '#0ea5e9' }, { key: 'discharge', label: 'Discharge MW', color: '#f97316' }], reducer: 'mean', allowDonut: true },
                  { key: 'storage_state', label: 'Storage state of charge', unit: 'MWh', rows: storageRows, series: [{ key: 'state', label: 'State of charge', color: '#14b8a6' }], reducer: 'mean', allowDonut: false },
                ],
    [results, analyticsFocus, systemDispatchRows, systemDispatchSeries, systemGeneratorDispatchRows, systemGeneratorDispatchSeries, systemLoadRows, systemPriceRows, systemEmissionsRows, storageRows],
  );
  const defaultMetricKey = metricOptions[0]?.key || EMPTY_METRIC_KEY;
  const defaultMetricRowsLength = metricOptions[0]?.rows.length || 0;
  const defaultMetricStacked = (metricOptions[0]?.series.length || 0) > 1;

  useEffect(() => {
    if (!metricOptions.length) {
      setChartSections([]);
      return;
    }
    setChartSections([
      {
        id: 1,
        metricKey: defaultMetricKey,
        chartType: 'line',
        timeframe: 'hourly',
        startIndex: 0,
        endIndex: Math.max(defaultMetricRowsLength - 1, 0),
        stacked: defaultMetricStacked,
      },
    ]);
  }, [focusSignature, results, defaultMetricKey, defaultMetricRowsLength, defaultMetricStacked, metricOptions.length]);

  const focusTitle =
    analyticsFocus.type === 'system'
      ? 'System analytics'
      : analyticsFocus.type === 'generator'
        ? analyticsFocus.key
        : analyticsFocus.type === 'bus'
          ? analyticsFocus.key
          : analyticsFocus.type === 'storageUnit'
            ? analyticsFocus.key
            : analyticsFocus.type === 'store'
              ? analyticsFocus.key
          : analyticsFocus.key;

  return (
    <div className="studio-shell">
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls" hidden onChange={handleImport} />

      <main className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <span className="topbar-brand">PyPSA Studio</span>
            <div className="topbar-divider" />
            <button className="run-button" onClick={() => setRunDialogOpen(true)}>Run</button>
            <div className="topbar-file-ops">
              <button className="tb-btn" onClick={handleOpenWorkbook}>Open</button>
              <button className="tb-btn" onClick={() => fileInputRef.current?.click()}>Import</button>
              <button className="tb-btn" onClick={saveWorkbook}>Save</button>
              <button className="tb-btn" onClick={saveAsWorkbook}>Save As</button>
              <button className="tb-btn tb-btn--muted" onClick={() => {
                loadSampleWorkbook()
                  .then((m) => resetForNewModel(m, 'sample_model.xlsx'))
                  .catch(() => setStatus('Could not reload sample model.'));
              }}>Demo</button>
            </div>
            <div className="case-chip">
              <span>Workbook</span>
              <strong>{filename}</strong>
            </div>
            <span className="topbar-status" title={status}>{status}</span>
          </div>
          <nav className="tab-nav">
            {(['Map', 'Tables', 'Validation', 'Analytics'] as WorkspaceTab[]).map((item) => (
              <button
                key={item}
                className={`tab-button ${tab === item ? 'is-active' : ''} ${item === 'Validation' && validateResult && !validateResult.valid ? 'tab-button--error' : ''} ${item === 'Validation' && validateResult && validateResult.valid ? 'tab-button--ok' : ''}`}
                onClick={() => setTab(item)}
              >
                {item}
                {item === 'Validation' && validateResult && (
                  <span className="tab-badge">{validateResult.valid ? '✓' : `${validateResult.errors.length + validateResult.warnings.length}`}</span>
                )}
              </button>
            ))}
          </nav>
        </header>

        <section className="workspace-body">
          <div className="workspace-main">
            {tab === 'Map' && (
              <div className="pane">
                <div className="pane-header">
                  <div>
                    <p className="eyebrow">Network</p>
                    <h2>Interactive grid map</h2>
                  </div>
                  <div className="inline-stats">
                    <span>{model.buses.length} buses</span>
                    <span>{model.lines.length} lines</span>
                    <span>{model.links.length} links</span>
                    <span>{model.transformers.length} transformers</span>
                  </div>
                </div>
                <div className="map-frame">
                  <MapContainer center={[36.35, 127.9]} zoom={7} className="leaflet-map" scrollWheelZoom>
                    <TileLayer
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    />
                    <FitToBounds bounds={bounds} />
                    {lineGeometries.map((line) => (
                      <Polyline key={line.name} positions={line.positions} pathOptions={{ color: '#2563eb', weight: 3, opacity: 0.72 }}>
                        <Tooltip>{line.name} · {Math.round(line.sNom)} MVA</Tooltip>
                      </Polyline>
                    ))}
                    {linkGeometries.map((link) => (
                      <Polyline key={link.name} positions={link.positions} pathOptions={{ color: '#0f766e', weight: 4, opacity: 0.84, dashArray: '10 8' }}>
                        <Tooltip>{link.name} · {Math.round(link.pNom)} MW link</Tooltip>
                      </Polyline>
                    ))}
                    {transformerGeometries.map((transformer) => (
                      <Polyline key={transformer.name} positions={transformer.positions} pathOptions={{ color: '#f97316', weight: 4, opacity: 0.78, dashArray: '8 6' }}>
                        <Tooltip>{transformer.name} · Transformer</Tooltip>
                      </Polyline>
                    ))}
                    {model.buses.map((bus, index) => (
                      <CircleMarker
                        key={`${stringValue(bus.name)}-${index}`}
                        center={[numberValue(bus.y), numberValue(bus.x)]}
                        radius={8}
                        pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#2563eb', fillOpacity: 0.95 }}
                        eventHandlers={{ click: () => setTab('Tables') }}
                      >
                        <Tooltip sticky>
                          <strong>{stringValue(bus.name)}</strong>
                          <br />
                          {numberValue(bus.v_nom)} kV · {stringValue(bus.carrier)}
                        </Tooltip>
                      </CircleMarker>
                    ))}
                    {model.generators.map((generator, index) => {
                      const bus = busIndex[stringValue(generator.bus)];
                      if (!bus) return null;
                      return (
                        <CircleMarker
                          key={`${stringValue(generator.name)}-${index}`}
                          center={[numberValue(bus.y) + 0.07, numberValue(bus.x) + 0.07]}
                          radius={5}
                          pathOptions={{ color: '#ffffff', weight: 1.5, fillColor: carrierColor(stringValue(generator.carrier)), fillOpacity: 0.95 }}
                          eventHandlers={{ click: () => setTab('Tables') }}
                        >
                          <Tooltip>{stringValue(generator.name)} · {stringValue(generator.carrier)} · {Math.round(numberValue(generator.p_nom))} MW</Tooltip>
                        </CircleMarker>
                      );
                    })}
                  </MapContainer>
                </div>
              </div>
            )}

            {tab === 'Tables' && (
              <div className="pane tables-pane">
                <TablesPane
                  model={model}
                  onUpdate={updateRowValue}
                  onAddRow={addRow}
                  onDeleteRow={deleteRow}
                />
              </div>
            )}

            {tab === 'Validation' && (
              <div className="pane validation-pane">
                {!validateResult ? (
                  <div className="validation-empty">
                    <p className="eyebrow">Validation</p>
                    <h2>No validation result yet</h2>
                    <p className="status-text" style={{ marginTop: 8 }}>
                      Open <strong>Run</strong> → check <strong>Dry run</strong> → click <strong>Validate</strong> to check the model structure.
                    </p>
                    <button className="run-button" style={{ marginTop: 18 }} onClick={() => { setDryRun(true); setRunDialogOpen(true); }}>
                      Validate now
                    </button>
                  </div>
                ) : (
                  <div className="validation-report">
                    <div className="validation-report-header">
                      <div>
                        <p className="eyebrow">Validation report</p>
                        <h2 className={validateResult.valid ? 'text-ok' : 'text-error'}>
                          {validateResult.valid ? 'Passed' : 'Failed'}
                        </h2>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignSelf: 'flex-start', marginTop: 4 }}>
                        <button className="tb-btn" onClick={() => { setDryRun(true); setRunDialogOpen(true); }}>Re-validate</button>
                        {validateResult.valid && (
                          <button className="run-button" onClick={() => { setDryRun(false); setRunDialogOpen(true); }}>Run model</button>
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
                )}
              </div>
            )}

            {tab === 'Analytics' && (
              <div className="pane analytics-pane">
                {!results ? (
                  <EmptyAnalytics />
                ) : (
                  <>
                    <div className="pane-header">
                      <div>
                        <p className="eyebrow">Analysis</p>
                        <h2>Interactive analytics dashboard</h2>
                      </div>
                      <div className="inline-stats">
                        <span>{scenario.caseName}</span>
                        <span>{results.runMeta.snapshotCount} snapshots</span>
                        <span>{results.runMeta.snapshotWeight} h weight</span>
                      </div>
                    </div>

                    <section className="chart-card analytics-map-card">
                      <div className="chart-card-header">
                        <div>
                          <h3>Map section</h3>
                          <p>Click a generator, bus, line, link, or transformer to switch the chart section below.</p>
                        </div>
                        <div className="focus-chip">
                          <span>Focus</span>
                          <strong>{focusTitle}</strong>
                        </div>
                      </div>
                      <div className="analytics-map-frame">
                        <MapContainer center={[36.35, 127.9]} zoom={7} className="leaflet-map" scrollWheelZoom>
                          <TileLayer
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                          />
                          <FitToBounds bounds={bounds} />
                          {lineGeometries.map((line) => {
                            const sel = analyticsFocus.type === 'branch' && analyticsFocus.key === line.name;
                            return (
                              <Polyline
                                key={line.name}
                                positions={line.positions}
                                pathOptions={{
                                  color: sel ? '#f59e0b' : '#2563eb',
                                  weight: sel ? 8 : 2,
                                  opacity: sel ? 1 : 0.72,
                                }}
                                eventHandlers={{ click: () => setAnalyticsFocus({ type: 'branch', key: line.name }) }}
                              >
                                <Tooltip>{line.name} · Line</Tooltip>
                              </Polyline>
                            );
                          })}
                          {linkGeometries.map((link) => {
                            const sel = analyticsFocus.type === 'branch' && analyticsFocus.key === link.name;
                            return (
                              <Polyline
                                key={link.name}
                                positions={link.positions}
                                pathOptions={{
                                  color: sel ? '#f59e0b' : '#0f766e',
                                  weight: sel ? 8 : 3,
                                  opacity: sel ? 1 : 0.72,
                                  dashArray: sel ? undefined : '10 8',
                                }}
                                eventHandlers={{ click: () => setAnalyticsFocus({ type: 'branch', key: link.name }) }}
                              >
                                <Tooltip>{link.name} · Link</Tooltip>
                              </Polyline>
                            );
                          })}
                          {transformerGeometries.map((transformer) => {
                            const sel = analyticsFocus.type === 'branch' && analyticsFocus.key === transformer.name;
                            return (
                              <Polyline
                                key={transformer.name}
                                positions={transformer.positions}
                                pathOptions={{
                                  color: sel ? '#f59e0b' : '#f97316',
                                  weight: sel ? 8 : 3,
                                  opacity: sel ? 1 : 0.72,
                                  dashArray: sel ? undefined : '8 6',
                                }}
                                eventHandlers={{ click: () => setAnalyticsFocus({ type: 'branch', key: transformer.name }) }}
                              >
                                <Tooltip>{transformer.name} · Transformer</Tooltip>
                              </Polyline>
                            );
                          })}
                          {model.buses.map((bus, index) => {
                            const busName = stringValue(bus.name);
                            const sel = analyticsFocus.type === 'bus' && analyticsFocus.key === busName;
                            return (
                              <CircleMarker
                                key={`${busName}-analytics-${index}`}
                                center={[numberValue(bus.y), numberValue(bus.x)]}
                                radius={sel ? 12 : 8}
                                pathOptions={{
                                  color: sel ? '#f59e0b' : '#ffffff',
                                  weight: sel ? 3 : 2,
                                  fillColor: '#2563eb',
                                  fillOpacity: 0.96,
                                }}
                                eventHandlers={{ click: () => setAnalyticsFocus({ type: 'bus', key: busName }) }}
                              >
                                <Tooltip>{busName} · Bus</Tooltip>
                              </CircleMarker>
                            );
                          })}
                          {model.generators.map((generator, index) => {
                            const bus = busIndex[stringValue(generator.bus)];
                            if (!bus) return null;
                            const name = stringValue(generator.name);
                            const sel = analyticsFocus.type === 'generator' && analyticsFocus.key === name;
                            return (
                              <CircleMarker
                                key={`${name}-analytics-${index}`}
                                center={[numberValue(bus.y) + 0.07, numberValue(bus.x) + 0.07]}
                                radius={sel ? 9 : 5}
                                pathOptions={{
                                  color: sel ? '#f59e0b' : '#ffffff',
                                  weight: sel ? 3 : 1.5,
                                  fillColor: carrierColor(stringValue(generator.carrier)),
                                  fillOpacity: 0.96,
                                }}
                                eventHandlers={{ click: () => setAnalyticsFocus({ type: 'generator', key: name }) }}
                              >
                                <Tooltip>{name} · Generator</Tooltip>
                              </CircleMarker>
                            );
                          })}
                          {model.storage_units.map((unit, index) => {
                            const bus = busIndex[stringValue(unit.bus)];
                            if (!bus) return null;
                            const name = stringValue(unit.name);
                            const sel = analyticsFocus.type === 'storageUnit' && analyticsFocus.key === name;
                            return (
                              <CircleMarker
                                key={`${name}-analytics-storage-${index}`}
                                center={[numberValue(bus.y) - 0.07, numberValue(bus.x) + 0.05]}
                                radius={sel ? 9 : 5}
                                pathOptions={{
                                  color: sel ? '#f59e0b' : '#ffffff',
                                  weight: sel ? 3 : 1.5,
                                  fillColor: '#14b8a6',
                                  fillOpacity: 0.96,
                                }}
                                eventHandlers={{ click: () => setAnalyticsFocus({ type: 'storageUnit', key: name }) }}
                              >
                                <Tooltip>{name} · Storage Unit</Tooltip>
                              </CircleMarker>
                            );
                          })}
                          {model.stores.map((store, index) => {
                            const bus = busIndex[stringValue(store.bus)];
                            if (!bus) return null;
                            const name = stringValue(store.name);
                            return (
                              <CircleMarker
                                key={`${name}-analytics-store-${index}`}
                                center={[numberValue(bus.y) - 0.08, numberValue(bus.x) - 0.06]}
                                radius={analyticsFocus.type === 'store' && analyticsFocus.key === name ? 7 : 4}
                                pathOptions={{
                                  color: '#ffffff',
                                  weight: 1.5,
                                  fillColor: '#7c3aed',
                                  fillOpacity: analyticsFocus.type === 'store' && analyticsFocus.key === name ? 1 : 0.92,
                                }}
                                eventHandlers={{ click: () => setAnalyticsFocus({ type: 'store', key: name }) }}
                              >
                                <Tooltip>{name} · Store</Tooltip>
                              </CircleMarker>
                            );
                          })}
                        </MapContainer>
                      </div>
                    </section>

                    <section className="analytics-charts-section">
                      <div className="section-heading">
                        <div>
                          <p className="eyebrow">Chart Section</p>
                          <h2>User-defined outputs</h2>
                        </div>
                        <div className="chart-section-actions">
                          <button className="ghost-button" onClick={() => setAnalyticsFocus({ type: 'system' })}>
                            Reset Focus
                          </button>
                          <button
                            className="ghost-button"
                            onClick={() => {
                              setChartSections((current) => [
                                ...current,
                                {
                                  id: Date.now(),
                                  metricKey: EMPTY_METRIC_KEY,
                                  chartType: 'line',
                                  timeframe: 'hourly',
                                  startIndex: 0,
                                  endIndex: 0,
                                  stacked: false,
                                },
                              ]);
                            }}
                          >
                            Add Chart
                          </button>
                        </div>
                      </div>
                      <SummaryCards
                        items={
                          analyticsFocus.type === 'generator'
                            ? results.assetDetails.generators[analyticsFocus.key]?.summary || []
                            : analyticsFocus.type === 'bus'
                              ? results.assetDetails.buses[analyticsFocus.key]?.summary || []
                              : analyticsFocus.type === 'storageUnit'
                                ? results.assetDetails.storageUnits[analyticsFocus.key]?.summary || []
                                : analyticsFocus.type === 'store'
                                  ? results.assetDetails.stores[analyticsFocus.key]?.summary || []
                                  : analyticsFocus.type === 'branch'
                                    ? results.assetDetails.branches[analyticsFocus.key]?.summary || []
                                    : results.summary
                        }
                      />
                      <div className="analytics-grid">
                        {chartSections.map((section) => (
                          <UserDefinedChartCard
                            key={section.id}
                            section={section}
                            metricOptions={metricOptions}
                            onChange={(next) =>
                              setChartSections((current) => current.map((item) => (item.id === section.id ? next : item)))
                            }
                            onClean={() =>
                              setChartSections((current) =>
                                current.map((item) =>
                                  item.id === section.id
                                    ? { ...item, metricKey: EMPTY_METRIC_KEY, chartType: 'line', timeframe: 'hourly', startIndex: 0, endIndex: 0, stacked: false }
                                    : item,
                                ),
                              )
                            }
                            onRemove={() =>
                              setChartSections((current) => current.filter((item) => item.id !== section.id))
                            }
                          />
                        ))}
                      </div>

                      <div className="narrative-panel">
                        <h3>Run notes</h3>
                        <ul>
                          {results.narrative.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    </section>
                  </>
                )}
              </div>
            )}
          </div>
        </section>
      </main>

      {runDialogOpen && (
        <div className="modal-backdrop" onClick={() => setRunDialogOpen(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="panel-title-row">
              <div>
                <p className="eyebrow">Run</p>
                <h2>Run configuration</h2>
              </div>
            </div>
            {maxSnapshots <= 1 ? (
              <div className="run-static-notice">
                <strong>Static single-period model</strong>
                <p>The workbook defines 1 snapshot (<code>now</code>). This runs as a single dispatch period.</p>
              </div>
            ) : (
              <>
                <div className="field" style={{ marginBottom: 16 }}>
                  <span style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>
                    Simulation window — <strong>{runSettings.snapshotEnd - runSettings.snapshotStart} snapshots</strong>
                    {' '}(snapshot {runSettings.snapshotStart} → {runSettings.snapshotEnd} of {maxSnapshots})
                  </span>
                  <DualRangeSlider
                    min={0} max={maxSnapshots}
                    low={runSettings.snapshotStart} high={runSettings.snapshotEnd}
                    formatLabel={(v) => `${v}`}
                    onChange={(lo, hi) => setRunSettings((s) => ({ ...s, snapshotStart: lo, snapshotEnd: hi }))}
                  />
                </div>
                <div className="field" style={{ marginBottom: 8 }}>
                  <span style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>
                    Snapshot weight — <strong>{runSettings.snapshotWeight} h/snapshot</strong>
                    {' '}({((runSettings.snapshotEnd - runSettings.snapshotStart) * runSettings.snapshotWeight).toFixed(0)} modeled hours)
                  </span>
                  <DualRangeSlider
                    min={0} max={24}
                    low={0} high={runSettings.snapshotWeight}
                    step={0.5}
                    formatLabel={(v) => `${v}h`}
                    onChange={(_lo, hi) => setRunSettings((s) => ({ ...s, snapshotWeight: Math.max(0.5, hi) }))}
                  />
                </div>
                <p className="status-text" style={{ marginBottom: 12 }}>
                  Weighting rescales period-dependent constraints (e_sum_min, e_sum_max) proportionally.
                </p>
              </>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              <span style={{ fontSize: '0.9rem' }}>
                <strong>Dry run</strong> — validate model structure without optimising
              </span>
            </label>
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setRunDialogOpen(false)}>Cancel</button>
              <button className="run-button" onClick={handleRunModel}>
                {dryRun ? 'Validate' : 'Run model'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
