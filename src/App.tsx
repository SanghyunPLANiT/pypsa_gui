import React, { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';

import {
  AnalyticsFocus,
  BrowserFileHandle,
  ChartSectionConfig,
  CustomConstraint,
  GridRow,
  MetricOption,
  Primitive,
  RunHistoryEntry,
  RunResults,
  SheetName,
  TimeSeriesRow,
  TimeSeriesSeries,
  TsSheetName,
  WorkbookModel,
  WorkspaceTab,
} from './types';
import { API_BASE, DEFAULT_CONSTRAINTS, DEFAULT_SHEET_ROWS, EMPTY_METRIC_KEY } from './constants';
import { createEmptyWorkbook, exportWorkbook, loadSampleWorkbook, parseWorkbook, workbookToArrayBuffer, parseCsvToGridRows } from './shared/utils/workbook';
import { exportFullResults } from './shared/utils/exportResults';
import { getBounds, getBusIndex, carrierColor, hashColor, numberValue, snapshotMaxFromWorkbook } from './shared/utils/helpers';
import { buildRowsFromGeneratorDetails, buildSystemLoadRows, normalizeSeriesPoint } from './shared/utils/analytics';
import { RunDialog } from './features/run/RunDialog';
import { Sidebar } from './layout/Sidebar';
import { MapPane } from './features/map/MapPane';
import { TablesPane } from './features/input/TablesPane';
import { ValidationPane } from './features/validation/ValidationPane';
import { AnalyticsPane, EmptyAnalytics } from './features/analytics/AnalyticsPane';
import { ToastProvider, useToast } from './shared/components/Toast';

function AppInner() {
  const { showToast } = useToast();
  const [model, setModel] = useState<WorkbookModel>(() => createEmptyWorkbook());
  const [tab, setTab] = useState<WorkspaceTab>('Map');
  const [results, setResults] = useState<RunResults | null>(null);
  const [runStatus, setRunStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [maxSnapshots, setMaxSnapshots] = useState<number>(1);
  const [snapshotStart, setSnapshotStart] = useState(0);
  const [snapshotEnd, setSnapshotEnd] = useState(24);
  const [snapshotWeight, setSnapshotWeight] = useState(1);
  const [constraints, setConstraints] = useState<CustomConstraint[]>(DEFAULT_CONSTRAINTS);
  const [carbonPrice, setCarbonPrice] = useState<number>(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [analyticsFocus, setAnalyticsFocus] = useState<AnalyticsFocus>({ type: 'system' });
  const [chartSections, setChartSections] = useState<ChartSectionConfig[]>([]);
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [runHistory, setRunHistory] = useState<RunHistoryEntry[]>([]);
  const [runCount, setRunCount] = useState(0);
  const MAX_UNPINNED = 5;
  const [validateResult, setValidateResult] = useState<{
    valid: boolean;
    errors: string[];
    warnings: string[];
    notes: string[];
    snapshotCount: number;
    networkSummary: Record<string, number>;
  } | null>(null);
  const [status, setStatus] = useState('Ready. Open a workbook or try the demo model.');
  const [fileHandle, setFileHandle] = useState<BrowserFileHandle | null>(null);
  const [filename, setFilename] = useState('ragnarok_case.xlsx');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    loadSampleWorkbook().then((sampleModel) => {
      if (!sampleModel) return;
      const snapshotMax = snapshotMaxFromWorkbook(sampleModel.snapshots);
      setMaxSnapshots(snapshotMax);
      setSnapshotEnd(Math.min(24, snapshotMax));
      setModel(sampleModel);
    }).catch(() => null);
  }, []);

  const bounds = useMemo(() => getBounds(model), [model.buses]);  // eslint-disable-line react-hooks/exhaustive-deps
  const busIndex = useMemo(() => getBusIndex(model), [model.buses]);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!results) { setAnalyticsFocus({ type: 'system' }); return; }
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
    setSnapshotEnd(Math.min(24, snapshotMax));
    setSnapshotStart(0);
    setModel(nextModel);
    setResults(null);
    setRunStatus('idle');
    setChartSections([]);
    setValidateResult(null);
    setAnalyticsFocus({ type: 'system' });
    if (name) setFilename(name);
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const nextModel = await parseWorkbook(file);
      resetForNewModel(nextModel, file.name || 'ragnarok_case.xlsx');
      setFileHandle(null);
      setStatus(`Imported workbook: ${file.name}. Analytics will populate after the next run.`);
      showToast(`Opened ${file.name}`, 'success');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Workbook import failed.';
      setStatus(msg);
      showToast(msg, 'error');
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
      resetForNewModel(nextModel, file.name || 'ragnarok_case.xlsx');
      setFileHandle(handle);
      setStatus(`Opened workbook: ${file.name}`);
      showToast(`Opened ${file.name}`, 'success');
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        setStatus('Workbook open failed.');
        showToast('Workbook open failed.', 'error');
      }
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

  const addColumn = (sheet: SheetName, col: string, defaultValue: string | number | boolean) => {
    setModel((current) => {
      const nextRows = current[sheet].map((row) =>
        col in row ? row : { ...row, [col]: defaultValue },
      );
      return { ...current, [sheet]: nextRows };
    });
    setStatus(`Added column "${col}" to ${sheet}.`);
  };

  const handleRestoreRun = (entry: RunHistoryEntry) => {
    setResults(entry.results);
    setTab('Analytics');
    setAnalyticsFocus({ type: 'system' });
    showToast(`Viewing ${entry.label}`, 'success');
  };

  const handleRenameHistoryEntry = (id: string, label: string) => {
    setRunHistory((h) => h.map((e) => (e.id === id ? { ...e, label } : e)));
  };

  const handlePinHistoryEntry = (id: string, pinned: boolean) => {
    setRunHistory((h) => {
      const updated = h.map((e) => (e.id === id ? { ...e, pinned } : e));
      const pinnedEntries = updated.filter((e) => e.pinned);
      const unpinnedEntries = updated.filter((e) => !e.pinned).slice(0, MAX_UNPINNED);
      return [...pinnedEntries, ...unpinnedEntries];
    });
  };

  const handleDeleteHistoryEntry = (id: string) => {
    setRunHistory((h) => h.filter((e) => e.id !== id));
  };

  const handleImportTsSheet = (sheet: TsSheetName, rows: GridRow[]) => {
    setModel((current) => ({ ...current, [sheet]: rows }));
    if (rows.length > 0) {
      showToast(`Imported ${rows.length} rows into ${sheet}`, 'success');
      setStatus(`Imported ${rows.length} rows into ${sheet}.`);
    } else {
      showToast(`Cleared ${sheet}`, 'success');
      setStatus(`Cleared ${sheet}.`);
    }
  };

  const saveAsWorkbook = async () => {
    const saver = (window as any).showSaveFilePicker;
    const suggestedName = filename || 'ragnarok_case.xlsx';
    if (!saver) {
      const requested = window.prompt('Save workbook as', suggestedName) || suggestedName;
      exportWorkbook(model, requested);
      setFilename(requested);
      setStatus(`Saved workbook as ${requested}.`);
      showToast(`Saved as ${requested}`, 'success');
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
      showToast(`Saved as ${handle.name || suggestedName}`, 'success');
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        setStatus('Save As failed.');
        showToast('Save failed.', 'error');
      }
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

  const handleRunModel = async () => {
    const snapshotCount = snapshotEnd - snapshotStart;
    const runOptions = {
      model,
      scenario: { constraints: constraints.filter((c) => c.enabled), carbonPrice },
      options: { snapshotCount, snapshotStart, snapshotWeight },
    };

    setRunDialogOpen(false);

    if (dryRun) {
      setStatus('Validating model structure...');
      try {
        const response = await fetch(`${API_BASE}/api/validate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(runOptions),
        });
        const result = await response.json();
        setValidateResult(result);
        setTab('Validation');
        const vMsg = result.valid ? 'Validation passed.' : `Validation failed: ${result.errors.length} error(s).`;
        setStatus(vMsg);
        showToast(vMsg, result.valid ? 'success' : 'error');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Validation request failed.');
      }
      return;
    }

    setRunStatus('running');
    setStatus(`Running — ${snapshotCount} snapshots…`);
    try {
      const response = await fetch(`${API_BASE}/api/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(runOptions),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Backend run failed with status ${response.status}.`);
      }
      const nextResults = (await response.json()) as RunResults;
      setResults(nextResults);
      setRunStatus('done');
      setAnalyticsFocus({ type: 'system' });
      const doneMsg = `Completed — ${nextResults.runMeta.snapshotCount} snapshots, ${nextResults.runMeta.modeledHours} h.`;
      setStatus(doneMsg);
      showToast(doneMsg, 'success');
      setRunCount((n) => {
        const next = n + 1;
        const entry: RunHistoryEntry = {
          id: Date.now().toString(),
          label: `Run ${next}`,
          savedAt: new Date().toISOString(),
          filename,
          carbonPrice,
          snapshotStart,
          snapshotEnd,
          snapshotWeight,
          activeConstraints: constraints.filter((c) => c.enabled),
          componentCounts: {
            generators: model.generators.length,
            buses: model.buses.length,
            lines: model.lines.length,
            links: model.links.length,
            storageUnits: model.storage_units.length,
          },
          pinned: false,
          results: nextResults,
        };
        setRunHistory((hist) => {
          const withNew = [entry, ...hist];
          const pinned = withNew.filter((e) => e.pinned);
          const unpinned = withNew.filter((e) => !e.pinned).slice(0, MAX_UNPINNED);
          return [...pinned, ...unpinned];
        });
        return next;
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Backend PyPSA run failed.';
      setRunStatus('error');
      setStatus(msg);
      showToast(msg, 'error');
    }
  };

  // ── Metric series derived data ────────────────────────────────────────────

  const rawSystemDispatchRows: TimeSeriesRow[] = (results?.dispatchSeries || []).map(normalizeSeriesPoint);
  const systemDispatchRows: TimeSeriesRow[] =
    rawSystemDispatchRows.some((row) =>
      Object.keys(row).some((key) => !['label', 'timestamp', 'total'].includes(key) && Math.abs(numberValue(row[key] as string | number | undefined)) > 1e-6),
    )
      ? rawSystemDispatchRows
      : buildRowsFromGeneratorDetails(results?.assetDetails.generators || {}, 'carrier');
  const inferredDispatchKeys = Array.from(
    new Set(systemDispatchRows.flatMap((row) => Object.keys(row).filter((key) => !['label', 'timestamp', 'total'].includes(key)))),
  );
  const dispatchKeys =
    inferredDispatchKeys.length > 0
      ? inferredDispatchKeys
      : (results?.carrierMix || []).map((item) => item.label).filter(Boolean);
  const systemDispatchSeries: TimeSeriesSeries[] = dispatchKeys.map((key) => ({ key, label: key, color: carrierColor(key) }));

  const rawSystemGeneratorDispatchRows: TimeSeriesRow[] = (results?.generatorDispatchSeries || []).map(normalizeSeriesPoint);
  const systemGeneratorDispatchRows: TimeSeriesRow[] =
    rawSystemGeneratorDispatchRows.some((row) =>
      Object.keys(row).some((key) => !['label', 'timestamp', 'total'].includes(key) && Math.abs(numberValue(row[key] as string | number | undefined)) > 1e-6),
    )
      ? rawSystemGeneratorDispatchRows
      : buildRowsFromGeneratorDetails(results?.assetDetails.generators || {}, 'generator');
  const generatorDispatchKeys = Array.from(
    new Set(systemGeneratorDispatchRows.flatMap((row) => Object.keys(row).filter((key) => !['label', 'timestamp', 'total'].includes(key)))),
  );
  const systemGeneratorDispatchSeries: TimeSeriesSeries[] = generatorDispatchKeys.map((key) => ({ key, label: key, color: hashColor(key) }));

  const systemPriceRows: TimeSeriesRow[] = (results?.systemPriceSeries || []).map((point) => ({ label: point.label, timestamp: point.timestamp, price: point.value }));
  const systemEmissionsRows: TimeSeriesRow[] = (results?.systemEmissionsSeries || []).map((point) => ({ label: point.label, timestamp: point.timestamp, emissions: point.value }));
  const storageRows: TimeSeriesRow[] = (results?.storageSeries || []).map((point) => ({ label: point.label, timestamp: point.timestamp, charge: point.charge, discharge: point.discharge, state: point.state }));
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

  return (
    <div className="studio-shell">
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls" hidden onChange={handleImport} />

      {/* ── Top bar ── */}
      <header className="topbar">
        <div className="topbar-left">
          <span className="topbar-brand">Ragnarok</span>
          <div className="topbar-divider" />
          <button className="run-button" onClick={() => setRunDialogOpen(true)}>▶ Run</button>
          <button className="tb-btn" onClick={handleOpenWorkbook}>Open</button>
          <div className="topbar-divider" />
          <div className="case-chip">
            <span>Workbook</span>
            <strong>{filename}</strong>
          </div>
          {results && (
            <div className="case-chip">
              <span>Last run</span>
              <strong>{results.runMeta.snapshotCount} snaps · {results.runMeta.snapshotWeight}h res</strong>
              <span className={`sc-status sc-status--${runStatus}`}>{runStatus === 'running' ? 'Running…' : runStatus === 'error' ? 'Error' : 'Done'}</span>
            </div>
          )}
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

      {/* ── Sidebar + Main ── */}
      <div className="workspace-body">
        <aside className={`app-sidebar${sidebarOpen ? '' : ' app-sidebar--collapsed'}`}>
          <button className="sidebar-toggle" onClick={() => setSidebarOpen((o) => !o)} title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}>
            {sidebarOpen ? '◂' : '▸'}
          </button>
          {sidebarOpen && (
            <Sidebar
              model={model}
              results={results}
              constraints={constraints}
              onConstraintsChange={setConstraints}
              onOpen={handleOpenWorkbook}
              onSave={saveWorkbook}
              onSaveAs={saveAsWorkbook}
              onDemo={() => {
                loadSampleWorkbook()
                  .then((m) => resetForNewModel(m, 'sample_model.xlsx'))
                  .catch(() => setStatus('Could not reload sample model.'));
              }}
              onExport={() => {
                if (!results) return;
                exportFullResults(model, results, filename.replace(/\.xlsx$/i, ''));
                showToast('Full model exported to Excel', 'success');
              }}
              runHistory={runHistory}
              onRestoreRun={handleRestoreRun}
              onRenameHistoryEntry={handleRenameHistoryEntry}
              onPinHistoryEntry={handlePinHistoryEntry}
              onDeleteHistoryEntry={handleDeleteHistoryEntry}
            />
          )}
        </aside>

        <div className="workspace-main">
          {tab === 'Map' && (
            <MapPane model={model} bounds={bounds} busIndex={busIndex} />
          )}

          {tab === 'Tables' && (
            <div className="pane tables-pane">
              <TablesPane
                model={model}
                onUpdate={updateRowValue}
                onAddRow={addRow}
                onDeleteRow={deleteRow}
                onAddColumn={addColumn}
                onImportTsSheet={handleImportTsSheet}
              />
            </div>
          )}

          {tab === 'Validation' && (
            <ValidationPane
              validateResult={validateResult}
              onValidate={() => { setDryRun(true); setRunDialogOpen(true); }}
              onRun={() => { setDryRun(false); setRunDialogOpen(true); }}
            />
          )}

          {tab === 'Analytics' && (
            !results ? (
              <EmptyAnalytics />
            ) : (
              <AnalyticsPane
                results={results}
                filename={filename}
                model={model}
                bounds={bounds}
                busIndex={busIndex}
                analyticsFocus={analyticsFocus}
                setAnalyticsFocus={setAnalyticsFocus}
                chartSections={chartSections}
                setChartSections={setChartSections}
                metricOptions={metricOptions}
                dispatchRows={systemDispatchRows}
                dispatchSeries={systemDispatchSeries}
                systemLoadRows={systemLoadRows}
                systemPriceRows={systemPriceRows}
                storageRows={storageRows}
                runHistory={runHistory}
              />
            )
          )}
        </div>
      </div>

      {/* ── Run dialog ── */}
      <RunDialog
        open={runDialogOpen}
        onClose={() => setRunDialogOpen(false)}
        maxSnapshots={maxSnapshots}
        snapshotStart={snapshotStart}
        snapshotEnd={snapshotEnd}
        snapshotWeight={snapshotWeight}
        carbonPrice={carbonPrice}
        dryRun={dryRun}
        snapshots={model.snapshots}
        onSnapshotStartChange={setSnapshotStart}
        onSnapshotEndChange={setSnapshotEnd}
        onSnapshotWeightChange={setSnapshotWeight}
        onCarbonPriceChange={setCarbonPrice}
        onDryRunChange={setDryRun}
        onRun={handleRunModel}
      />
    </div>
  );
}

function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}

export default App;
