# PyPSA Studio — Proposed Tasks

Prioritised backlog derived from gap analysis against commercial tools (Bayesian Energy / Convexity, PLEXOS).  
Each task is a separate feature branch + pull request.

---

## Priority 1 — Core usability (do these first)

### ✅ DONE — PR #1: Scenario Manager (`feature/scenario-manager`)
Named scenarios with editable parameters, per-scenario Run/Clone/Delete, and an automatic comparison table when ≥2 scenarios are complete.

---

### P1-1: Pre-built Results Dashboard
**Branch:** `feature/results-dashboard`

**Why:** After a run, the user currently has to manually assemble every chart in Analytics. Commercial tools show an instant dashboard. This is the single biggest UX gap.

**What to build:**
- Auto-generated dashboard rendered immediately when `tab === 'Analytics'` and results exist.
- Fixed sections (always shown, no configuration needed):
  1. **Dispatch stack** — stacked area chart of generation by carrier over all snapshots.
  2. **Capacity & energy mix donut** — installed MW by carrier (inner) / generated MWh by carrier (outer).
  3. **System cost breakdown** — horizontal bar or donut: fuel cost, carbon cost, capex, load shedding cost.
  4. **Load duration curve** — sorted demand curve (descending) for the run period.
  5. **Price duration curve** — sorted system marginal price curve.
  6. **Storage state of charge** — line chart of all storage units over time (if any exist).
- Each section is a collapsible card so the user can hide what they don't need.
- Summary KPI row at the top: total cost, total CO₂, RE share %, peak load shedding.

**Files to change:** `src/App.tsx` (new `ResultsDashboard` component), `src/index.css`.

---

### P1-2: Export to Excel / PDF
**Branch:** `feature/export`

**Why:** Every consultancy deliverable requires a shareable report. Currently there is no export at all.

**What to build:**
- **Excel export** (`Save Results` button in Analytics topbar):
  - Sheet per result type: dispatch series, generator summary, bus summary, branch loading, scenario params.
  - Uses the same XLSX.js library already in the project.
- **PDF export** (`Export PDF` button):
  - Uses `window.print()` + a `@media print` CSS stylesheet that hides the nav/topbar and renders the Results Dashboard cleanly on A4/letter.
  - Alternatively use `html2canvas` + `jsPDF` for a proper PDF.
- Format: timestamped filename, scenario name in header of every sheet/page.

**Files to change:** `src/App.tsx`, `src/index.css`, possibly `package.json` (jsPDF dependency).

---

### P1-3: Constraint Inspector (Shadow Prices)
**Branch:** `feature/constraint-inspector`

**Why:** "Why did the model dispatch coal at 14:00?" is the most common question from clients. Bayesian Energy calls this their key differentiator — a transparent, auditable engine.

**What to build:**
- Backend: extend `/api/run` response to include:
  - `shadowPrices`: per-snapshot bus marginal price (already partially available via `buses_t.marginal_price`).
  - `bindingConstraints`: list of global constraints that are binding (dual > 0), with their shadow price.
  - `generatorMarginalCost`: effective marginal cost per generator (fuel + carbon).
- Frontend: new collapsible section in the Analytics Results Dashboard called **"Constraint Inspector"**:
  - Table of binding constraints with shadow price and interpretation.
  - Generator merit order table: generators ranked by effective marginal cost, showing which ones set the price at each hour.
  - Highlight the price-setting generator on the map.

**Files to change:** `backend/lib/results/dispatch.py`, `backend/lib/results/assets/buses.py`, `src/App.tsx`.

---

## Priority 2 — Analysis depth

### P2-1: Load & Price Duration Curves
**Branch:** `feature/duration-curves`

**Why:** Duration curves are a standard deliverable in every power system study. They should be part of the default results, not something the user has to build manually.

