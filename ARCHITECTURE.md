# Ragnarok — Architecture Reference

> **Purpose:** This document is the single-file orientation guide for new contributors and AI
> sessions. Read it first. You should not need to grep across 60+ files to understand the
> codebase — everything essential is here. (~5-minute read)

---

## What this app does

Ragnarok is a browser-based GUI for building and running single-year PyPSA power-system models.
The user opens or edits an Excel workbook (one sheet per PyPSA component), configures run
parameters in a modal dialog, and the React frontend posts the workbook data to a local FastAPI
backend that constructs a `pypsa.Network`, solves it with HiGHS, and returns structured results.
Charts, maps, and tables then display the outputs without any round-trips to a remote server.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Mapping | react-leaflet / Leaflet |
| Charting | Recharts |
| Workbook I/O | SheetJS (xlsx) |
| Backend | Python 3.12+, FastAPI, Uvicorn |
| Power model | PyPSA |
| Solver | HiGHS (via PyPSA default) |
| Transport | REST JSON over `http://localhost:8000` |

---

## Repository layout

```
pypsa_gui/
├── backend/
│   ├── main.py                    ← FastAPI app, 4 endpoints
│   └── lib/
│       ├── config.py              ← loads system-defaults.yaml (max_snapshots etc.)
│       ├── constants.py           ← carrier → colour map used by both network and results
│       ├── models.py              ← RunPayload Pydantic model
│       ├── network/               ← build_network() — assembles pypsa.Network from payload
│       │   ├── __init__.py        ← public entry: build_network(), validate_model()
│       │   ├── buses.py           ← add_buses(), add_loads()
│       │   ├── generators.py      ← add_generators(), add_grid_imports_and_shedding()
│       │   ├── lines.py           ← add_lines(), add_links(), add_transformers()
│       │   ├── storage.py         ← add_storage_units(), add_stores()
│       │   ├── constraints.py     ← add_global_constraints()
│       │   ├── custom_constraints.py  ← carrier share / CO2 cap constraints
│       │   └── validators.py      ← structural pre-solve validation checks
│       ├── profiles/              ← time-series helpers
│       │   ├── __init__.py        ← snapshot_settings(), modeled_period_factor()
│       │   ├── snapshots.py       ← slice & weight snapshot index
│       │   ├── availability.py    ← attach p_max_pu / p_min_pu profiles
│       │   └── demand.py          ← attach loads-p_set profiles
│       ├── results/               ← extract results from solved network
│       │   ├── __init__.py        ← public entry: run_pypsa() → RunResults dict
│       │   ├── dispatch.py        ← carrier-level and generator-level dispatch series
│       │   ├── emissions.py       ← system + per-generator CO2 series
│       │   ├── expansion.py       ← capacity expansion delta (p_nom_opt − p_nom)
│       │   ├── market.py          ← merit order, CO2 shadow price
│       │   └── assets/            ← per-asset detail series (one file per component)
│       │       ├── generators.py
│       │       ├── buses.py
│       │       ├── storage_units.py
│       │       ├── stores.py
│       │       └── branches.py
│       └── utils/
│           ├── coerce.py          ← number(), text(), bool_value() — safe type coercion
│           ├── workbook.py        ← workbook_rows(), apply_scaled_static_attributes()
│           ├── series.py          ← weighted_sum() and pandas series helpers
│           └── annuity.py         ← capital-recovery factor for expansion cost annualisation
│
├── src/
│   ├── App.tsx                    ← Root component: all useState + event handlers + layout
│   ├── index.tsx                  ← ReactDOM.render entry point
│   ├── index.css                  ← All CSS (scoped by component prefix, see Conventions)
│   ├── constants/
│   │   ├── index.ts               ← API_BASE, DEFAULT_CONSTRAINTS, EMPTY_METRIC_KEY etc.
│   │   ├── sheets.ts              ← SHEETS and TS_SHEETS const arrays (source of truth)
│   │   ├── pypsa_attributes.ts    ← per-sheet column definitions for the Tables editor
│   │   └── pypsa_attributes.json  ← raw JSON backing pypsa_attributes.ts
│   ├── types/
│   │   ├── index.ts               ← All shared TypeScript types (RunResults, WorkbookModel…)
│   │   └── pypsa.ts               ← Lower-level PyPSA attribute type helpers
│   ├── utils/
│   │   ├── helpers.ts             ← getBounds, getBusIndex, carrierColor, hashColor,
│   │   │                            numberValue, snapshotMaxFromWorkbook
│   │   ├── workbook.ts            ← parseWorkbook, exportWorkbook, loadSampleWorkbook,
│   │   │                            createEmptyWorkbook, workbookToArrayBuffer
│   │   ├── analytics.ts           ← buildRowsFromGeneratorDetails, buildSystemLoadRows,
│   │   │                            normalizeSeriesPoint
│   │   ├── exportResults.ts       ← exportFullResults → multi-sheet Excel download
│   │   └── exportChart.ts         ← SVG/PNG chart export helpers
│   └── components/
│       ├── common/
│       │   ├── DualRangeSlider.tsx  ← dual-handle range slider (CSS prefix: dual-range-)
│       │   ├── RunDialog.tsx        ← floating run-config modal (CSS: modal-backdrop, modal-card)
│       │   ├── SummaryCards.tsx     ← KPI card row (CSS prefix: kpi-)
│       │   └── Toast.tsx            ← toast notification system (context + hook)
│       ├── layout/
│       │   ├── SidebarGroup.tsx     ← collapsible accordion section (CSS prefix: sg-)
│       │   └── Sidebar.tsx          ← sidebar content: File + Constraints + Results groups
│       ├── constraints/
│       │   └── GlobalConstraintsSection.tsx  ← constraint list editor
│       ├── map/
│       │   ├── FitToBounds.tsx      ← Leaflet FitBounds effect component
│       │   └── MapLegend.tsx        ← floating carrier colour legend
│       ├── panes/
│       │   ├── MapPane.tsx          ← Map workspace tab
│       │   ├── TablesPane.tsx       ← Tables workspace tab (editable grid)
│       │   ├── ValidationPane.tsx   ← Validation workspace tab
│       │   └── AnalyticsPane.tsx    ← Analytics workspace tab (map + charts)
│       └── charts/
│           ├── ResultsDashboard.tsx       ← "Results" sub-tab: fixed predefined charts
│           ├── UserDefinedChartCard.tsx   ← "Analytics" sub-tab: user-configurable chart
│           ├── InteractiveTimeSeriesCard.tsx  ← Recharts line/area/bar with timeframe zoom
│           ├── DonutChart.tsx             ← Recharts pie/donut chart
│           ├── CapacityExpansionCard.tsx  ← bar chart: p_nom vs p_nom_opt
│           ├── Co2ShadowCard.tsx          ← CO2 constraint shadow price card
│           ├── DurationCurveCard.tsx      ← sorted load/price duration curve
│           ├── EmissionsBreakdownCard.tsx ← stacked bar: emissions by carrier/generator
│           └── MeritOrderCard.tsx         ← merit order / supply curve
```

