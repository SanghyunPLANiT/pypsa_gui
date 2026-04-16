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
  return Array.from(ordered);
}

export function carrierColor(carrier: string): string {
  return CARRIER_COLORS[carrier] || CARRIER_COLORS.Other;
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
