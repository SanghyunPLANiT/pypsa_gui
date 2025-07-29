export interface Bus {
  id: string;
  name: string;
  v_nom: number;
  x: number;
  y: number;
  carrier: string;
  v_mag_pu_set: number;
}

export interface Generator {
  id: string;
  name: string;
  bus: string;
  p_nom: number;
  carrier: string;
  p_min_pu: number;
  p_max_pu: number;
  efficiency: number;
  capital_cost: number;
  marginal_cost: number;
}

export interface Load {
  id: string;
  name: string;
  bus: string;
  p_set: number;
  q_set: number;
  carrier: string;
}

export interface Line {
  id: string;
  name: string;
  bus0: string;
  bus1: string;
  x: number;
  r: number;
  s_nom: number;
  length: number;
  num_parallel: number;
}

export interface Link {
  id: string;
  name: string;
  bus0: string;
  bus1: string;
  p_nom: number;
  efficiency: number;
  carrier: string;
  marginal_cost: number;
}

export interface Transformer {
  id: string;
  name: string;
  bus0: string;
  bus1: string;
  s_nom: number;
  x: number;
  tap_ratio: number;
  phase_shift: number;
}

export interface StorageUnit {
  id: string;
  name: string;
  bus: string;
  p_nom: number;
  max_hours: number;
  efficiency_store: number;
  efficiency_dispatch: number;
  state_of_charge_initial: number;
  cyclic_state_of_charge: boolean;
}

export interface Store {
  id: string;
  name: string;
  bus: string;
  e_nom: number;
  carrier: string;
  standing_losses: number;
  e_initial: number;
}

export type ComponentType = 'Bus' | 'Generator' | 'Load' | 'Line' | 'Link' | 'Transformer' | 'StorageUnit' | 'Store';

export type Component = Bus | Generator | Load | Line | Link | Transformer | StorageUnit | Store;

export interface PyPSANetwork {
  buses: Bus[];
  generators: Generator[];
  loads: Load[];
  lines: Line[];
  links: Link[];
  transformers: Transformer[];
  storage_units: StorageUnit[];
  stores: Store[];
}