---

## Data flow

```
1. OPEN
   User opens .xlsx → parseWorkbook() (SheetJS)
   → WorkbookModel { network, buses, generators, ... }   (all in React state)

2. EDIT
   TablesPane → updateRowValue / addRow / deleteRow / addColumn
   → mutates WorkbookModel in state (no backend call)

3. RUN
   ▶ Run button → RunDialog (modal)
   → user picks snapshotStart/End, snapshotWeight, carbonPrice, dryRun

   POST /api/run (or /api/validate for dry-run)
   Body: RunPayload {
     model: WorkbookModel,     ← entire sheet data as JSON
     scenario: { constraints, carbonPrice },
     options: { snapshotCount, snapshotStart, snapshotWeight }
   }

4. BACKEND
   build_network(payload)
     → attach buses, loads, generators, lines, links, transformers,
       storage_units, stores, global_constraints
     → attach time-series profiles (p_max_pu, p_min_pu, loads-p_set, inflow)
     → slice & weight snapshots

   network.optimize()     ← HiGHS via PyPSA linopt

   run_pypsa(payload)
     → extract dispatch, emissions, prices, storage, line loading
     → per-asset details (generators, buses, storage_units, stores, branches)
     → merit order, CO2 shadow, capacity expansion delta
     → build RunResults dict

5. RENDER
   RunResults → React state (results)
   ResultsDashboard — fixed predefined charts (dispatch, load, price, storage …)
   AnalyticsPane (Analytics tab) — interactive map + user-defined chart cards
   Sidebar "Results" group — KPI summary cards
```