**What to build:**
- A dedicated **"Duration Curves"** section in the Results Dashboard (part of P1-1, or as a standalone tab section).
- Charts:
  - **Load duration curve**: total system demand, sorted descending, x-axis = hours, y-axis = MW.
  - **Price duration curve**: system marginal price sorted descending.
  - **Generation duration curve**: per-carrier stacked, showing how many hours each carrier runs at various output levels.
- Allow user to toggle between the full run period and custom time windows.
- Exportable as CSV.

**Files to change:** `src/App.tsx` (new chart components), `src/index.css`.

---

### P2-2: Capacity Expansion Mode
**Branch:** `feature/capacity-expansion`

**Why:** PyPSA natively supports `p_nom_extendable = True` on generators/lines/storage. Exposing this in the UI unlocks long-term planning studies, which is the primary use case for PLEXOS long-term.

**What to build:**
- In the Tables tab, generators/lines/storage_units sheet: add a checkbox column `extendable` that sets `p_nom_extendable = True`.
- Add `p_nom_max` column (upper bound on expansion).
- In Scenarios tab, add a **"Expansion mode"** toggle per scenario. When on, the solver minimises total cost including annualised capital cost.
- After run, Results Dashboard shows a new section: **"Optimal Expansion"** — table and bar chart of how much capacity was added per component.
- Backend: pass `p_nom_extendable` through the workbook parser; the PyPSA network already handles it natively.

**Files to change:** `backend/lib/network/generators.py`, `backend/lib/network/lines.py`, `backend/lib/network/storage.py`, `backend/lib/results/dispatch.py`, `src/App.tsx`.

---

### P2-3: Multi-Year / Rolling Horizon
**Branch:** `feature/multi-year`

**Why:** Most planning studies cover 10–30 years. Currently only a single period is supported.

**What to build:**
- In Scenarios tab: add `Planning horizon` field (start year, end year, step years).
- Backend: run one PyPSA solve per planning year, passing demand growth compounded year-over-year.
- Aggregate results across years: cost trajectory, capacity trajectory, emissions trajectory.
- New Analytics section: **"Planning horizon"** — line charts of total cost and CO₂ over time.

**Files to change:** `backend/main.py`, `backend/lib/network/__init__.py`, `src/App.tsx`.

---

### P2-4: Stochastic / Monte Carlo Runs
**Branch:** `feature/stochastic`

**Why:** Real-world studies test robustness against weather uncertainty (wind/solar variability) and demand variability. PLEXOS has this as a core feature.

**What to build:**
- In Scenarios tab: add **"Stochastic"** checkbox. When enabled, show `N samples` input (default 10).
- Backend: resample the `generators-p_max_pu` time-series using bootstrap or parametric noise, run N solves, return P10/P50/P90 statistics per output metric.
- Frontend: Results Dashboard shows confidence bands (shaded area) on dispatch and cost charts.

**Files to change:** `backend/main.py`, `backend/lib/network/generators.py`, `src/App.tsx`.

---

## Priority 3 — Collaboration & governance

### P3-1: Audit Trail / Version History
**Branch:** `feature/audit-trail`

**Why:** Regulatory and consultancy work requires knowing who changed what and when. Required for ISO/NERC compliance studies.

**What to build:**
- Every edit to the workbook (cell change, row add/delete) is appended to an in-memory log: `{ timestamp, sheet, row, col, oldValue, newValue }`.
- A new **"History"** panel (accessible from a button in the Tables tab header) shows the log as a timeline.
- "Undo" reverts the last N edits.
- On Save/Save As, the audit log is embedded in the Excel file as a hidden sheet `_audit_log`.

**Files to change:** `src/App.tsx` (edit handlers, history state), `src/index.css`.

---

### P3-2: Read-only Share Link
**Branch:** `feature/share-link`

**Why:** Clients need to review results without being able to accidentally modify the model. PLEXOS and Bayesian both support this.

**What to build:**
- "Share results" button in Analytics topbar.
- Serialise `results` + `scenarios` + `model` into a compressed base64 URL fragment (`#data=...`) or a short server-side token.
- A read-only viewer mode that hides all edit controls when the URL fragment is present.
- Alternatively: export a static HTML file containing the dashboard and all chart data, which can be emailed.

