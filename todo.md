# Ragnarok — Feature Roadmap

> Organised **by topic**, not by priority.  
> Each item carries **Criticality · Urgency · Complexity** ratings.
>
> | Symbol | Meaning |
> |--------|---------|
> | 🔴 | Blocking — other major features depend on this |
> | 🟠 | Enabling — significantly expands what is possible |
> | 🟡 | Additive — standalone value, no downstream dependency |
> | 🟢 | Nice-to-have / polish |
>
> **Complexity**: S = days · M = 1–2 weeks · L = 3–4 weeks · XL = months

---

## A · Core Optimisation (Single-Year Physics)

Physical realism improvements to the single-year dispatch.

| ID | Feature | Criticality | Urgency | Complexity | Notes |
|----|---------|-------------|---------|------------|-------|
| A1 | **Unit Commitment (MIP)** — startup/shutdown cost, min up/down time, no-load cost | 🔴 | High | L | Without it thermal dispatch is unrealistically smooth and SRMC-only. Distorts merit order and cost breakdown. PyPSA `committable=True` + HiGHS MIP. |
| A2 | **AC Power Flow** — voltage magnitudes, reactive power, real thermal limits | 🟠 | Medium | L | Currently DC/LP approximation. Required for voltage constraint studies. PyPSA `network.pf()` post-solve. |
| A3 | **N-1 Security** — contingency analysis: flag corridors overloaded if any single branch trips | 🟡 | Medium | M | Post-processing loop over each line. No re-optimisation needed unless security-constrained dispatch is wanted. |
| A4 | **Solver settings panel** — choose solver (HiGHS / GLPK / Gurobi), MIP gap, time limit | 🟠 | High | S | Currently hardcoded to HiGHS. Needed before A1 goes to production. |
| A5 | **Streaming solve log** — stream solver stdout to frontend during long runs (SSE) | 🟢 | Medium | M | Quality-of-life for MIP runs that take minutes. |

---

## B · Market Mechanisms

How prices are formed, how allowances are traded, how generators are compensated.

| ID | Feature | Criticality | Urgency | Complexity | Notes |
|----|---------|-------------|---------|------------|-------|
| B1 | **Emission Trading Scheme (ETS)** — total CO₂ budget (tCO₂) as hard constraint; shadow price = endogenous EUA allowance price | 🟠 | High | S | PyPSA `GlobalConstraint` natively supports this. Pairs with existing CO₂ shadow price panel. Switch from intensity cap to total budget. Free allocation vs full auction affects generator revenue but not dispatch in a competitive market. |
| B2 | **ETS price collar** — floor and ceiling on EUA price | 🟡 | Low | S | Implemented as two additional constraints bounding the shadow price range. Reflects real EU ETS market stability reserve mechanism. |
| B3 | **Bid curves (piecewise MC)** — generator submits price-quantity steps, not a single flat marginal cost | 🟠 | Medium | M | PyPSA supports piecewise linear costs. Required for realistic merit-order simulation. Most useful after A1 (startup bids). |
| B4 | **Locational Marginal Prices (LMP / nodal pricing)** — per-bus clearing price from DC power flow duals | 🟠 | High | M | Currently all buses share one system price (copper-plate). Requires non-zero reactance `x` on lines. `n.buses_t.marginal_price` already populated post-solve when LOPF is active. |
| B5 | **Congestion rent** — `flow × |LMP_to − LMP_from|` per branch | 🟡 | Medium | S | Pure post-processing once B4 is live. Shows which corridors earn transmission revenue. |
| B6 | **Generator P&L** — revenue (`dispatch × LMP`) minus fuel cost = profit per generator | 🟡 | High | S | Pure post-processing. Critical for investor profitability screening. "Is this gas plant still profitable at 50% utilisation?" |
| B7 | **Pay-as-bid post-processing** — dispatched generators paid their own bid, not the clearing price | 🟡 | Low | S | Post-solve: replace clearing price with each generator's own marginal cost in revenue calc. Compare consumer cost under pay-as-cleared vs pay-as-bid. |
| B8 | **Capacity market** — separate auction for firm MW availability; reliability premium on top of energy revenue | 🟡 | Low | L | Separate optimisation pass or exogenous capacity price. Requires A1 (MIP) for firm commitment modelling. |
| B9 | **Reserve market (FCR / aFRR)** — reserve products with response-time constraints | 🟡 | Low | XL | Significant modelling complexity. Needs A1 + A2 as prerequisites. |

---

## C · Sector Coupling

Connect electricity to heat, hydrogen, gas, and transport. Each sector is a new energy bus in PyPSA.

