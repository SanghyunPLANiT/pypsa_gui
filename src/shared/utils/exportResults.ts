import * as XLSX from 'xlsx';
import { RunResults, WorkbookModel } from '../../types';
import { buildWorkbook } from './workbook';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeAppendSheet(wb: XLSX.WorkBook) {
  return (name: string, data: Record<string, unknown>[]) => {
    if (!data || data.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
}

function pivotSeries(
  rows: Array<{ timestamp?: string; label?: string; values?: Record<string, number>; total?: number }>,
): Record<string, unknown>[] {
  return rows.map((row) => {
    const { timestamp, label, values = {}, total } = row;
    return { timestamp: timestamp ?? label, ...values, ...(total !== undefined ? { total } : {}) };
  });
}

// ── main export ───────────────────────────────────────────────────────────────

/**
 * Export the entire model (all input sheets + all result output sheets) to
 * a single .xlsx file.
 */
export function exportFullResults(
  model: WorkbookModel,
  results: RunResults,
  baseFilename = 'ragnarok',
): void {
  // Start from the input workbook so all model sheets are already in.
  const wb = buildWorkbook(model);
  const appendSheet = makeAppendSheet(wb);

  // ── Output sheets ──────────────────────────────────────────────────────────

  appendSheet('OUT_Summary', results.summary as unknown as Record<string, unknown>[]);

  appendSheet('OUT_Dispatch', pivotSeries(results.dispatchSeries));
  appendSheet('OUT_GenDispatch', pivotSeries(results.generatorDispatchSeries));

  appendSheet(
    'OUT_SysPrice',
    results.systemPriceSeries.map((p) => ({ timestamp: p.timestamp ?? p.label, price_per_MWh: p.value })),
  );
  appendSheet(
    'OUT_Emissions',
    results.systemEmissionsSeries.map((p) => ({ timestamp: p.timestamp ?? p.label, emissions_t: p.value })),
  );

  appendSheet(
    'OUT_Storage',
    results.storageSeries.map((s) => ({
      timestamp: s.timestamp ?? s.label,
      charge_MW: s.charge,
      discharge_MW: s.discharge,
      state_MWh: s.state,
    })),
  );

  appendSheet(
    'OUT_CarrierMix',
    results.carrierMix.map(({ label, value }) => ({ carrier: label, energy_MWh: value })),
  );
  appendSheet(
    'OUT_CostBreakdown',
    results.costBreakdown.map(({ label, value }) => ({ category: label, cost: value })),
  );
  appendSheet(
    'OUT_NodalBalance',
    results.nodalBalance.map((n) => ({ bus: n.label, load_MW: n.load, generation_MW: n.generation })),
  );
  appendSheet(
    'OUT_LineLoading',
    results.lineLoading.map((l) => ({ branch: l.label, loading_pct: l.value })),
  );

  // ── Per-asset detail sheets ────────────────────────────────────────────────

  const genRows = Object.values(results.assetDetails.generators).flatMap((g) =>
    g.outputSeries.map((s) => ({
      generator: g.name,
      carrier: g.carrier,
      bus: g.bus,
      timestamp: s.timestamp,
      output_MW: s.output,
    })),
  );
  appendSheet('OUT_GenDetail', genRows);

  const storageRows = Object.values(results.assetDetails.storageUnits).flatMap((u) =>
    u.stateSeries.map((s) => ({
      unit: u.name,
      bus: u.bus,
      timestamp: s.timestamp,
      state_MWh: s.state,
    })),
  );
  appendSheet('OUT_StorageDetail', storageRows);

  const branchRows = Object.values(results.assetDetails.branches).flatMap((b) =>
    b.flowSeries.map((s) => ({
      branch: b.name,
      type: b.component,
      bus0: b.bus0,
      bus1: b.bus1,
      timestamp: s.timestamp,
      p0_MW: s.p0,
      p1_MW: s.p1,
    })),
  );
  appendSheet('OUT_BranchFlow', branchRows);

  const ts = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
  XLSX.writeFile(wb, `${baseFilename}_${ts}.xlsx`);
}
