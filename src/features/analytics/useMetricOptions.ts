import { AnalyticsFocus, MetricOption, RunResults, TimeSeriesRow, TimeSeriesSeries, WorkbookModel } from '../../shared/types';
import { carrierColor, hashColor, numberValue } from '../../shared/utils/helpers';
import { buildRowsFromGeneratorDetails, buildSystemLoadRows, normalizeSeriesPoint } from '../../shared/utils/analytics';

export function useMetricOptions(
  results: RunResults | null,
  _model: WorkbookModel,
  analyticsFocus: AnalyticsFocus,
  selectedAssetKeys: string[] = [],
): MetricOption[] {
  // ── Derived series ──────────────────────────────────────────────────────────

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

  const buildSingleAssetOptions = (focus: AnalyticsFocus): MetricOption[] =>
    !results
      ? []
      : focus.type === 'generator'
        ? [
            { key: 'output', label: 'Output', unit: 'MW', rows: results.assetDetails.generators[focus.key]?.outputSeries.map((p) => ({ label: p.label, timestamp: p.timestamp, output: p.output })) || [], series: [{ key: 'output', label: 'Output MW', color: carrierColor(results.assetDetails.generators[focus.key]?.carrier || 'Other') }], reducer: 'mean', allowDonut: false },
            { key: 'available', label: 'Available output', unit: 'MW', rows: results.assetDetails.generators[focus.key]?.availableSeries.map((p) => ({ label: p.label, timestamp: p.timestamp, available: p.available })) || [], series: [{ key: 'available', label: 'Available MW', color: '#0f766e' }], reducer: 'mean', allowDonut: false },
            { key: 'curtailment', label: 'Curtailment', unit: 'MW', rows: results.assetDetails.generators[focus.key]?.curtailmentSeries.map((p) => ({ label: p.label, timestamp: p.timestamp, curtailment: p.curtailment })) || [], series: [{ key: 'curtailment', label: 'Curtailment MW', color: '#f59e0b' }], reducer: 'mean', allowDonut: false },
            { key: 'emissions', label: 'Emissions', unit: 'tCO2e', rows: results.assetDetails.generators[focus.key]?.emissionsSeries.map((p) => ({ label: p.label, timestamp: p.timestamp, emissions: p.emissions })) || [], series: [{ key: 'emissions', label: 'Emissions tCO2e', color: '#16a34a' }], reducer: 'sum', allowDonut: false },
          ]
        : focus.type === 'bus'
          ? [
              { key: 'load', label: 'Load', unit: 'MW', rows: results.assetDetails.buses[focus.key]?.netSeries.map((p) => ({ label: p.label, timestamp: p.timestamp, load: p.load })) || [], series: [{ key: 'load', label: 'Load MW', color: '#f97316' }], reducer: 'mean', allowDonut: false },
              { key: 'generation', label: 'Generation', unit: 'MW', rows: results.assetDetails.buses[focus.key]?.netSeries.map((p) => ({ label: p.label, timestamp: p.timestamp, generation: p.generation })) || [], series: [{ key: 'generation', label: 'Generation MW', color: '#2563eb' }], reducer: 'mean', allowDonut: false },
              { key: 'smp', label: 'SMP', unit: '$/MWh', rows: results.assetDetails.buses[focus.key]?.netSeries.map((p) => ({ label: p.label, timestamp: p.timestamp, smp: p.smp })) || [], series: [{ key: 'smp', label: 'SMP $/MWh', color: '#111827' }], reducer: 'mean', allowDonut: false },
              { key: 'emissions', label: 'Emissions', unit: 'tCO2e', rows: results.assetDetails.buses[focus.key]?.netSeries.map((p) => ({ label: p.label, timestamp: p.timestamp, emissions: p.emissions })) || [], series: [{ key: 'emissions', label: 'Emissions tCO2e', color: '#16a34a' }], reducer: 'sum', allowDonut: false },
              ...(results.assetDetails.buses[focus.key]?.hasVoltageMagnitude ? [{ key: 'v_mag_pu', label: 'Voltage magnitude', unit: 'p.u.', rows: results.assetDetails.buses[focus.key]?.netSeries.map((p) => ({ label: p.label, timestamp: p.timestamp, v_mag_pu: p.v_mag_pu })) || [], series: [{ key: 'v_mag_pu', label: 'Voltage p.u.', color: '#7c3aed' }], reducer: 'mean' as const, allowDonut: false }] : []),
              ...(results.assetDetails.buses[focus.key]?.hasVoltageAngle ? [{ key: 'v_ang', label: 'Voltage angle', unit: 'deg/rad', rows: results.assetDetails.buses[focus.key]?.netSeries.map((p) => ({ label: p.label, timestamp: p.timestamp, v_ang: p.v_ang })) || [], series: [{ key: 'v_ang', label: 'Voltage angle', color: '#8b5cf6' }], reducer: 'mean' as const, allowDonut: false }] : []),
            ]
          : focus.type === 'storageUnit'
            ? [
                { key: 'dispatch', label: 'Dispatch', unit: 'MW', rows: results.assetDetails.storageUnits[focus.key]?.dispatchSeries.map((p) => ({ label: p.label, timestamp: p.timestamp, dispatch: p.dispatch })) || [], series: [{ key: 'dispatch', label: 'Dispatch MW', color: '#2563eb' }], reducer: 'mean', allowDonut: false },
                { key: 'storage_power', label: 'Storage power', unit: 'MW', rows: results.assetDetails.storageUnits[focus.key]?.chargeSeries.map((p, i) => ({ label: p.label, timestamp: p.timestamp, charge: p.charge, discharge: results.assetDetails.storageUnits[focus.key]?.dischargeSeries[i]?.discharge || 0 })) || [], series: [{ key: 'charge', label: 'Charge MW', color: '#0ea5e9' }, { key: 'discharge', label: 'Discharge MW', color: '#f97316' }], reducer: 'mean', allowDonut: true },
                { key: 'state', label: 'State of charge', unit: 'MWh', rows: results.assetDetails.storageUnits[focus.key]?.stateSeries.map((p) => ({ label: p.label, timestamp: p.timestamp, state: p.state })) || [], series: [{ key: 'state', label: 'State MWh', color: '#14b8a6' }], reducer: 'mean', allowDonut: false },
              ]
            : focus.type === 'store'
              ? [
                  { key: 'energy', label: 'Energy', unit: 'MWh', rows: results.assetDetails.stores[focus.key]?.energySeries.map((p) => ({ label: p.label, timestamp: p.timestamp, energy: p.energy })) || [], series: [{ key: 'energy', label: 'Energy MWh', color: '#7c3aed' }], reducer: 'mean', allowDonut: false },
                  { key: 'power', label: 'Power', unit: 'MW', rows: results.assetDetails.stores[focus.key]?.powerSeries.map((p) => ({ label: p.label, timestamp: p.timestamp, power: p.power })) || [], series: [{ key: 'power', label: 'Power MW', color: '#6d28d9' }], reducer: 'mean', allowDonut: false },
                ]
              : focus.type === 'branch'
                ? [
                    { key: 'terminal_flows', label: 'Terminal flows', unit: 'MW', rows: results.assetDetails.branches[focus.key]?.flowSeries.map((p) => ({ label: p.label, timestamp: p.timestamp, p0: p.p0, p1: p.p1 })) || [], series: [{ key: 'p0', label: 'P0 MW', color: '#2563eb' }, { key: 'p1', label: 'P1 MW', color: '#1d4ed8' }], reducer: 'mean', allowDonut: true },
                    { key: 'loading', label: 'Loading', unit: '%', rows: results.assetDetails.branches[focus.key]?.loadingSeries.map((p) => ({ label: p.label, timestamp: p.timestamp, loading: p.loading })) || [], series: [{ key: 'loading', label: 'Loading %', color: '#ea580c' }], reducer: 'mean', allowDonut: false },
                    { key: 'losses', label: 'Losses', unit: 'MW', rows: results.assetDetails.branches[focus.key]?.lossesSeries.map((p) => ({ label: p.label, timestamp: p.timestamp, losses: p.losses })) || [], series: [{ key: 'losses', label: 'Losses MW', color: '#dc2626' }], reducer: 'mean', allowDonut: false },
                  ]
                : [
                    { key: 'dispatch', label: 'Dispatch by carrier', unit: 'MW', rows: systemDispatchRows, series: systemDispatchSeries, reducer: 'mean', allowDonut: true },
                    { key: 'dispatch_by_generator', label: 'Dispatch by generator', unit: 'MW', rows: systemGeneratorDispatchRows, series: systemGeneratorDispatchSeries, reducer: 'mean', allowDonut: true },
                    { key: 'load', label: 'Total load', unit: 'MW', rows: systemLoadRows, series: [{ key: 'load', label: 'Load MW', color: '#f97316' }], reducer: 'mean', allowDonut: false },
                    { key: 'system_price', label: 'System marginal price', unit: '$/MWh', rows: systemPriceRows, series: [{ key: 'price', label: 'Price $/MWh', color: '#111827' }], reducer: 'mean', allowDonut: false },
                    { key: 'system_emissions', label: 'System emissions', unit: 'tCO2e', rows: systemEmissionsRows, series: [{ key: 'emissions', label: 'Emissions tCO2e', color: '#16a34a' }], reducer: 'sum', allowDonut: false },
                    { key: 'storage_power', label: 'Storage power', unit: 'MW', rows: storageRows, series: [{ key: 'charge', label: 'Charge MW', color: '#0ea5e9' }, { key: 'discharge', label: 'Discharge MW', color: '#f97316' }], reducer: 'mean', allowDonut: true },
                    { key: 'storage_state', label: 'Storage state of charge', unit: 'MWh', rows: storageRows, series: [{ key: 'state', label: 'State of charge', color: '#14b8a6' }], reducer: 'mean', allowDonut: false },
                  ];

  const mergeMetricOptions = (assetKeys: string[], focusType: Exclude<AnalyticsFocus['type'], 'system'>): MetricOption[] => {
    const byMetric = new Map<string, MetricOption>();

    assetKeys.forEach((assetKey) => {
      const focus = { type: focusType, key: assetKey } as AnalyticsFocus;
      buildSingleAssetOptions(focus).forEach((option) => {
        const merged = byMetric.get(option.key) || {
          key: option.key,
          label: option.label,
          unit: option.unit,
          rows: [] as TimeSeriesRow[],
          series: [] as TimeSeriesSeries[],
          reducer: option.reducer,
          allowDonut: true,
        };
        const rowMap = new Map(
          merged.rows.map((row) => [`${row.timestamp ?? ''}|${row.label}`, row]),
        );

        option.series.forEach((series) => {
          const seriesKey = option.series.length === 1
            ? assetKey
            : `${assetKey}__${series.key}`;
          const seriesLabel = option.series.length === 1
            ? assetKey
            : `${assetKey} ${series.label}`;
          if (!merged.series.some((item) => item.key === seriesKey)) {
            merged.series.push({
              key: seriesKey,
              label: seriesLabel,
              color: hashColor(`${focusType}:${assetKey}:${series.key}`),
            });
          }

          option.rows.forEach((row) => {
            const rowId = `${row.timestamp ?? ''}|${row.label}`;
            const target = rowMap.get(rowId) || { label: row.label, timestamp: row.timestamp };
            target[seriesKey] = row[series.key];
            rowMap.set(rowId, target);
          });
        });

        merged.rows = Array.from(rowMap.values());
        byMetric.set(option.key, merged);
      });
    });

    return Array.from(byMetric.values());
  };

  if (!results) return [];
  if (
    analyticsFocus.type !== 'system'
    && (selectedAssetKeys.length > 1 || analyticsFocus.key === '__all__')
  ) {
    return mergeMetricOptions(selectedAssetKeys, analyticsFocus.type);
  }
  return buildSingleAssetOptions(analyticsFocus);
}
