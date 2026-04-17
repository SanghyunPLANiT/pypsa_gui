# PyPSA Studio — Technical Upgrade Roadmap

## Current State
- **Optimization**: Single-period economic dispatch (LP) only — no investment decisions
- **Capacity**: All component sizes fixed from workbook; `p_nom_extendable` never used
- **Pricing**: One system marginal price (SMP) shared across all buses (copper-plate model)
- **Demand**: Flat growth scalar applied uniformly; no multi-year or per-bus forecasting
- **Time horizon**: Single year, synthetic or workbook timestamps
- **Sectors**: Electricity only — no heat, hydrogen, gas, or transport coupling

---

## T1 · Capacity Expansion

**What**: Make generator/storage sizes optimisation decision variables (CAPEX vs. OPEX trade-off).  
**PyPSA**: `p_nom_extendable=True`, `capital_cost`, reads `p_nom_opt` from solution.

| ID | Task | Layer |
|----|------|-------|
| T1-1 | Add `extendable` boolean column to generators/stores/storage_units workbook sheets | Workbook |
| T1-2 | Backend: pass `p_nom_extendable` + annualised `capital_cost` when `extendable=True` | Backend |
| T1-3 | Add `discount_rate` and `asset_lifetime` to scenario payload; compute annuity factor `r(1+r)^n/((1+r)^n-1)` | Backend |
| T1-4 | Add `candidates` sheet (technology library): name, carrier, capex $/kW, opex $/MWh, lifetime yr | Workbook |
| T1-5 | Return `p_nom_opt` per asset in results; add CAPEX line to cost breakdown | Backend |
| T1-6 | Frontend: show installed vs. optimised capacity in generator/storage asset detail panel | Frontend |
| T1-7 | Frontend: waterfall/bar chart of new capacity additions by carrier | Frontend |

---

## T2 · Demand Forecast (Time-Series + Annual Growth)

**What**: Per-bus, per-year demand growth instead of a single flat multiplier.  
**Currently**: `demandGrowth` is one percentage applied uniformly to all loads.

| ID | Task | Layer |
|----|------|-------|
| T2-1 | Add `demand_forecast` workbook sheet: columns = `bus`, `year`, `growth_pct` | Workbook |
| T2-2 | Backend: apply per-bus per-year growth factors when scaling load profiles | Backend |
| T2-3 | Support multi-year hourly load time-series (`loads-p_set` with `year` column or per-year sheets) | Backend |
| T2-4 | Frontend: demand forecast editor — editable grid (bus rows × year columns) | Frontend |
| T2-5 | Frontend: stacked area chart of projected peak demand by bus/year | Frontend |
| T2-6 | Add `peak_year` to run options — which year's demand to size capacity against in T1 | Backend |

---

## T3 · Multi-Year Investment Plan with Rolling Horizon

**What**: Solve investment decisions across N discrete years with a rolling window to keep the
problem tractable and allow plan revision as new information arrives.

### How rolling horizon works

A full perfect-foresight solve over 2025–2050 creates a massive LP (25 years × 8760 hours = 219,000
snapshots × all assets). Rolling horizon breaks this into overlapping windows:

```
Window 1:  solve [2025 → 2035]  →  fix 2025 build decisions  →  advance
Window 2:  solve [2030 → 2040]  →  fix 2030 build decisions  →  advance
Window 3:  solve [2035 → 2045]  →  fix 2035 build decisions  →  advance
...
```

Each window looks N years ahead (the "look-ahead" prevents purely myopic choices), but only the
**first period's decisions are locked in**. The rest are re-solved in the next window with updated
demand forecasts, fuel prices, and already-built capacity as input constraints.

**Why not perfect foresight?**
- 정보 비대칭: real planners don't know 2050 prices now
- Computational: a 25-year LOPF is often infeasible without HPC
- Plan revision: allows reacting to new policy/technology in each window

**PyPSA implementation path**:
- Use `network.investment_periods` for the window (e.g. 3–4 periods per solve)
- Between windows: extract `p_nom_opt` → set as `p_nom_min` (floor) in next window so built capacity is preserved
- Representative snapshots per period (e.g. 4 typical weeks × 168 h) to keep solve size manageable
- Iterate until horizon end

