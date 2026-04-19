# pypsa_gui — Feature Roadmap

Last updated: 2026-04-19

---

## Existing features (do not re-implement)

### Navigation & UI
- Two top-level tabs: Model | Analytics
- Model subtabs: Map (Leaflet) | Table (grid editor)
- Analytics subtabs: Validation | Result | Analytics | Comparison
- Sidebar with run history (pin, rename, compare, up to 5 unpinned)
- Toast notifications, status bar, elapsed-time ticker
- No icons or emojis anywhere — plain text labels only (hard rule)

### Input & model building
- Load / save .xlsx workbook; sample workbook on startup
- 14 static sheets: network, snapshots, carriers, buses, generators, loads, lines, links, stores, storage_units, transformers, shunt_impedances, global_constraints, processes
- 5 time-series sheets: generators-p_max_pu, generators-p_min_pu, loads-p_set, storage_units-inflow, links-p_max_pu
- Grid editor: add/delete rows, optional attribute dropdown (driven by pypsa_attributes.json)
- Leaflet map: buses as markers, lines/links as edges, coloured by carrier

### Network components (backend)
- Buses, Generators (with committable/MIP + UC attributes), Loads
- Lines, Links (multi-bus: bus2/bus3, efficiency2/3), Transformers, Shunt impedances
- Stores, StorageUnits, Processes (rate0/rate1 API), Carriers

### Run options
- Snapshot window (start/end index), snapshot weight (1-24h)
- Carbon price ($/tCO2 adder per carrier emission factor)
- Force LP — suppress all committable flags for fast LP solve
- Unit commitment (MIP): reads committable, min_up/down_time, start/shut_down_cost per generator
- Capacity expansion: annuitised CAPEX, p_nom_extendable, discount rate
- Dry run (validate without solving)

### Constraints
- Custom panel: co2_cap, re_share, max_load_shed, carrier_max/min_gen, carrier_max/min_share
- GlobalConstraints workbook sheet: any PyPSA-native constraint (CO2 budget = primary_energy type)

### Results & analytics
- System KPIs: capacity, peak load, reserve margin, avg/peak price, emissions, line stress
- Dispatch time-series by carrier (stacked area)
- Energy mix donut, cost breakdown donut (fuel / carbon / shedding / CAPEX)
- Load duration curve, price duration curve
- Storage state-of-charge trajectory
- Merit order (supply stack)
- CO2 shadow price card (binding constraint dual variable)
- Emissions breakdown by generator and by carrier
- Capacity expansion table: Generator, StorageUnit, Store, Link, Line (with MW/MWh/MVA units)
- Nodal prices / LMP: per-bus marginal price line chart (multi-bus models only)
- Per-asset drill-down: generator, bus, storage unit, store, branch
- User-defined charts (any metric x timeframe x component)
- Run comparison table (>= 2 runs, settings + results side by side)
- Export results to .xlsx, charts to .png

### Agent definitions (.claude/agents/)
- leader — reads todo, plans one feature at a time, commits/pushes after review
- reviewer — checks diff for icons, scope creep, duplication, type contract
- tester — tsc + py_compile + emoji scan before reviewer sees the diff
- developer — implements concrete briefs, no planning, no committing

---

## Planned features

### Modelling (optimisation)

- [ ] Reserve margin constraint
  Add reserve_margin type to custom_constraints.py: total installed capacity >= peak load x (1 + margin%).
  Show as a new option in the custom constraint panel UI.

- [ ] Welfare maximisation / elastic demand
  Add demand blocks as negative-cost virtual generators in network/__init__.py.
  Results show consumer surplus + producer surplus split on top of existing cost breakdown.

- [ ] Rolling horizon
  New backend solve mode: divide snapshots into overlapping windows, solve sequentially with
  carry-over storage SoC between windows. New rollWindow option in RunDialog.

