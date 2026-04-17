import { LatLngBoundsExpression } from 'leaflet';
import { CARRIER_COLORS, DEFAULT_SHEET_ROWS } from '../constants';
import { GridRow, Primitive, SheetName, WorkbookModel } from '../types';

export function numberValue(value: Primitive | string | number | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  return 0;
}

export function stringValue(value: Primitive | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

export function hashColor(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = value.charCodeAt(index) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 65% 46%)`;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function inferInputValue(raw: string, current: Primitive): Primitive {
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

export function getColumns(rows: GridRow[], sheet: SheetName): string[] {
  const ordered = new Set<string>(Object.keys(DEFAULT_SHEET_ROWS[sheet]));
  rows.forEach((row) => Object.keys(row).forEach((key) => ordered.add(key)));
  const cols = Array.from(ordered);
  // Pin 'name' as the first data column on every static sheet
  const nameIdx = cols.indexOf('name');
  if (nameIdx > 0) {
    cols.splice(nameIdx, 1);
    cols.unshift('name');
  }
  return cols;
}

/** For temporal (_t) sheets the first column is the snapshot/timestamp key. */
export function getTsFirstCol(rows: GridRow[]): string {
  if (!rows.length) return 'snapshot';
  const keys = Object.keys(rows[0]);
  // Prefer explicit timestamp-like names; fall back to the very first key
  return (
    keys.find((k) => ['snapshot', 'datetime', 'timestamp', 'time'].includes(k.toLowerCase())) ??
    keys[0] ??
    'snapshot'
  );
}

export function carrierColor(carrier: string): string {
  return CARRIER_COLORS[carrier] || CARRIER_COLORS.Other;
}

/**
 * Map a line loading percentage (0–100+) to a colour on a
 * green → yellow → red traffic-light scale.
 */
export function loadingColor(pct: number): string {
  const t = Math.max(0, Math.min(1, pct / 100));
  if (t <= 0.5) {
    // green (#22c55e) → yellow (#f59e0b)
    const u = t * 2;
    const r = Math.round(34 + (245 - 34) * u);
    const g = Math.round(197 + (158 - 197) * u);
    const b = Math.round(94 + (11 - 94) * u);
    return `rgb(${r},${g},${b})`;
  } else {
    // yellow (#f59e0b) → red (#dc2626)
    const u = (t - 0.5) * 2;
    const r = Math.round(245 + (220 - 245) * u);
    const g = Math.round(158 + (38 - 158) * u);
    const b = Math.round(11 + (38 - 11) * u);
    return `rgb(${r},${g},${b})`;
  }
}

export function getBounds(model: WorkbookModel): LatLngBoundsExpression | null {
  const points = model.buses
    .map((bus) => [numberValue(bus.y), numberValue(bus.x)] as [number, number])
    .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
  return points.length ? points : null;
}

export function getBusIndex(model: WorkbookModel): Record<string, GridRow> {
  const index: Record<string, GridRow> = {};
  model.buses.forEach((bus) => {
    index[stringValue(bus.name)] = bus;
  });
  return index;
}

export function formatTimestamp(raw?: string) {
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function snapshotMaxFromWorkbook(rows: GridRow[]): number {
  if (!rows || rows.length === 0) return 1;
  for (const row of rows) {
    const label = String(row.snapshot ?? row.name ?? row.datetime ?? '').trim().toLowerCase();
    if (label === 'now' || label === '') return 1;
  }
  return rows.length;
}