| ID | Task | Layer |
|----|------|-------|
| T3-1 | Add `investment_periods` (list of years) and `rolling_window` (int, number of periods per solve) to RunPayload.options | Backend |
| T3-2 | Backend: orchestrate rolling loop — build multi-period network per window, fix prior decisions, advance | Backend |
| T3-3 | Add `build_year` / `retire_year` columns to generators sheet; map to PyPSA `active_i` logic | Workbook + Backend |
| T3-4 | Add WACC / `discount_rate` to scenario; compute period weightings for NPV objective | Backend |
| T3-5 | Handle existing assets retiring within horizon (`p_nom = 0` after `retire_year`) | Backend |
| T3-6 | Representative snapshot selection: cluster full-year hourly data into N typical periods per investment year | Backend |
| T3-7 | Return per-period results: capacity built per year, annualised CAPEX stream, system NPV, LCOE/LCOS | Backend |
| T3-8 | Frontend: investment timeline chart — Gantt or stacked bar of capacity additions by year | Frontend |
| T3-9 | Frontend: NPV / cost-of-supply summary table per investment period | Frontend |
| T3-10 | Frontend: rolling horizon progress indicator (which window is solving, which periods are fixed) | Frontend |
| T3-11 | Frontend: new "Investment Plan" tab or section in Analytics pane | Frontend |

> **Dependencies**: T3 requires T1 (extendable assets) and T2 (per-year demand).  
> Requires **PyPSA ≥ 0.26** — check `pypsa.__version__` before enabling.

---

## T4 · Multi-Market / Nodal Pricing (LMP)

**What**: Compute locational marginal prices (LMP) per bus instead of one system-wide SMP.  
**PyPSA**: `n.buses_t.marginal_price` is populated when DC linearised power flow is active.  
**Current gap**: Lines have `x = 0` (lossless copper-plate) → all buses share one price.

| ID | Task | Layer |
|----|------|-------|
| T4-1 | Backend: enable DC linearised power flow for lines with `x ≠ 0`; use `n.optimize()` with LOPF | Backend |
| T4-2 | Backend: extract `n.buses_t.marginal_price` per bus per snapshot; return as `nodalPriceSeries` | Backend |
| T4-3 | Backend: compute congestion rent = `flow × |LMP_bus0 − LMP_bus1|` per branch | Backend |
| T4-4 | Frontend: LMP heat-map on Analytics map — bus circles coloured by average LMP | Frontend |
| T4-5 | Frontend: per-bus price duration curve in bus asset detail panel | Frontend |
| T4-6 | Frontend: congestion rent table in branch detail panel | Frontend |
| T4-7 | Workbook: add `x` (reactance, p.u.) column to lines sheet; add validation warning if missing | Workbook + Validation |

---

## T6 · Sector Coupling

**What**: Connect the electricity system to other energy sectors — heat, hydrogen, gas, transport.
When sectors are coupled, excess renewable electricity can be stored as hydrogen or heat rather
than curtailed, and cross-sector demands compete for the same capacity.

### Core concept in PyPSA

PyPSA represents all sectors as **energy buses with different carriers**. Conversion between sectors
uses `Link` components with multiple outputs. Example:

```
Electricity bus ──[Link: electrolyser, η=0.7]──► H2 bus ──[Store: H2 tank]
                                                        └──► [Link: fuel cell, η=0.5]──► Electricity bus

Electricity bus ──[Link: heat pump, COP=3.0]──► Heat bus ──[Store: hot water tank]
                                                          └──► [Load: district heating]

Natural gas bus ──[Link: CHP, η_e=0.4, η_h=0.45]──► Electricity bus (primary)
                                                   └──► Heat bus (secondary, waste heat)
```

PyPSA `Link` supports `bus0`/`bus1`/`bus2`/`bus3` with independent efficiencies — this is the
native sector coupling primitive.

### Sectors to support

| Sector | New carrier | Key components | Links |
|--------|------------|---------------|-------|
| **District heat** | `heat` | heat bus, heat load, heat store (hot water tank) | Heat pump (elec→heat), Electric boiler (elec→heat), CHP (gas→elec+heat) |
| **Hydrogen** | `H2` | H2 bus, H2 store (compressed tank / salt cavern) | Electrolyser (elec→H2), Fuel cell (H2→elec), SMR (gas→H2+CO2) |
| **Natural gas** | `gas` | gas bus, gas store | Gas boiler (gas→heat), OCGT/CCGT (gas→elec), biogas injection |
| **Transport (EV)** | `transport` | EV load bus, EV battery store | Charger (elec→transport), V2G discharge (transport→elec) |
| **CO₂** | `co2` | CO2 bus (atmosphere/sequestration) | Direct Air Capture (elec→CO2 removal), CO2 sequestration store |

### Implementation tasks

