/**
 * Sector coupling templates.
 *
 * Each SectorBundle describes a self-contained energy-sector extension:
 *   carriers  → rows for the carriers sheet
 *   buses     → rows for the buses sheet  (placeholders: {prefix}, {x}, {y})
 *   loads     → rows for the loads sheet  (placeholder: {prefix})
 *   links     → rows for the links sheet  (placeholders: {prefix}, {powerBus})
 *
 * App.tsx's handleAddSectorBundle() fills in the placeholders before merging.
 */

import { GridRow } from '../types';

export interface SectorBundle {
  id: string;
  label: string;
  description: string;
  carriers: GridRow[];
  buses: GridRow[];
  loads: GridRow[];
  links: GridRow[];
}

export const SECTOR_BUNDLES: SectorBundle[] = [
  // ── Power → Heat ────────────────────────────────────────────────────────────
  {
    id: 'pth',
    label: 'Power → Heat',
    description:
      'Electric boiler (η 0.99) + Heat pump (COP 3.0). Adds a heat bus and a heat load.',
    carriers: [
      { name: 'heat' },
      { name: 'power-to-heat' },
      { name: 'heat-pump' },
    ],
    buses: [
      { name: '{prefix}_heat_bus', carrier: 'heat', x: '{x}', y: '{y}', v_nom: 1 },
    ],
    loads: [
      { name: '{prefix}_heat_load', bus: '{prefix}_heat_bus', carrier: 'heat', p_set: 50 },
    ],
    links: [
      {
        name: '{prefix}_boiler',
        bus0: '{powerBus}',
        bus1: '{prefix}_heat_bus',
        carrier: 'power-to-heat',
        p_nom: 100,
        p_min_pu: 0,
        p_max_pu: 1,
        efficiency: 0.99,
        marginal_cost: 0,
      },
      {
        name: '{prefix}_heat_pump',
        bus0: '{powerBus}',
        bus1: '{prefix}_heat_bus',
        carrier: 'heat-pump',
        p_nom: 50,
        p_min_pu: 0,
        p_max_pu: 1,
        efficiency: 3.0,
        marginal_cost: 0,
      },
    ],
  },

  // ── Power → H₂ ──────────────────────────────────────────────────────────────
  {
    id: 'pth2',
    label: 'Power → H₂',
    description:
      'Electrolyzer (η 0.70) + Fuel cell (η 0.50). Adds an H₂ bus and an H₂ load.',
    carriers: [
      { name: 'H2' },
      { name: 'electrolyzer' },
      { name: 'fuel-cell' },
    ],
    buses: [
      { name: '{prefix}_h2_bus', carrier: 'H2', x: '{x}', y: '{y}', v_nom: 1 },
    ],
    loads: [
      { name: '{prefix}_h2_load', bus: '{prefix}_h2_bus', carrier: 'H2', p_set: 30 },
    ],
    links: [
      {
        name: '{prefix}_electrolyzer',
        bus0: '{powerBus}',
        bus1: '{prefix}_h2_bus',
        carrier: 'electrolyzer',
        p_nom: 100,
        p_min_pu: 0,
        p_max_pu: 1,
        efficiency: 0.70,
        marginal_cost: 0,
      },
      {
        name: '{prefix}_fuel_cell',
        bus0: '{prefix}_h2_bus',
        bus1: '{powerBus}',
        carrier: 'fuel-cell',
        p_nom: 50,
        p_min_pu: 0,
        p_max_pu: 1,
        efficiency: 0.50,
        marginal_cost: 0,
      },
    ],
  },

  // ── Power → EV ──────────────────────────────────────────────────────────────
  {
    id: 'ptev',
    label: 'Power → EV',
    description:
      'EV charging (η 0.90) + V2G discharge (η 0.85). Adds an EV bus and an EV load.',
    carriers: [
      { name: 'EV' },
      { name: 'EV-charging' },
      { name: 'V2G' },
    ],
    buses: [
      { name: '{prefix}_ev_bus', carrier: 'EV', x: '{x}', y: '{y}', v_nom: 1 },
    ],
    loads: [
      { name: '{prefix}_ev_load', bus: '{prefix}_ev_bus', carrier: 'EV', p_set: 40 },
    ],
    links: [
      {
        name: '{prefix}_ev_charging',
        bus0: '{powerBus}',
        bus1: '{prefix}_ev_bus',
        carrier: 'EV-charging',
        p_nom: 80,
        p_min_pu: 0,
        p_max_pu: 1,
        efficiency: 0.90,
        marginal_cost: 0,
      },
      {
        name: '{prefix}_v2g',
        bus0: '{prefix}_ev_bus',
        bus1: '{powerBus}',
        carrier: 'V2G',
        p_nom: 40,
        p_min_pu: 0,
        p_max_pu: 1,
        efficiency: 0.85,
        marginal_cost: 0,
      },
    ],
  },
];