- [ ] Multi-period investment planning
  Enable PyPSA multi_invest mode. Investment periods from workbook, build_year/retire_year per
  asset, multi-year cost discounting. Results show per-period capacity decisions.

- [ ] DER / Demand Response
  Model shiftable/curtailable loads as StorageUnits (charge = curtail, discharge = shift) or Links.
  DR activation visible in dispatch chart.

- [ ] Sensitivity / parametric runs
  Sweep a single parameter (carbon price, snapshot weight, one constraint value) over N values.
  All results auto-saved to run history.

### Results improvements

- [ ] Nodal price map overlay
  LMP heatmap on the Leaflet bus map after a solve. Bus fill colour = avg marginal price.
  Tooltip shows avg/peak LMP per bus.

- [ ] Storage expansion display
  Show e_nom_opt alongside p_nom_opt for storage assets in the expansion table.
  Add energy/power ratio column.

- [ ] Processes in dispatch chart
  Process output flows not yet included in dispatchSeries.
  Add to by_carrier aggregation in results/dispatch.py.

---

### Navigation redesign

- [ ] Top-level navigation: 4 tabs
  Expand from 2 tabs to 4: Data - Build - Model - Analytics
    Data     = data availability map + import catalogue
    Build    = guided step-by-step model construction wizard
    Model    = current table + map editor (review and fine-tune)
    Analytics = current results dashboard

---

### Build tab (guided wizard)

- [ ] Build tab — step-by-step model wizard
  10 steps in construction order:
    1.  Network     — name, base_mva, frequency
    2.  Carriers    — add energy carriers with CO2 factors
    3.  Buses       — location, voltage, carrier
    4.  Generators  — bus, carrier, capacity, cost
    5.  Loads       — bus, profile
    6.  Storage     — storage units and stores
    7.  Lines/Links — transmission topology
    8.  Processes   — multi-port converters
    9.  Constraints — global constraints
    10. Review      — validation summary + link to Model tab

  Each step validates on Next and writes directly into the shared WorkbookModel
  state so Model tab always reflects Build output.

---

### Data tab

- [ ] Data source registry
  backend/data_sources.json — single source of truth for all known data sources.
  Fields per entry: id, country_codes[], name, data_type, temporal_res, spatial_res,
  timeline, method (api|download|manual), endpoint_url, api_key_env, notes.
  Never edited directly by users — written via editor modal backend endpoint.

- [ ] Data tab — world choropleth map
  Leaflet map with country GeoJSON. Fill colour per country:
    Dark green  = at least one source imported
    Light green = sources available, none imported yet
    Grey        = no known sources
  Hover tooltip lists all sources for that country (name, method, status).
  Click opens a country panel with Edit + Test buttons per source.

- [ ] Data tab — source catalogue table
  One row per source (a country with 5 sources = 5 rows).
  Columns: country, source name, data type, temporal resolution, spatial resolution,
  timeline, link, import status, notes.
  Filterable by country and data type. Edit and Test buttons per row.

- [ ] Data source editor modal
  Popup form for add / edit / delete a source.
  Fields: name, country codes (multi-select), data type, temporal res, spatial res,
  timeline, method, endpoint URL, API key env var, notes.
  Save writes back to data_sources.json via PUT /api/data/sources/{id}.
  Triggered from: Add source button, Edit button per row, country map click panel.

- [ ] Data source validator
  Test button in editor modal and per catalogue row.
  Calls POST /api/data/sources/{id}/test.
  Backend pings endpoint (HEAD or small GET), returns: reachable, http_status,
  response_time_ms, sample_row_count, error_message.
  Status badge: green = ok, red = unreachable, grey = untested.

- [ ] Data importer backend
  FastAPI endpoints:
    GET  /api/data/sources              — return full catalogue
    GET  /api/data/sources/{id}/preview — fetch sample rows
    POST /api/data/sources/{id}/import  — download, parse, write into workbook sheet
    POST /api/data/sources/{id}/test    — connectivity check
  Importers pluggable per source type (REST API, direct download, manual upload).
  Import progress streamed via SSE or polling.

