/**
 * Optional PyPSA attribute catalogue.
 *
 * The data lives in pypsa_attributes.json — edit that file to add, remove,
 * or update attributes without touching TypeScript.
 *
 * Shape of each entry:
 *   col     – PyPSA DataFrame column name (must match exactly)
 *   label   – human-readable display label
 *   type    – 'number' | 'boolean' | 'string'
 *   default – sensible default value when the column is first added
 *   unit    – (optional) physical unit shown in the dropdown
 *   desc    – one-line description
 */
import rawAttrs from './pypsa_attributes.json';

export interface AttrDef {
  col: string;
  label: string;
  type: 'number' | 'boolean' | 'string';
  default: string | number | boolean;
  unit?: string;
  desc: string;
}

// Strip the meta keys (_comment, _schema) and cast to the typed map.
const { _comment: _c, _schema: _s, ...sheetAttrs } = rawAttrs as Record<string, unknown>;

export const PYPSA_OPTIONAL_ATTRS: Record<string, AttrDef[]> =
  sheetAttrs as Record<string, AttrDef[]>;