| ID | Feature | Criticality | Urgency | Complexity | Notes |
|----|---------|-------------|---------|------------|-------|
| C1 | **District heat** — heat bus, CHP (gas→elec+heat), heat pump (elec→heat), hot-water store | 🟠 | Medium | L | CHP is common in Korea and Northern Europe. PyPSA `Link` with `bus2=heat_bus`, `efficiency2=η_heat`. |
| C2 | **Green hydrogen** — electrolyser (elec→H2), fuel cell (H2→elec), H2 store (compressed tank / salt cavern) | 🟠 | Medium | L | Long-duration storage candidate. ~40% round-trip loss. High policy relevance. |
| C3 | **Natural gas network** — gas bus, gas supply (import price), gas store, feed to CCGT / OCGT / boiler | 🟡 | Medium | M | Currently gas generators have implicit infinite fuel supply. Adds supply constraints and gas price signals. |
| C4 | **Electric vehicles (V2G)** — smart-charge profile, V2G discharge window, fleet aggregation | 🟡 | Low | L | Large demand flexibility source. Requires F6 (EV charge profile generator) for realistic inputs. |
| C5 | **CO₂ capture** — DAC (elec→CO₂ removal), point-source CCS on thermal plants, CO₂ bus | 🟡 | Low | L | Needed for net-zero pathways. CO₂ bus with negative-emission credits feeding into ETS (B1). |
| C6 | **Sankey / energy flow diagram** — MWh flows across all sectors per scenario | 🟠 | Medium | M | Frontend visualisation. Essential for communicating cross-sector results to non-technical audiences. |

---

## D · Investment & Long-Term Planning

Beyond single-year dispatch to multi-year capacity decisions.

| ID | Feature | Criticality | Urgency | Complexity | Notes |
|----|---------|-------------|---------|------------|-------|
| D1 | **Sensitivity / what-if sweep** — vary one parameter over a range; plot KPI response curve | 🟠 | High | M | High investor value: "at what carbon price does gas become unprofitable?" Runs N sequential solves server-side. |
| D2 | **Scenario comparison** — run Config A vs Config B; side-by-side KPI delta table and chart overlay | 🟠 | High | M | Needs D3 (result caching) first. Answers "what does ETS do vs no ETS?" or "coal ban vs carbon price?" |
| D3 | **Result caching** — store last N run results in `localStorage`; re-view without re-running | 🟠 | High | S | Prerequisite for D2. Also essential UX for slow MIP runs (A1) and sensitivity sweeps (D1). |
| D4 | **Multi-year rolling horizon** — invest across N years with overlapping windows; fix first-period decisions | 🔴 | Low | XL | Most complex feature. Requires capacity expansion (done), demand forecast (D5), and snapshot clustering (D6). PyPSA ≥ 0.26. |
| D5 | **Per-year demand forecast** — per-bus, per-year growth rates replacing the single flat scalar | 🟠 | Low | M | Prerequisite for D4. Demand editor: bus rows × year columns grid. |
| D6 | **Representative snapshot clustering** — k-means on load + RE profiles → N typical days/weeks | 🟠 | Low | M | Required for D4 and large C sector runs to keep solve size tractable. |

---

## E · Model Databases

Pre-built datasets that let users start from a real country-level power system rather than a blank workbook.

| ID | Feature | Criticality | Urgency | Complexity | Notes |
|----|---------|-------------|---------|------------|-------|
| E1 | **Country-level power system database** — open-source, versioned, API-accessible dataset of generators, lines, buses, loads per country | 🔴 | High | XL | Transformative for the investor use case. Sources: PyPSA-Earth, PyPSA-Eur, ENTSO-E Transparency, GEM (Global Energy Monitor), IRENA, national TSO data. Managed as a separate repo/microservice. API returns Ragnarok workbook format. This is a major data engineering project. |
| E2 | **IEA / governmental scenario overlays** — import capacity mix and demand projections from IEA WEO, IRENA, national energy plans | 🟠 | Medium | L | Overlay on E1 base: "replace 2030 IEA STEPS capacity mix onto Korea's network." Requires mapping IEA technology categories to PyPSA carriers. |
| E3 | **SSP / RCP scenario overlays** — Shared Socioeconomic Pathways (SSP1–5) for demand; RCP (2.6 / 4.5 / 8.5) for emission budgets | 🟡 | Low | L | Academic and policy use. Data from IIASA SSP database. Drives demand growth rate and CO₂ cap in B1 ETS. |
| E4 | **Fuel price database** — historical and projected coal, gas, oil, uranium prices by region with auto-population of generator marginal costs | 🟡 | Medium | M | Currently users hard-code marginal costs. Live/cached price feed (IEA, World Bank, EIA) would auto-populate `marginal_cost` for thermal generators. |
| E5 | **Database browser UI** — search, filter, and load country datasets directly from within the app | 🟠 | Medium | M | Frontend for E1. Replaces manual workbook entry for standard system studies. |