| ID | Task | Layer |
|----|------|-------|
| T6-1 | Workbook: add `sector_buses` sheet — name, carrier (heat/H2/gas/transport/co2), unit | Workbook |
| T6-2 | Workbook: extend `links` sheet to support `bus2`/`bus3` and `efficiency2`/`efficiency3` for multi-output links (CHP, SMR) | Workbook |
| T6-3 | Backend: build sector buses from `sector_buses` sheet in `add_buses()` | Backend |
| T6-4 | Backend: detect multi-output links (`bus2`/`bus3` columns) and pass all outputs to `network.add("Link", ...)` | Backend |
| T6-5 | Backend: add sector loads (heat demand, H2 demand) from new `sector_loads` sheet | Backend |
| T6-6 | Backend: add sector-specific marginal prices from `n.buses_t.marginal_price` per sector carrier | Backend |
| T6-7 | Backend: extend CO2 accounting — track emissions across all sectors (gas combustion, fugitive, DAC negative) | Backend |
| T6-8 | Workbook: add pre-built component templates for common converters (heat pump, electrolyser, CHP, EV charger) to `candidates` sheet (from T1-4) | Workbook |
| T6-9 | Frontend: sector energy flow diagram (Sankey chart) — MWh flows across carriers per period | Frontend |
| T6-10 | Frontend: per-sector KPIs in results dashboard (heat supply mix, H2 production, EV charging share) | Frontend |
| T6-11 | Frontend: sector bus display on map — different marker shape per carrier (circle=AC, square=heat, diamond=H2) | Frontend |
| T6-12 | Validation: warn if a sector bus has no load and no export path (dangling bus) | Validation |

### Key design rules
- Every sector bus needs at least one load or export sink, or the LP is infeasible (energy must go somewhere)
- COP of heat pumps is temperature-dependent — allow a `p_max_pu` time series to represent seasonal COP variation
- H2 storage has very different round-trip efficiency and energy-to-power ratio than BESS — must be modelled separately
- Sector coupling dramatically increases model size; use representative snapshots (T3-6) when combining with multi-year

---

## T5 · Supporting Infrastructure

Cross-cutting improvements that unlock or improve T1–T4/T6.

| ID | Task | Needed by |
|----|------|-----------|
| T5-1 | Solver settings panel: choose solver (HiGHS / GLPK / Gurobi), time limit, MIP gap | T1, T3 |
| T5-2 | Result caching: store last N run results in `localStorage`; re-view without re-running | T3 |
| T5-3 | Scenario comparison: run two configs back-to-back, display side-by-side KPI diff | T1, T4 |
| T5-4 | Sensitivity sweep: vary one parameter (carbon price, demand growth) over a range → plot | T1 |
| T5-5 | Validation: warn if extendable asset has `capital_cost = 0`; warn if lines missing `x` | T1, T4 |
| T5-6 | Progress / solve log: stream solver output to frontend during long runs (SSE or polling) | T1, T3 |
| T5-7 | Representative snapshot clustering: k-means or hierarchical on load + RE profiles → N typical days | T3, T6 |

---

## Priority & Dependencies

```
T1 (Capacity Expansion)
 └──────────────────────────────────────┐
                                        ▼
T2 (Demand Forecast) ──────────────► T3 (Rolling Horizon Investment)
                                        ▲
T6 (Sector Coupling) ──────────────────┘  (sector loads inform investment)

T4 (Nodal Pricing)    — independent of T1/T3/T6, can start any time
T5 (Infrastructure)   — parallel track; T5-7 (clustering) needed before large T3/T6 runs
```

**Recommended order:**
1. **T1** — capacity expansion; highest standalone value
2. **T2** — demand forecast; prerequisite for T3
3. **T4** — nodal pricing; independent, high analytical value
4. **T6-1 to T6-6** — sector bus/link/load primitives (backbone of sector coupling)
5. **T3** — rolling horizon; most complex, depends on T1 + T2 + T5-7
6. **T6-7 to T6-12** — sector results/visualisation; depends on T3 + T6 backend
7. **T5** — implement items as they become blocking

---

## Technical Notes

- Rolling horizon (T3) requires **PyPSA ≥ 0.26** — check `pypsa.__version__`
- Annuity factor: `AF = r(1+r)^n / ((1+r)^n − 1)` where `r` = discount rate, `n` = lifetime in years
- Sector coupling multiplies model size: a 4-sector model is ~4× larger than electricity-only at the same time resolution; always pair with representative snapshot reduction (T5-7)
- T4 DC power flow requires non-zero `x` on lines; copper-plate remains the default fallback
- CHP link efficiency convention in PyPSA: `efficiency` = electrical efficiency, `efficiency2` = thermal efficiency; `bus2` = heat bus
- Rolling horizon loop pseudo-code:
  ```python
  fixed_p_nom = {}  # previously built capacity
  for window_start in investment_periods[::1]:
      window = investment_periods[window_start : window_start + rolling_window]
      n = build_multi_period_network(window, fixed_p_nom, demand[window])
      n.optimize(...)
      fixed_p_nom.update(extract_first_period_decisions(n))  # lock in decisions
  ```
