import React, { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';

import {
  AnalyticsFocus,
  BrowserFileHandle,
  ChartSectionConfig,
  CustomConstraint,
  MetricOption,
  Primitive,
  RunResults,
  SheetName,
  TimeSeriesRow,
  TimeSeriesSeries,
  WorkbookModel,
  WorkspaceTab,
} from './types';
import { API_BASE, DEFAULT_CONSTRAINTS, DEFAULT_SHEET_ROWS, EMPTY_METRIC_KEY } from './constants';
import { createEmptyWorkbook, exportWorkbook, loadSampleWorkbook, parseWorkbook, workbookToArrayBuffer } from './utils/workbook';
import { exportFullResults } from './utils/exportResults';
import { getBounds, getBusIndex, carrierColor, hashColor, numberValue, snapshotMaxFromWorkbook } from './utils/helpers';
import { buildRowsFromGeneratorDetails, buildSystemLoadRows, normalizeSeriesPoint } from './utils/analytics';
import { DualRangeSlider } from './components/common/DualRangeSlider';
import { SidebarGroup } from './components/layout/SidebarGroup';
import { GlobalConstraintsSection } from './components/constraints/GlobalConstraintsSection';
import { MapPane } from './components/panes/MapPane';
import { TablesPane } from './components/panes/TablesPane';
import { ValidationPane } from './components/panes/ValidationPane';
import { AnalyticsPane, EmptyAnalytics } from './components/panes/AnalyticsPane';
import { ToastProvider, useToast } from './components/common/Toast';

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
  const [sidebarOpen, setSidebarOpen] = useState(true);
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
  const [status, setStatus] = useState('Ready. Open a workbook or try the demo model.');
  const [fileHandle, setFileHandle] = useState<BrowserFileHandle | null>(null);
  const [filename, setFilename] = useState('pypsa_studio_case.xlsx');
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
      resetForNewModel(nextModel, file.name || 'pypsa_studio_case.xlsx');
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
      resetForNewModel(nextModel, file.name || 'pypsa_studio_case.xlsx');
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

  const saveAsWorkbook = async () => {
    const saver = (window as any).showSaveFilePicker;
    const suggestedName = filename || 'pypsa_studio_case.xlsx';
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
      scenario: { constraints: constraints.filter((c) => c.enabled) },
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
      setTab('Analytics');
      const doneMsg = `Completed — ${nextResults.runMeta.snapshotCount} snapshots, ${nextResults.runMeta.modeledHours} h.`;
      setStatus(doneMsg);
      showToast(doneMsg, 'success');
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
          <span className="topbar-brand">PyPSA Studio</span>
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
            <>
              <SidebarGroup title="File" icon="📁" defaultOpen>
                <div className="sg-btn-grid">
                  <button className="tb-btn sg-full" onClick={handleOpenWorkbook}>Open</button>
                  <button className="tb-btn sg-full" onClick={saveWorkbook}>Save</button>
                  <button className="tb-btn sg-full" onClick={saveAsWorkbook}>Save As</button>
                  <button className="tb-btn tb-btn--muted sg-full" onClick={() => {
                    loadSampleWorkbook()
                      .then((m) => resetForNewModel(m, 'sample_model.xlsx'))
                      .catch(() => setStatus('Could not reload sample model.'));
                  }}>Demo</button>
                  <button
                    className="tb-btn sg-full"
                    disabled={!results}
                    title={results ? 'Export all inputs and outputs to Excel' : 'Run the model first to export results'}
                    onClick={() => {
                      if (!results) return;
                      exportFullResults(model, results, filename.replace(/\.xlsx$/i, ''));
                      showToast('Full model exported to Excel', 'success');
                    }}
                  >
                    Export
                  </button>
                </div>
              </SidebarGroup>

              <SidebarGroup
                title="Constraints" icon="⛓"
                badge={constraints.filter((c) => c.enabled).length > 0
                  ? <span className="sg-badge">{constraints.filter((c) => c.enabled).length}</span>
                  : undefined}
              >
                <GlobalConstraintsSection
                  constraints={constraints}
                  carriers={Array.from(new Set(model.carriers.map((c) => String(c.name ?? '')).filter(Boolean)))}
                  onChange={setConstraints}
                />
              </SidebarGroup>

              {results && (
                <SidebarGroup title="Results" icon="📊" defaultOpen>
                  <div className="sg-summary">
                    {results.summary.map((s) => (
                      <div key={s.label} className="sg-summary-item">
                        <span className="sg-summary-label">{s.label}</span>
                        <span className="sg-summary-value">{s.value}</span>
                        <span className="sg-summary-detail">{s.detail}</span>
                      </div>
                    ))}
                  </div>
                </SidebarGroup>
              )}
            </>
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
              />
            )
          )}
        </div>
      </div>

      {/* ── Run dialog ── */}
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
                    Simulation window — <strong>{snapshotEnd - snapshotStart} hourly steps</strong>
                    {' '}(step {snapshotStart} → {snapshotEnd} of {maxSnapshots})
                  </span>
                  <DualRangeSlider
                    min={0} max={maxSnapshots}
                    low={snapshotStart} high={snapshotEnd}
                    formatLabel={(v) => `${v}`}
                    onChange={(lo, hi) => { setSnapshotStart(lo); setSnapshotEnd(hi); }}
                  />
                </div>
                <div className="field" style={{ marginBottom: 8 }}>
                  {(() => {
                    const step = snapshotWeight;
                    const windowSize = snapshotEnd - snapshotStart;
                    const modeledSnapshots = Math.ceil(windowSize / step);
                    return (
                      <>
                        <span style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>
                          Time resolution — <strong>every {step}h</strong>
                          {' '}({modeledSnapshots} snapshots of {windowSize} hourly steps)
                        </span>
                        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                          {[1, 2, 3, 4, 6, 8, 12, 24].map((n) => (
                            <button
                              key={n}
                              className={`tb-btn${snapshotWeight === n ? '' : ' tb-btn--muted'}`}
                              style={{ minWidth: 40 }}
                              onClick={() => setSnapshotWeight(n)}
                            >
                              {n}h
                            </button>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                </div>
                <p className="status-text" style={{ marginBottom: 12 }}>
                  Resolution selects every Nth step — <code>snapshots[::N]</code> with{' '}
                  <code>snapshot_weightings = N</code>. Higher N = coarser resolution, faster solve.
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
              <button className="run-button" onClick={() => handleRunModel()}>
                {dryRun ? 'Validate' : 'Run model'}
              </button>
            </div>
          </div>
        </div>
      )}
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
