export const SHEETS = [
  'network', 'snapshots', 'carriers', 'buses', 'generators', 'loads',
  'links', 'lines', 'stores', 'storage_units', 'transformers',
  'shunt_impedances', 'global_constraints', 'shapes', 'processes',
] as const;

export const TS_SHEETS = [
  'generators-p_max_pu',
  'generators-p_min_pu',
  'loads-p_set',
  'storage_units-inflow',
  'links-p_max_pu',
] as const;
