/**
 * SectorCouplingPanel
 *
 * Collapsible banner displayed above the Links table. Presents three preset
 * "bundles" (Power→Heat, Power→H₂, Power→EV). Each card has a small inline
 * form: pick a power bus + choose a prefix, then click Insert.
 */
import React, { useState } from 'react';
import { SectorBundle, SECTOR_BUNDLES } from '../../constants/sectorCouplingTemplates';

interface Props {
  busNames: string[];
  onInsert: (bundle: SectorBundle, powerBus: string, prefix: string) => void;
}

interface CardState {
  open: boolean;
  powerBus: string;
  prefix: string;
}

export function SectorCouplingPanel({ busNames, onInsert }: Props) {
  const [panelOpen, setPanelOpen] = useState(true);
  const [cards, setCards] = useState<Record<string, CardState>>(() =>
    Object.fromEntries(
      SECTOR_BUNDLES.map((b) => [
        b.id,
        { open: false, powerBus: busNames[0] ?? '', prefix: b.id },
      ]),
    ),
  );

  const setCard = (id: string, patch: Partial<CardState>) =>
    setCards((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  if (!panelOpen) {
    return (
      <button className="sc-panel-collapsed" onClick={() => setPanelOpen(true)}>
        Sector Coupling Templates
        <span className="sc-panel-collapsed-hint">click to expand</span>
      </button>
    );
  }

  return (
    <div className="sc-panel">
      <div className="sc-panel-header">
        <span className="sc-panel-title">Sector Coupling Templates</span>
        <span className="sc-panel-hint">
          Inserts pre-configured carriers, buses, loads and links
        </span>
        <button className="sc-panel-close" onClick={() => setPanelOpen(false)} title="Hide panel">
          ×
        </button>
      </div>

      <div className="sc-cards">
        {SECTOR_BUNDLES.map((bundle) => {
          const card = cards[bundle.id];
          return (
            <div key={bundle.id} className="sc-card">
              <div className="sc-card-header" onClick={() => setCard(bundle.id, { open: !card.open })}>
                <div className="sc-card-meta">
                  <div className="sc-card-label">{bundle.label}</div>
                  <div className="sc-card-desc">{bundle.description}</div>
                </div>
                <span className={`sc-card-chevron${card.open ? ' open' : ''}`}>›</span>
              </div>

              {card.open && (
                <div className="sc-card-form">
                  <label className="sc-form-row">
                    <span className="sc-form-label">Power bus</span>
                    <select
                      className="sc-form-select"
                      value={card.powerBus}
                      onChange={(e) => setCard(bundle.id, { powerBus: e.target.value })}
                    >
                      {busNames.length === 0 && (
                        <option value="">— no buses defined —</option>
                      )}
                      {busNames.map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </label>
                  <label className="sc-form-row">
                    <span className="sc-form-label">Prefix</span>
                    <input
                      className="sc-form-input"
                      type="text"
                      value={card.prefix}
                      onChange={(e) => setCard(bundle.id, { prefix: e.target.value.replace(/\s+/g, '_') })}
                      placeholder="e.g. sc1"
                    />
                  </label>
                  <button
                    className="sc-form-insert"
                    disabled={!card.powerBus || !card.prefix}
                    onClick={() => {
                      onInsert(bundle, card.powerBus, card.prefix);
                      setCard(bundle.id, { open: false });
                    }}
                  >
                    Insert
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