---

## RunPayload schema

Sent as JSON to `POST /api/run` and `POST /api/validate`.

```json
{
  "model": {
    "network":           [{ "name": "my_network", ... }],
    "snapshots":         [{ "name": "2019-01-01 00:00", ... }],
    "carriers":          [{ "name": "solar", "co2_emissions": 0, ... }],
    "buses":             [{ "name": "Bus1", "x": 127.0, "y": 37.5, ... }],
    "generators":        [{ "name": "Solar1", "bus": "Bus1", "carrier": "solar", ... }],
    "loads":             [{ "name": "Load1", "bus": "Bus1", "p_set": 100, ... }],
    "lines":             [...],
    "links":             [...],
    "stores":            [...],
    "storage_units":     [...],
    "transformers":      [...],
    "shunt_impedances":  [...],
    "global_constraints":[...],
    "shapes":            [...],
    "processes":         [...],
    "generators-p_max_pu":  [{ "name": "2019-01-01 00:00", "Solar1": 0.85, ... }],
    "generators-p_min_pu":  [...],
    "loads-p_set":           [...],
    "storage_units-inflow":  [...],
    "links-p_max_pu":        [...]
  },
  "scenario": {
    "constraints": [
      { "id": "c1", "enabled": true, "label": "CO2 cap",
        "metric": "co2_cap", "carrier": "", "value": 1000, "unit": "ktCO2" }
    ],
    "carbonPrice": 0
  },
  "options": {
    "snapshotCount": 24,
    "snapshotStart": 0,
    "snapshotWeight": 1
  }
}
```

Time-series sheets (`generators-p_max_pu` etc.) use the **first column as the snapshot label**
(`name` key) and subsequent columns keyed by component name.

---

## WorkbookModel sheet index

| Sheet | Type | PyPSA component | Notes |
|---|---|---|---|
| `network` | static | `Network` attrs | name, co2_limit etc. |
| `snapshots` | static | `Network.snapshots` | `name` column = datetime strings |
| `carriers` | static | `Carrier` | `co2_emissions` in t/MWh |
| `buses` | static | `Bus` | `x`/`y` for map, `v_nom` |
| `generators` | static | `Generator` | `p_nom_extendable`, `capital_cost`, `marginal_cost` |
| `loads` | static | `Load` | static `p_set` (overridden by `loads-p_set`) |
| `lines` | static | `Line` | `bus0`, `bus1`, `s_nom`, `x`, `r` |
| `links` | static | `Link` | `bus0`, `bus1`, `p_nom`, `efficiency` |
| `stores` | static | `Store` | `bus`, `e_nom`, `capital_cost` |
| `storage_units` | static | `StorageUnit` | `bus`, `p_nom`, `max_hours` |
| `transformers` | static | `Transformer` | `bus0`, `bus1`, `s_nom`, `x` |
| `shunt_impedances` | static | `ShuntImpedance` | rarely used |
| `global_constraints` | static | `GlobalConstraint` | `type`, `carrier_attribute`, `sense`, `constant` |
| `shapes` | static | geometry | optional GeoJSON shapes |
| `processes` | static | custom | app-specific process metadata |
| `generators-p_max_pu` | time-series | `Generator.p_max_pu` | columns = generator names |
| `generators-p_min_pu` | time-series | `Generator.p_min_pu` | columns = generator names |
| `loads-p_set` | time-series | `Load.p_set` | columns = load names |
| `storage_units-inflow` | time-series | `StorageUnit.inflow` | columns = storage unit names |
| `links-p_max_pu` | time-series | `Link.p_max_pu` | columns = link names |

---

## Key conventions

### Frontend

**CSS class prefixes** (each component owns its prefix — avoids global collisions):

| Prefix | Component / scope |
|---|---|
| `topbar-` | Top navigation bar |
| `tab-` | Workspace tab buttons |
| `app-sidebar` | Sidebar shell (aside element) |
| `sg-` | `SidebarGroup` |
| `modal-` | `RunDialog` (backdrop + card) |
| `run-` | Run button and run-dialog controls |
| `chart-` | Chart cards |
| `kpi-` | `SummaryCards` |
| `dual-range-` | `DualRangeSlider` |
| `analytics-` | `AnalyticsPane` |
| `pane` | Workspace pane shells |
| `tb-btn` | Toolbar / compact buttons |