---

## F · Profile Generators

Auto-generate time-series inputs from physical and economic first principles.

| ID | Feature | Criticality | Urgency | Complexity | Notes |
|----|---------|-------------|---------|------------|-------|
| F1 | **Demand profile generator** — shape hourly load from GDP, population, industry structure, climate zone, season | 🟠 | High | L | Sector decomposition: residential / commercial / industrial + temperature-sensitivity. Sources: IEA end-use data, national grid operators. Output: `loads-p_set` time-series sheet. |
| F2 | **Solar PV profile generator** — capacity factor time-series from lat/lon + panel tilt/azimuth using PVGIS or ERA5 | 🔴 | High | M | Most-requested missing input. PVGIS REST API is free and returns hourly CF. Output: `generators-p_max_pu` column for Solar. |
| F3 | **Wind profile generator** — capacity factor time-series from lat/lon + hub height using ERA5 or Global Wind Atlas | 🔴 | High | M | Same pattern as F2. `atlite` library used in PyPSA-Eur is the natural backend. |
| F4 | **Stochastic renewable profiles** — generate N weather-year realisations (Gibbs sampler / copula) to capture inter-annual variability | 🟡 | Low | XL | Each realisation = one `p_max_pu` scenario. Enables probabilistic adequacy analysis. Computationally heavy — likely requires HPC or batch backend. "Gitter" for stochasticity. |
| F5 | **Hydro inflow profile generator** — reservoir inflow time-series from runoff data (GloFAS, ERA5 precipitation) | 🟡 | Medium | M | Important for hydro-dominant systems (Norway, Brazil, Korea Soyang dam). Output: `storage_units-inflow` time-series sheet. |
| F6 | **EV smart-charge profile** — time-of-use charging pattern from fleet size, commute pattern, grid tariff structure | 🟡 | Low | M | Input for C4. Generates flexible demand profile with V2G discharge window and smart-charge spread. |

---

## G · AI-based Modelling

Natural language interface for model building, result interpretation, and scenario generation.

| ID | Feature | Criticality | Urgency | Complexity | Notes |
|----|---------|-------------|---------|------------|-------|
| G1 | **Claude / GPT / Gemini API integration** — chat panel inside the app; interprets results, suggests constraints, explains shadow prices | 🟠 | Medium | M | API key stored in user settings. Model receives current workbook summary + results JSON as context. Answers "why is gas running at full capacity?" type questions. |
| G2 | **Natural language model builder** — "add a 500 MW offshore wind farm at bus Seoul at $1200/kW CAPEX" → writes workbook row | 🟠 | Medium | L | Structured JSON output from LLM → `addRow` workbook action. Requires careful prompt engineering to prevent hallucinated values. Validation step before applying. |
| G3 | **Local LLM (Ollama / Mistral / LLaMA)** — same interface as G1 but runs fully on-device | 🟡 | Low | M | For government or utility clients with data residency requirements (air-gapped environments). Calls `localhost:11434`. |
| G4 | **AI results narrator** — after solve, LLM writes a 3-paragraph narrative: what happened, why, what to do next | 🟡 | Low | S | Low complexity: pass results JSON to LLM, prompt for structured narrative. Display in the Results tab below KPIs. |
| G5 | **AI constraint suggester** — given results, LLM flags relevant constraints ("your RE share is 12%; consider a minimum RE share constraint") | 🟡 | Low | M | Requires G1 as foundation. Particularly useful for users unfamiliar with constraint formulation. |

---

## H · Reporting & Export

Turning results into shareable deliverables.

| ID | Feature | Criticality | Urgency | Complexity | Notes |
|----|---------|-------------|---------|------------|-------|
| H1 | **PDF report generator** — export KPI strip + all charts + run notes as a formatted PDF | 🟠 | Medium | M | `html2canvas` + `jsPDF` in browser, or backend `weasyprint`. One-click from Results tab. |
| H2 | **PPTX slide deck** — key charts exported to a PowerPoint template | 🟡 | Low | M | `python-pptx` backend. Investor / boardroom use. |
| H3 | **Scenario comparison report** — side-by-side PDF / Excel comparing two runs | 🟡 | Low | M | Requires D2 (scenario comparison) first. |
| H4 | **Inline validation hints** — highlight workbook cells that will cause infeasibility with tooltip explanation | 🟠 | Medium | M | Currently validation errors are text-only in the Validation tab. Annotating the Tables pane cell directly is far more actionable. |

