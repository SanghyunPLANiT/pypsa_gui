# PyPSA Studio — Technical Upgrade Roadmap

## Current State
- **Optimization**: Single-period economic dispatch (LP) only — no investment decisions
- **Capacity**: All component sizes fixed from workbook; `p_nom_extendable` never used
- **Pricing**: One system marginal price (SMP) shared across all buses (copper-plate model)
- **Demand**: Flat growth scalar applied uniformly; no multi-year or per-bus forecasting
- **Time horizon**: Single year, synthetic or workbook timestamps

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

## T3 · Multi-Year Investment Plan

**What**: Solve investment decisions across N discrete years in one LP; assets built/retired per period.  
**PyPSA**: `network.investment_periods` + `investment_period_weightings` (requires PyPSA ≥ 0.26).

| ID | Task | Layer |
|----|------|-------|
| T3-1 | Add `investment_periods` to RunPayload.options (list of years, e.g. `[2025, 2030, 2035]`) | Backend |
| T3-2 | Backend: construct multi-period PyPSA network (representative snapshots per period × years) | Backend |
| T3-3 | Add `build_year` / `retire_year` columns to generators sheet; map to PyPSA `active_i` logic | Workbook + Backend |
| T3-4 | Add WACC / `discount_rate` to scenario; compute period weightings for NPV objective | Backend |
| T3-5 | Handle existing assets retiring within horizon (`p_nom = 0` after `retire_year`) | Backend |
| T3-6 | Return per-period results: capacity built per year, annualised CAPEX stream, system NPV, LCOE/LCOS | Backend |
| T3-7 | Frontend: investment timeline chart — Gantt or bar chart of capacity additions by year | Frontend |
| T3-8 | Frontend: NPV / cost-of-supply summary table per investment period | Frontend |
| T3-9 | Frontend: new "Investment Plan" tab or section in Analytics pane | Frontend |

> **Dependency**: T3 requires T1 (extendable assets) and benefits from T2 (per-year demand).

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
| T4-4 | Frontend: LMP heat-map on Analytics map — bus circles coloured by average LMP (reuse `loadingColor` scale) | Frontend |
| T4-5 | Frontend: per-bus price duration curve in bus asset detail panel | Frontend |
| T4-6 | Frontend: congestion rent table in branch detail panel | Frontend |
| T4-7 | Workbook: add `x` (reactance, p.u.) column to lines sheet; add validation warning if missing when LMP mode active | Workbook + Validation |

> **Dependency**: Requires reactance data in the sample model and user workbooks.

---

## T5 · Supporting Infrastructure

Cross-cutting improvements that unlock or improve T1–T4.

| ID | Task | Needed by |
|----|------|-----------|
| T5-1 | Solver settings panel: choose solver (HiGHS / GLPK / Gurobi), time limit, MIP gap | T1, T3 |
| T5-2 | Result caching: store last N run results in `localStorage`; re-view without re-running | T3 |
| T5-3 | Scenario comparison: run two configs back-to-back, display side-by-side KPI diff | T1, T4 |
| T5-4 | Sensitivity sweep: vary one parameter (carbon price, demand growth) over a range → result plot | T1 |
| T5-5 | Validation: warn if extendable asset has `capital_cost = 0`; warn if lines missing `x` | T1, T4 |
| T5-6 | Progress / solve log: stream solver output to frontend during long runs (SSE or polling) | T1, T3 |

---

## Priority & Dependencies

```
T2 (Demand Forecast)
 └─► T3 (Multi-Year Investment)
        ▲
T1 (Capacity Expansion) ──────────────────────────►  T3

T4 (Nodal Pricing)       — independent, can start any time
T5 (Infrastructure)      — parallel track, items individually unblocked
```

**Recommended order:**
1. **T1** — highest standalone value; self-contained PyPSA feature
2. **T2** — prerequisite for T3; partial value as standalone
3. **T4** — independent; significant analytical value for network studies
4. **T3** — most complex; depends on T1 + T2
5. **T5** — implement items as they become blocking

---

## Technical Notes

- Multi-period (T3) requires **PyPSA ≥ 0.26** — check `pypsa.__version__` before enabling
- T4 DC power flow requires non-zero reactance on lines; copper-plate remains the default for models without line data
- Annuity factor formula: `AF = r(1+r)^n / ((1+r)^n − 1)` where `r` = discount rate, `n` = lifetime in years
- All T1–T3 changes require backend first, then results schema update, then frontend