---

### Perspectives

A Perspective is a triplet:
  1. Perspective-specific input parameters
  2. Run configuration overrides
  3. Ordered result card layout

Stored in perspectives.json. Active perspective selected via dropdown in Analytics header.

Built-in presets (read-only, duplicatable):

  Power Utility Investor
    Inputs:  WACC (%), asset lifetime (yr), tax rate (%), target IRR (%)
    Outputs: LCOE, NPV, payback period, CAPEX breakdown, merit order

  DER Manager
    Inputs:  Flexibility capacity (MW), response time (min), DR activation cost ($/MW), aggregation zone
    Outputs: DR dispatch, curtailment, nodal prices, peak shaving

  ESS Developer
    Inputs:  Degradation rate (%/cycle), target cycles/yr, ancillary revenue ($/MW/hr), price curve source
    Outputs: Cycling count, round-trip efficiency, arbitrage margin, SoC duration curve

  System Planner
    Inputs:  Planning horizon (yr), demand growth (%/yr), N-1 margin (%), fuel price escalation
    Outputs: Reserve margin, transmission loading, nodal balance, multi-period expansion

- [ ] Perspectives framework
  perspectives.json storage, dropdown in Analytics header, preset definitions.
  Presets read-only but duplicatable. Active perspective persists across runs.

- [ ] Perspective inputs
  Each perspective exposes its own input panel shown before running.
  Inputs feed into backend as extra scenario parameters for post-solve calculations
  (LCOE, NPV, cycling economics). The core PyPSA solve is unchanged.

- [ ] Perspective result layout
  Ordered card list per perspective. Analytics tab renders cards in perspective order.
  Cards not in the active perspective are hidden; data still available.
  Layout editable via drag-and-drop.

- [ ] Perspective editor modal
  Create / edit / duplicate / delete perspectives. Three sections:
    1. Identity      — name, description, target user
    2. Input fields  — add/remove/reorder parameters (label, type, unit, default)
    3. Result layout — drag-and-drop card list with per-card config
  Save writes to perspectives.json.

---

## Hard rules (apply to every change)

1. No icons or emojis in any .tsx or .ts file. Plain text labels only.
2. Modelling-only — do not modify input sheets, DEFAULT_SHEET_ROWS, or
   pypsa_attributes.json unless the user explicitly asks.
3. Check before building — if a feature is in the existing list above, do not
   re-implement it. Find where it lives and extend it.
4. Every change must pass `npx tsc --noEmit` and `python3 -m py_compile`
   before review.
5. One todo item in progress at a time.

---

### Renewable profile generator

- [ ] Renewable profile generator (backend)
  Location-based capacity factor time-series generator for solar PV and wind.
  User picks a location (lat/lon from map click or bus coordinates) and a year.
  Backend fetches hourly CF profiles from pluggable sources:
    1. Renewables.ninja API  — solar + wind, requires free API token (stored in env)
    2. ERA5 via atlite       — solar + wind, local reanalysis processing, no API key
    3. PVGIS API             — solar PV, EU-focused, free, no key required
  Generated profile written directly into generators-p_max_pu sheet for the selected
  generator. Preview chart shown before writing.

- [ ] Renewable profile generator UI
  Triggered from: (1) Generate profile button on each generator table row,
  (2) clicking a bus on the map.
  Modal fields:
    - Source selector (Renewables.ninja / ERA5 / PVGIS)
    - Year picker
    - Technology selector (solar-pv / wind-onshore / wind-offshore)
    - Turbine or panel model selector where applicable
    - Lat/lon fields — auto-filled from bus location
    - Preview chart of the resulting 8760h CF profile
    - Write to sheet button
  API tokens entered once in the modal, stored in browser localStorage,
  never sent to server logs.
