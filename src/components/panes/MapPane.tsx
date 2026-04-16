import React from 'react';
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip } from 'react-leaflet';
import { LatLngBoundsExpression } from 'leaflet';
import { GridRow, WorkbookModel } from '../../types';
import { numberValue, stringValue, carrierColor } from '../../utils/helpers';
import { FitToBounds } from '../map/FitToBounds';
import { MapLegend } from '../map/MapLegend';

interface Props {
  model: WorkbookModel;
  bounds: LatLngBoundsExpression | null;
  busIndex: Record<string, GridRow>;
}

export function MapPane({ model, bounds, busIndex }: Props) {
  const uniqueCarriers = Array.from(
    new Set(model.generators.map((g) => stringValue(g.carrier)).filter(Boolean)),
  );
  const lineGeometries = model.lines
    .map((line) => {
      const bus0 = busIndex[stringValue(line.bus0)];
      const bus1 = busIndex[stringValue(line.bus1)];
      if (!bus0 || !bus1) return null;
      return {
        name: stringValue(line.name),
        positions: [[numberValue(bus0.y), numberValue(bus0.x)], [numberValue(bus1.y), numberValue(bus1.x)]] as [number, number][],
        sNom: numberValue(line.s_nom),
      };
    })
    .filter(Boolean) as Array<{ name: string; positions: [number, number][]; sNom: number }>;

  const linkGeometries = model.links
    .map((link) => {
      const bus0 = busIndex[stringValue(link.bus0)];
      const bus1 = busIndex[stringValue(link.bus1)];
      if (!bus0 || !bus1) return null;
      return {
        name: stringValue(link.name),
        positions: [[numberValue(bus0.y), numberValue(bus0.x)], [numberValue(bus1.y), numberValue(bus1.x)]] as [number, number][],
        pNom: numberValue(link.p_nom),
      };
    })
    .filter(Boolean) as Array<{ name: string; positions: [number, number][]; pNom: number }>;

  const transformerGeometries = model.transformers
    .map((transformer) => {
      const bus0 = busIndex[stringValue(transformer.bus0)];
      const bus1 = busIndex[stringValue(transformer.bus1)];
      if (!bus0 || !bus1) return null;
      return {
        name: stringValue(transformer.name),
        positions: [[numberValue(bus0.y), numberValue(bus0.x)], [numberValue(bus1.y), numberValue(bus1.x)]] as [number, number][],
      };
    })
    .filter(Boolean) as Array<{ name: string; positions: [number, number][] }>;

  return (
    <div className="pane">
      <div className="pane-header">
        <div>
          <p className="eyebrow">Network</p>
          <h2>Interactive grid map</h2>
        </div>
        <div className="inline-stats">
          <span>{model.buses.length} buses</span>
          <span>{model.lines.length} lines</span>
          <span>{model.links.length} links</span>
          <span>{model.transformers.length} transformers</span>
        </div>
      </div>
      <div className="map-frame" style={{ position: 'relative' }}>
        <MapContainer center={[36.35, 127.9]} zoom={7} className="leaflet-map" scrollWheelZoom>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          <FitToBounds bounds={bounds} />
          {lineGeometries.map((line) => (
            <Polyline key={line.name} positions={line.positions} pathOptions={{ color: '#2563eb', weight: 3, opacity: 0.72 }}>
              <Tooltip>{line.name} · {Math.round(line.sNom)} MVA</Tooltip>
            </Polyline>
          ))}
          {linkGeometries.map((link) => (
            <Polyline key={link.name} positions={link.positions} pathOptions={{ color: '#0f766e', weight: 4, opacity: 0.84, dashArray: '10 8' }}>
              <Tooltip>{link.name} · {Math.round(link.pNom)} MW link</Tooltip>
            </Polyline>
          ))}
          {transformerGeometries.map((transformer) => (
            <Polyline key={transformer.name} positions={transformer.positions} pathOptions={{ color: '#f97316', weight: 4, opacity: 0.78, dashArray: '8 6' }}>
              <Tooltip>{transformer.name} · Transformer</Tooltip>
            </Polyline>
          ))}
          {model.buses.map((bus, index) => (
            <CircleMarker
              key={`${stringValue(bus.name)}-${index}`}
              center={[numberValue(bus.y), numberValue(bus.x)]}
              radius={8}
              pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#2563eb', fillOpacity: 0.95 }}
            >
              <Tooltip sticky>
                <strong>{stringValue(bus.name)}</strong><br />
                {numberValue(bus.v_nom)} kV · {stringValue(bus.carrier)}
              </Tooltip>
            </CircleMarker>
          ))}
          {model.generators.map((generator, index) => {
            const bus = busIndex[stringValue(generator.bus)];
            if (!bus) return null;
            return (
              <CircleMarker
                key={`${stringValue(generator.name)}-${index}`}
                center={[numberValue(bus.y) + 0.07, numberValue(bus.x) + 0.07]}
                radius={5}
                pathOptions={{ color: '#ffffff', weight: 1.5, fillColor: carrierColor(stringValue(generator.carrier)), fillOpacity: 0.95 }}
              >
                <Tooltip>{stringValue(generator.name)} · {stringValue(generator.carrier)} · {Math.round(numberValue(generator.p_nom))} MW</Tooltip>
              </CircleMarker>
            );
          })}
        </MapContainer>
        <MapLegend carriers={uniqueCarriers} showLines />
      </div>
    </div>
  );
}