**Files to change:** `src/App.tsx`, possibly a new `/api/share` endpoint.

---

### P3-3: Model Templates Library
**Branch:** `feature/templates`

**Why:** Reduces onboarding time from hours to minutes. Both Bayesian and PLEXOS ship pre-built datasets.

**What to build:**
- A "New from template" dialog (replaces the current "Demo" button).
- Templates stored as `.xlsx` files in `public/templates/`:
  - `island_system.xlsx` — simple 3-bus isolated grid.
  - `national_grid.xlsx` — the current Korea demo model.
  - `storage_sizing.xlsx` — single bus, variable renewables, battery sizing problem.
  - `capacity_expansion.xlsx` — greenfield planning with extendable generators.
- Each template ships with a `README` sheet explaining its purpose and expected results.

**Files to change:** `public/templates/`, `src/App.tsx` (template dialog component).

---

## Priority 4 — Advanced modelling

### P4-1: Multi-Commodity (Gas / Hydrogen)
**Branch:** `feature/multi-commodity`

**Why:** Gas networks affect electricity dispatch (gas price → generator marginal cost). Hydrogen is increasingly relevant for long-term decarbonisation studies. PLEXOS co-optimises electricity + gas.

**What to build:**
- New workbook sheets: `gas_nodes`, `gas_pipes`, `gas_demand`, `electrolyser`, `fuel_cell`.
- Backend: build a coupled electricity + gas network using PyPSA's multi-carrier support (`Bus` with `carrier='gas'`, `Link` for conversion).
- Frontend: Map tab shows gas nodes and pipes in a different colour layer with a toggle.

**Files to change:** New `backend/lib/network/gas.py`, `src/App.tsx`, workbook schema.

---

### P4-2: AI Output Explanation
**Branch:** `feature/ai-explanation`

**Why:** Both Bayesian and PLEXOS now ship an in-platform AI assistant. For non-expert users this dramatically lowers the barrier to interpreting results.

**What to build:**
- "Explain results" button in Analytics, calls `/api/explain` endpoint.
- Backend: format key result metrics into a structured prompt, send to an LLM (Anthropic Claude API), stream the response.
- Frontend: render the streamed response as a markdown narrative below the KPI summary row.
- Cover: why did cost increase vs. base case, which constraint was binding, what drove RE curtailment.

**Files to change:** `backend/main.py` (new `/api/explain` endpoint), `src/App.tsx`.

---

## Quick wins (< 1 day each, do any time)

| ID | Task | Why |
|----|------|-----|
| QW-1 | Generator colour legend on map | Users can't tell which dot is which carrier |
| QW-2 | Line loading colour scale on Analytics map | Lines should be red/amber/green by % loading |
| QW-3 | Search/filter in Tables left nav | Hard to find components in large models (193 buses) |
| QW-4 | Keyboard shortcut `Ctrl+R` to open Run dialog | Power users expect this |
| QW-5 | Toast notifications instead of status bar text | Status bar is too easy to miss |
| QW-6 | Dark mode | Toggle in topbar; CSS variables are already set up for it |
| QW-7 | Freeze first column in spreadsheet grid | Hard to navigate wide tables without it |
| QW-8 | Copy/paste rows in Tables tab | Essential for editing large workbooks |

---

## Architecture notes

- **Frontend:** React/TypeScript CRA, no state management library. If state grows much further (multi-user, persistence), consider Zustand.
- **Backend:** FastAPI + PyPSA. For stochastic/multi-year runs, add a task queue (Celery or `asyncio` background tasks) so the frontend doesn't time out on long solves.
- **Persistence:** Currently everything is in-memory. For audit trail and share links, add a lightweight SQLite store via `aiosqlite`.
- **Testing:** No tests exist yet. Add `pytest` for backend validators and `React Testing Library` for critical UI flows before P2 work begins.