---

## I · Data Import / Interoperability

Bring in models from other tools without manual re-entry.

| ID | Feature | Criticality | Urgency | Complexity | Notes |
|----|---------|-------------|---------|------------|-------|
| I1 | **PyPSA `.nc` / `.h5` import** — load an existing PyPSA `Network` file directly into the workbook | 🟠 | Medium | S | PyPSA users can import their existing models without rebuilding. `pypsa.Network.import_from_netcdf()`. |
| I2 | **Matpower `.m` file import** — parse MATPOWER case files (bus, gen, branch tables) → workbook | 🟡 | Medium | M | Large library of standard IEEE test cases (14, 118, 300 bus). Good for AC power flow validation. |
| I3 | **PSS·E `.raw` file import** — parse PTI RAW format used by most grid operators | 🟡 | Low | L | Industry-standard format. Complex parser — consider `pandapower` as an intermediate. |
| I4 | **ENTSO-E Transparency API import** — pull actual generation, load, and installed capacity for EU countries | 🟠 | Medium | M | `entsoe-py` library. Requires ENTSO-E API key. Feeds E1 database and F1–F3 profiles. |

---

## Current State (single-year model)

| Component | Status |
|-----------|--------|
| Linear dispatch (LP) | ✅ Done |
| Capacity expansion with CAPEX annuity | ✅ Done |
| Carbon price in optimisation | ✅ Done |
| Custom constraints (CO₂ cap, RE share, carrier caps) | ✅ Done |
| CO₂ shadow price (GlobalConstraint + linopy dual) | ✅ Done |
| Emissions breakdown by generator / carrier | ✅ Done |
| Merit order chart | ✅ Done |
| Results dashboard (dispatch, mix, cost, duration curves) | ✅ Done |
| User-defined analytics charts | ✅ Done |
| Excel export (workbook + results) | ✅ Done |
| Map visualisation | ✅ Done |
| Unit Commitment (MIP) | ⬜ A1 |
| AC Power Flow | ⬜ A2 |
| N-1 Security | ⬜ A3 |
| ETS cap-and-trade | ⬜ B1 |
| Nodal pricing (LMP) | ⬜ B4 |
| Generator P&L | ⬜ B6 |
| Sector coupling (heat, H2, gas) | ⬜ C1–C5 |
| Sensitivity sweep | ⬜ D1 |
| Scenario comparison | ⬜ D2 |
| Country-level database | ⬜ E1 |
| IEA / SSP scenario overlays | ⬜ E2–E3 |
| Solar / Wind profile generator | ⬜ F2–F3 |
| Demand profile generator | ⬜ F1 |
| Stochastic profiles | ⬜ F4 |
| AI chat interface | ⬜ G1–G2 |
| PDF / PPTX report | ⬜ H1–H2 |
| PyPSA / Matpower import | ⬜ I1–I2 |

---

## Suggested Build Order

```
Near-term (high value, lower complexity)
  B1  ETS cap-and-trade            2 days   — pairs with existing shadow price panel
  B6  Generator P&L                1 day    — pure post-processing
  D3  Result caching               2 days   — unlocks D1 and D2
  F2  Solar profile (PVGIS API)    3 days   — biggest missing input
  F3  Wind profile (ERA5/atlite)   3 days   — same pattern as F2
  A4  Solver settings panel        1 day    — needed before MIP
  G4  AI results narrator          2 days   — low complexity, high perceived value

Medium-term
  A1  Unit Commitment (MIP)        2 weeks  — major physical realism upgrade
  B4  Nodal pricing (LMP)          1 week   — independent of MIP
  B3  Bid curves                   1 week   — after A1
  D1  Sensitivity sweep            1 week   — after D3
  D2  Scenario comparison          1 week   — after D3
  G1  AI chat interface            1 week
  F1  Demand profile generator     2 weeks
  H1  PDF report                   1 week

Longer-term
  C1  District heat                3 weeks
  C2  Green hydrogen               3 weeks
  B8  Capacity market              3 weeks  — after A1
  A2  AC Power Flow                3 weeks
  A3  N-1 Security                 2 weeks  — after A2
  E1  Country database             months   — data engineering project
  D4  Multi-year rolling horizon   months   — after D5 + D6
  F4  Stochastic profiles          months   — HPC territory
```
