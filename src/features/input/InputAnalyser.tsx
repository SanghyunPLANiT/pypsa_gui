import React, { useMemo, useState } from 'react';
import { GridRow } from '../../shared/types';
import { numberValue, stringValue } from '../../shared/utils/helpers';

// ── Helpers ───────────────────────────────────────────────────────────────────

function isNumericCol(rows: GridRow[], col: string): boolean {
  const sample = rows.slice(0, 20).map((r) => r[col]);
  const numeric = sample.filter((v) => v !== null && v !== '' && Number.isFinite(Number(v)));
  return numeric.length > sample.length * 0.5;
}

function numVal(v: unknown): number {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
}

// ── Colour palette for multi-line TS chart ────────────────────────────────────

const LINE_COLORS = [
  '#2563eb', '#f97316', '#16a34a', '#dc2626', '#7c3aed',
  '#0891b2', '#d97706', '#be185d', '#065f46', '#1e40af',
];

// ── Static bar chart ──────────────────────────────────────────────────────────

interface BarChartProps {
  labels: string[];
  values: number[];
  unit: string;
}

function HorizontalBarChart({ labels, values, unit }: BarChartProps) {
  const max = Math.max(...values, 0);
  const barH = 22;
  const labelW = 130;
  const valueW = 60;
  const barAreaW = 340;
  const padX = 12;
  const padY = 8;
  const totalW = labelW + barAreaW + valueW + padX * 2;
  const totalH = padY * 2 + labels.length * (barH + 4);

  return (
    <svg
      viewBox={`0 0 ${totalW} ${totalH}`}
      style={{ width: '100%', maxWidth: totalW, display: 'block', fontFamily: 'inherit' }}
    >
      {labels.map((label, i) => {
        const y = padY + i * (barH + 4);
        const barW = max > 0 ? (values[i] / max) * barAreaW : 0;
        return (
          <g key={label}>
            {/* Label */}
            <text
              x={padX + labelW - 6}
              y={y + barH / 2 + 4}
              textAnchor="end"
              fontSize={11}
              fill="#627087"
            >
              {label.length > 18 ? label.slice(0, 17) + '…' : label}
            </text>
            {/* Bar background */}
            <rect
              x={padX + labelW}
              y={y}
              width={barAreaW}
              height={barH}
              rx={3}
              fill="#f1f5f9"
            />
            {/* Bar fill */}
            {barW > 0 && (
              <rect
                x={padX + labelW}
                y={y}
                width={barW}
                height={barH}
                rx={3}
                fill="#2563eb"
                opacity={0.8}
              />
            )}
            {/* Value */}
            <text
              x={padX + labelW + barAreaW + 6}
              y={y + barH / 2 + 4}
              fontSize={11}
              fill="#142033"
            >
              {values[i] === 0 ? '—' : values[i] < 1 ? values[i].toFixed(3) : values[i].toLocaleString(undefined, { maximumFractionDigits: 1 })}
              {unit ? ` ${unit}` : ''}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── TS line chart ─────────────────────────────────────────────────────────────

interface LineChartProps {
  xLabels: string[];
  series: { key: string; values: number[]; color: string }[];
}

function LineChart({ xLabels, series }: LineChartProps) {
  const W = 560;
  const H = 180;
  const padL = 50;
  const padR = 10;
  const padT = 12;
  const padB = 28;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const n = xLabels.length;

  const allVals = series.flatMap((s) => s.values);
  const minV = Math.min(...allVals, 0);
  const maxV = Math.max(...allVals, 0);
  const range = maxV - minV || 1;

  const xPos = (i: number) => padL + (i / Math.max(n - 1, 1)) * chartW;
  const yPos = (v: number) => padT + chartH - ((v - minV) / range) * chartH;

  // Thin out x-axis labels if too many
  const tickStep = Math.max(1, Math.ceil(n / 8));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', maxWidth: W, display: 'block', fontFamily: 'inherit' }}
    >
      {/* Y gridlines + labels */}
      {[0, 0.25, 0.5, 0.75, 1].map((t) => {
        const v = minV + t * range;
        const y = yPos(v);
        return (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y} y2={y} stroke="#e2e8f0" strokeWidth={1} />
            <text x={padL - 4} y={y + 4} textAnchor="end" fontSize={9} fill="#94a3b8">
              {v < 1 && v > -1 ? v.toFixed(2) : Math.round(v).toLocaleString()}
            </text>
          </g>
        );
      })}

      {/* X axis labels */}
      {xLabels.map((label, i) => {
        if (i % tickStep !== 0 && i !== n - 1) return null;
        return (
          <text key={i} x={xPos(i)} y={H - padB + 14} textAnchor="middle" fontSize={9} fill="#94a3b8">
            {label.length > 10 ? label.slice(0, 10) + '…' : label}
          </text>
        );
      })}

      {/* Lines */}
      {series.map((s) => {
        const pts = s.values.map((v, i) => `${xPos(i)},${yPos(v)}`).join(' ');
        return (
          <polyline
            key={s.key}
            points={pts}
            fill="none"
            stroke={s.color}
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────

function Legend({ items }: { items: { key: string; color: string }[] }) {
  if (items.length === 0) return null;
  return (
    <div className="ia-legend">
      {items.map(({ key, color }) => (
        <span key={key} className="ia-legend-item">
          <span className="ia-legend-dot" style={{ background: color }} />
          {key}
        </span>
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface InputAnalyserProps {
  rows: GridRow[];
  cols: string[];
  isTs: boolean;
  frozenCol: string | null;
}

export function InputAnalyser({ rows, cols, isTs, frozenCol }: InputAnalyserProps) {
  // Columns available for analysis (exclude the label/name column for TS)
  const analysisCols = useMemo(() => {
    if (isTs) {
      // All columns except the first (timestamp/label)
      return cols.filter((c) => c !== frozenCol);
    }
    // Static: only numeric columns
    return cols.filter((c) => c !== frozenCol && isNumericCol(rows, c));
  }, [rows, cols, isTs, frozenCol]);

  const [selectedCol, setSelectedCol] = useState<string>('');

  const activeCol = selectedCol && analysisCols.includes(selectedCol)
    ? selectedCol
    : analysisCols[0] ?? '';

  if (analysisCols.length === 0 || rows.length === 0) {
    return (
      <div className="ia-empty">No numeric columns to analyse for this sheet.</div>
    );
  }

  // ── Static bar chart ────────────────────────────────────────────────────────
  if (!isTs) {
    const labels = rows.map((r) =>
      frozenCol ? stringValue(r[frozenCol]) : String(Object.values(r)[0] ?? '')
    );
    const values = rows.map((r) => numberValue(r[activeCol] as number | string | undefined));
    // Detect unit from column name
    const unit = activeCol.toLowerCase().includes('cost') ? '$/MWh'
      : activeCol.toLowerCase().includes('_mw') || activeCol === 'p_nom' ? 'MW'
      : activeCol.toLowerCase().includes('efficiency') ? ''
      : '';

    return (
      <div className="ia-panel">
        <div className="ia-toolbar">
          <label className="ia-col-label">Column</label>
          <select
            className="ia-col-select"
            value={activeCol}
            onChange={(e) => setSelectedCol(e.target.value)}
          >
            {analysisCols.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <span className="ia-summary">
            {rows.length} items · max {Math.max(...values).toLocaleString(undefined, { maximumFractionDigits: 2 })} {unit}
          </span>
        </div>
        <div className="ia-chart-wrap">
          <HorizontalBarChart labels={labels} values={values} unit={unit} />
        </div>
      </div>
    );
  }

  // ── TS line chart ───────────────────────────────────────────────────────────
  // Show ALL columns overlaid (up to 10) on the same chart, highlight selected
  const displayCols = analysisCols.slice(0, 10);
  const xLabels = rows.map((r) =>
    frozenCol ? stringValue(r[frozenCol]) : String(Object.values(r)[0] ?? '')
  );
  const series = displayCols.map((col, i) => ({
    key: col,
    values: rows.map((r) => numVal(r[col])),
    color: col === activeCol ? '#2563eb' : LINE_COLORS[i % LINE_COLORS.length],
  }));
  // Put active col last so it renders on top
  const sortedSeries = [
    ...series.filter((s) => s.key !== activeCol),
    ...series.filter((s) => s.key === activeCol),
  ];

  return (
    <div className="ia-panel">
      <div className="ia-toolbar">
        <label className="ia-col-label">Highlight</label>
        <select
          className="ia-col-select"
          value={activeCol}
          onChange={(e) => setSelectedCol(e.target.value)}
        >
          {analysisCols.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <span className="ia-summary">
          {rows.length} snapshots · {displayCols.length} series
          {analysisCols.length > 10 && ` (showing first 10 of ${analysisCols.length})`}
        </span>
      </div>
      <div className="ia-chart-wrap">
        <LineChart xLabels={xLabels} series={sortedSeries} />
      </div>
      <Legend items={displayCols.map((col, i) => ({ key: col, color: LINE_COLORS[i % LINE_COLORS.length] }))} />
    </div>
  );
}