State modifiers use BEM `--` suffix: `tb-btn--muted`, `app-sidebar--collapsed`,
`analytics-subtab--active`, `tab-button--error`, `sc-status--done`.

**Coerce helpers** (always use these, never raw casts):
- `numberValue(v)` — in `helpers.ts`; returns 0 for null/NaN/undefined
- `stringValue(v)` — in `helpers.ts`; returns `''` for null/undefined
- `carrierColor(carrier)` — deterministic carrier → hex colour

**Prop patterns:**
- Callback props are named `on<Action>` (e.g. `onRun`, `onClose`, `onChange`).
- State setter props lift plain setters directly: `onSnapshotStartChange={setSnapshotStart}`.
- Heavy derived data (`metricOptions`, `dispatchRows`) is computed in `App.tsx` via
  `useMemo` and passed down as props — components are pure-render, no internal data fetching.

### Backend

**Workbook access pattern** (use these in every module, never `model["sheet"]` directly):
```python
from ..utils.workbook import workbook_rows
from ..utils.coerce import number, text, bool_value

rows = workbook_rows(model, "generators")   # → list[dict]
for row in rows:
    name = text(row.get("name"))
    p_nom = number(row.get("p_nom"), default=0.0)
```

**`network/__init__.py` is the only public entry** — callers import `build_network` and
`validate_model`; internal sub-modules are not imported directly from outside `network/`.

**`results/__init__.py` is the only public entry** — callers import `run_pypsa`.

---

## Where to add…

### A new predefined result chart

1. Create `src/components/charts/MyNewCard.tsx`.
2. Add it to `ResultsDashboard.tsx` in the appropriate section.
3. If it needs a new data series, add it to `RunResults` in `src/types/index.ts` and extract
   it in the relevant `backend/lib/results/*.py` module.

### A new constraint metric

1. Add the new `ConstraintMetric` string literal to `src/types/index.ts`.
2. Add the UI row to `GlobalConstraintsSection.tsx`.
3. Handle the new metric in `backend/lib/network/custom_constraints.py`.

### A new backend result field

1. Add the field to the `RunResults` interface in `src/types/index.ts`.
2. Compute and return the field from `run_pypsa()` in `backend/lib/results/__init__.py`
   (or delegate to a new file in `results/`).
3. Consume the field in a chart card or the `ResultsDashboard`.

### A new workbook sheet

1. Add the sheet name to `SHEETS` (static) or `TS_SHEETS` (time-series) in
   `src/constants/sheets.ts`.
2. Add the corresponding key to the `WorkbookModel` interface in `src/types/index.ts`.
3. Add default rows to `DEFAULT_SHEET_ROWS` in `src/constants/index.ts`.
4. Add column definitions to `src/constants/pypsa_attributes.ts`.
5. Add a backend parser in the appropriate `backend/lib/network/*.py` file and call it from
   `build_network()`.

### A new analytics focus type

1. Add the new union member to `AnalyticsFocus` in `src/types/index.ts`.
2. Add asset detail types (if needed) to `RunResults.assetDetails`.
3. Add the metric options branch to the `metricOptions` useMemo in `App.tsx`.
4. Add the asset detail extractor in `backend/lib/results/assets/`.

---

## Current scope / limitations

- **Single-period only** — one solve covering a contiguous window of the annual snapshot
  sequence. Investment planning over multiple years is not yet implemented.
- **Copper-plate** by default — if no lines/links are defined, all buses are effectively
  connected without congestion. Line flows are extracted if branches exist, but no DC-OPF
  spatial routing is done unless the workbook provides impedances and `s_nom` limits.
- **No ETS / carbon market** — carbon price is a flat $/tCO₂ adder to generator marginal
  costs; there is no ETS permit price curve or intertemporal banking.
- **HiGHS only** — solver is fixed to HiGHS via PyPSA's default linopt interface. GLPK/Gurobi
  are not exposed in the UI.
- **Local backend** — the app assumes the FastAPI server is running at `http://localhost:8000`.
  There is no cloud deployment path or authentication layer.
- **No scenario manager** — run configurations are not saved; each `▶ Run` replaces the
  previous result in state.
