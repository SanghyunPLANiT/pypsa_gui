/**
 * Known optional PyPSA attributes per sheet that are NOT in the default row
 * template but can be added by the user.
 *
 * Grouped by sheet name.  Each entry has:
 *   col       – column name (must match PyPSA's DataFrame column name)
 *   label     – human-readable display label
 *   type      – expected value type  ('number' | 'boolean' | 'string')
 *   default   – sensible default value when the column is first added
 *   unit      – optional unit string shown in the tooltip
 *   desc      – one-line description of what this attribute does
 */

export interface AttrDef {
  col: string;
  label: string;
  type: 'number' | 'boolean' | 'string';
  default: string | number | boolean;
  unit?: string;
  desc: string;
}

export const PYPSA_OPTIONAL_ATTRS: Partial<Record<string, AttrDef[]>> = {
  // ── Generators ─────────────────────────────────────────────────────────────
  generators: [
    { col: 'extendable',      label: 'Extendable',           type: 'boolean', default: false,   desc: 'Allow PyPSA to optimise p_nom (capacity expansion)' },
    { col: 'asset_lifetime',  label: 'Asset lifetime',       type: 'number',  default: 20,      unit: 'yr',    desc: 'Lifetime in years — used to annualise capital_cost' },
    { col: 'p_nom_max',       label: 'Max buildable capacity', type: 'number', default: 10000,  unit: 'MW',    desc: 'Upper bound on p_nom_opt when extendable=true' },
    { col: 'ramp_limit_up',   label: 'Ramp up limit',        type: 'number',  default: 1.0,     unit: 'pu/h',  desc: 'Max increase in output per hour as fraction of p_nom' },
    { col: 'ramp_limit_down', label: 'Ramp down limit',      type: 'number',  default: 1.0,     unit: 'pu/h',  desc: 'Max decrease in output per hour as fraction of p_nom' },
    { col: 'min_up_time',     label: 'Min up time',          type: 'number',  default: 0,       unit: 'h',     desc: 'Minimum consecutive hours a unit must stay on (MIP)' },
    { col: 'min_down_time',   label: 'Min down time',        type: 'number',  default: 0,       unit: 'h',     desc: 'Minimum consecutive hours a unit must stay off (MIP)' },
    { col: 'start_up_cost',   label: 'Start-up cost',        type: 'number',  default: 0,       unit: '$',     desc: 'One-off cost each time unit is started (MIP)' },
    { col: 'shut_down_cost',  label: 'Shut-down cost',       type: 'number',  default: 0,       unit: '$',     desc: 'One-off cost each time unit is shut down (MIP)' },
    { col: 'p_nom_extendable',label: 'p_nom_extendable (raw)',type: 'boolean', default: false,  desc: 'PyPSA raw flag — prefer using the extendable column above' },
    { col: 'build_year',      label: 'Build year',           type: 'number',  default: 2025,    unit: 'yr',    desc: 'Year the asset is commissioned (multi-period investment)' },
    { col: 'retire_year',     label: 'Retire year',          type: 'number',  default: 2050,    unit: 'yr',    desc: 'Year the asset retires (multi-period investment)' },
    { col: 'efficiency',      label: 'Efficiency',           type: 'number',  default: 1.0,     unit: 'pu',    desc: 'Conversion efficiency (used for Links; ignored for Generators)' },
  ],

  // ── Loads ──────────────────────────────────────────────────────────────────
  loads: [
    { col: 'p_min_pu',  label: 'Min load (pu)',  type: 'number',  default: 0.0,  unit: 'pu',  desc: 'Minimum load as fraction of p_set' },
    { col: 'sign',      label: 'Sign',           type: 'number',  default: -1,               desc: 'Convention sign: -1 = load (consuming), +1 = generator' },
  ],

  // ── Lines ──────────────────────────────────────────────────────────────────
  lines: [
    { col: 'x',           label: 'Reactance',           type: 'number', default: 0.15,  unit: 'pu',  desc: 'Series reactance — required for DC power flow and nodal pricing' },
    { col: 'r',           label: 'Resistance',          type: 'number', default: 0.03,  unit: 'pu',  desc: 'Series resistance — used in AC power flow (lossless in DC)' },
    { col: 'g',           label: 'Shunt conductance',   type: 'number', default: 0,     unit: 'pu',  desc: 'Shunt conductance (AC only)' },
    { col: 'b',           label: 'Susceptance',         type: 'number', default: 0,     unit: 'pu',  desc: 'Shunt susceptance — charging current (AC only)' },
    { col: 's_max_pu',    label: 'Max loading (pu)',     type: 'number', default: 1.0,   unit: 'pu',  desc: 'Fraction of s_nom that can be used continuously' },
    { col: 'terrain_factor', label: 'Terrain factor',   type: 'number', default: 1.0,              desc: 'Cost multiplier for terrain (used in cost models)' },
    { col: 's_nom_extendable', label: 'Extendable line', type: 'boolean', default: false,          desc: 'Allow PyPSA to optimise line capacity' },
    { col: 's_nom_max',   label: 'Max line capacity',   type: 'number', default: 10000, unit: 'MVA', desc: 'Upper bound on s_nom_opt when extendable' },
    { col: 'capital_cost',label: 'Capital cost',        type: 'number', default: 0,     unit: '$/MVA', desc: 'Overnight capital cost per MVA (for extendable lines)' },
  ],

  // ── Links ──────────────────────────────────────────────────────────────────
  links: [
    { col: 'bus2',        label: 'Bus 2 (secondary output)', type: 'string',  default: '',        desc: 'Second output bus for multi-output links (e.g. CHP heat output)' },
    { col: 'bus3',        label: 'Bus 3 (tertiary output)',  type: 'string',  default: '',        desc: 'Third output bus (e.g. CHP + district heat + cooling)' },
    { col: 'efficiency2', label: 'Efficiency 2',             type: 'number',  default: 1.0,       desc: 'Conversion efficiency to bus2 (e.g. thermal efficiency of CHP)' },
    { col: 'efficiency3', label: 'Efficiency 3',             type: 'number',  default: 1.0,       desc: 'Conversion efficiency to bus3' },
    { col: 'p_nom_extendable', label: 'Extendable link',     type: 'boolean', default: false,     desc: 'Allow PyPSA to optimise link capacity' },
    { col: 'capital_cost', label: 'Capital cost',            type: 'number',  default: 0,  unit: '$/MW', desc: 'Overnight capital cost per MW' },
    { col: 'build_year',  label: 'Build year',               type: 'number',  default: 2025, unit: 'yr', desc: 'Year the link is commissioned' },
  ],

  // ── Storage units ──────────────────────────────────────────────────────────
  storage_units: [
    { col: 'extendable',      label: 'Extendable',             type: 'boolean', default: false,  desc: 'Allow PyPSA to optimise p_nom' },
    { col: 'asset_lifetime',  label: 'Asset lifetime',         type: 'number',  default: 15,   unit: 'yr',  desc: 'Lifetime in years for annuity calculation' },
    { col: 'capital_cost',    label: 'Capital cost',           type: 'number',  default: 0,    unit: '$/MW', desc: 'Overnight capital cost per MW (annualised via lifetime)' },
    { col: 'p_nom_max',       label: 'Max buildable capacity', type: 'number',  default: 10000, unit: 'MW',  desc: 'Upper bound on p_nom_opt when extendable' },
    { col: 'inflow',          label: 'Inflow',                 type: 'number',  default: 0,    unit: 'MW',  desc: 'Natural inflow (hydro reservoir)' },
    { col: 'spill_cost',      label: 'Spill cost',             type: 'number',  default: 0,    unit: '$/MWh', desc: 'Cost per MWh of energy spilled (hydro overflow)' },
    { col: 'p_min_pu_fixed',  label: 'Min dispatch (pu)',      type: 'number',  default: 0,    unit: 'pu',  desc: 'Minimum dispatch as fraction of p_nom' },
    { col: 'build_year',      label: 'Build year',             type: 'number',  default: 2025, unit: 'yr',  desc: 'Year the storage unit is commissioned' },
  ],

  // ── Stores ─────────────────────────────────────────────────────────────────
  stores: [
    { col: 'e_nom_extendable', label: 'Extendable store',      type: 'boolean', default: false,  desc: 'Allow PyPSA to optimise e_nom (energy capacity)' },
    { col: 'e_nom_max',        label: 'Max energy capacity',   type: 'number',  default: 100000, unit: 'MWh', desc: 'Upper bound on e_nom_opt when extendable' },
    { col: 'capital_cost',     label: 'Capital cost',          type: 'number',  default: 0,      unit: '$/MWh', desc: 'Overnight capital cost per MWh' },
    { col: 'e_cyclic',         label: 'Cyclic energy',         type: 'boolean', default: false,  desc: 'Enforce that initial and final energy level are equal' },
  ],

  // ── Buses ──────────────────────────────────────────────────────────────────
  buses: [
    { col: 'control',        label: 'Bus control',    type: 'string',  default: 'PQ',   desc: 'PQ (load bus), PV (voltage-controlled), or Slack (angle reference)' },
    { col: 'v_mag_pu_set',   label: 'Voltage setpoint', type: 'number', default: 1.0,  unit: 'pu',  desc: 'Target voltage magnitude (PV and Slack buses)' },
    { col: 'sub_network',    label: 'Sub-network',    type: 'string',  default: '',                 desc: 'Sub-network identifier for disconnected islands' },
    { col: 'unit',           label: 'Unit',           type: 'string',  default: 'kV',               desc: 'Physical unit of v_nom (display only)' },
  ],

  // ── Carriers ───────────────────────────────────────────────────────────────
  carriers: [
    { col: 'co2_emissions',   label: 'CO₂ emissions',  type: 'number', default: 0,  unit: 'tCO₂/MWh_th', desc: 'CO₂ emissions per MWh of primary energy input' },
    { col: 'color',           label: 'Colour',          type: 'string', default: '#94a3b8',             desc: 'Hex colour for charts (optional)' },
    { col: 'nice_name',       label: 'Display name',    type: 'string', default: '',                    desc: 'Human-readable name for charts' },
  ],

  // ── Global constraints ─────────────────────────────────────────────────────
  global_constraints: [
    { col: 'investment_period', label: 'Investment period', type: 'string', default: '',     desc: 'Restrict constraint to a specific investment period (multi-year)' },
  ],

  // ── Transformers ───────────────────────────────────────────────────────────
  transformers: [
    { col: 's_nom_extendable', label: 'Extendable transformer', type: 'boolean', default: false, desc: 'Allow PyPSA to optimise transformer capacity' },
    { col: 'capital_cost',     label: 'Capital cost',           type: 'number',  default: 0,  unit: '$/MVA', desc: 'Overnight capital cost per MVA' },
  ],
};
