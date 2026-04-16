import React from 'react';
import { Marker, Popup, Polyline } from 'react-leaflet';
import { Icon, LatLng } from 'leaflet';
import { PyPSANetwork, Component, Bus } from '../types/pypsa';

interface ComponentMarkersProps {
  network: PyPSANetwork;
  onComponentSelect: (component: Component) => void;
  selectedComponent: Component | null;
  connectionMode: 'Line' | 'Link' | null;
  firstSelectedBus: string | null;
  onBusSelect: (busId: string) => void;
}

const createIcon = (type: string, isSelected: boolean = false) => {
  const colors: { [key: string]: string } = {
    Bus: isSelected ? '#ff0000' : '#007bff',
    Generator: isSelected ? '#ff0000' : '#28a745',
    Load: isSelected ? '#ff0000' : '#ffc107',
    StorageUnit: isSelected ? '#ff0000' : '#6f42c1',
    Store: isSelected ? '#ff0000' : '#17a2b8'
  };

  return new Icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(`
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
        <circle cx="10" cy="10" r="8" fill="${colors[type] || '#6c757d'}" stroke="white" stroke-width="2"/>
        <text x="10" y="14" text-anchor="middle" fill="white" font-size="8" font-weight="bold">
          ${type.charAt(0)}
        </text>
      </svg>
    `)}`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -10]
  });
};

const ComponentMarkers: React.FC<ComponentMarkersProps> = ({
  network,
  onComponentSelect,
  selectedComponent,
  connectionMode,
  firstSelectedBus,
  onBusSelect
}) => {
  const getBusPosition = (busId: string): LatLng | null => {
    const bus = network.buses.find(b => b.id === busId);
    return bus ? new LatLng(bus.y, bus.x) : null;
  };

  const renderConnections = () => {
    const connections: React.ReactElement[] = [];

    network.lines.forEach(line => {
      const pos0 = getBusPosition(line.bus0);
      const pos1 = getBusPosition(line.bus1);
      if (pos0 && pos1) {
        connections.push(
          <Polyline
            key={line.id}
            positions={[pos0, pos1]}
            color="#007bff"
            weight={3}
            opacity={0.7}
          />
        );
      }
    });

    network.links.forEach(link => {
      const pos0 = getBusPosition(link.bus0);
      const pos1 = getBusPosition(link.bus1);
      if (pos0 && pos1) {
        connections.push(
          <Polyline
            key={link.id}
            positions={[pos0, pos1]}
            color="#28a745"
            weight={3}
            opacity={0.7}
            dashArray="5, 5"
          />
        );
      }
    });

    network.transformers.forEach(transformer => {
      const pos0 = getBusPosition(transformer.bus0);
      const pos1 = getBusPosition(transformer.bus1);
      if (pos0 && pos1) {
        connections.push(
          <Polyline
            key={transformer.id}
            positions={[pos0, pos1]}
            color="#ffc107"
            weight={4}
            opacity={0.7}
          />
        );
      }
    });

    return connections;
  };

  return (
    <>
      {renderConnections()}
      
      {network.buses.map(bus => (
        <Marker
          key={bus.id}
          position={[bus.y, bus.x]}
          icon={createIcon('Bus', selectedComponent?.id === bus.id || firstSelectedBus === bus.id)}
          eventHandlers={{
            click: () => {
              if (connectionMode) {
                onBusSelect(bus.id);
              } else {
                onComponentSelect(bus);
              }
            }
          }}
        >
          <Popup>
            <div>
              <strong>{bus.name}</strong><br />
              Type: Bus<br />
              Voltage: {bus.v_nom} kV<br />
              Carrier: {bus.carrier}
            </div>
          </Popup>
        </Marker>
      ))}

      {network.generators.map(gen => {
        const bus = network.buses.find(b => b.id === gen.bus);
        if (!bus) return null;
        
        return (
          <Marker
            key={gen.id}
            position={[bus.y + 0.001, bus.x + 0.001]}
            icon={createIcon('Generator', selectedComponent?.id === gen.id)}
            eventHandlers={{
              click: () => onComponentSelect(gen)
            }}
          >
            <Popup>
              <div>
                <strong>{gen.name}</strong><br />
                Type: Generator<br />
                Power: {gen.p_nom} MW<br />
                Carrier: {gen.carrier}
              </div>
            </Popup>
          </Marker>
        );
      })}

      {network.loads.map(load => {
        const bus = network.buses.find(b => b.id === load.bus);
        if (!bus) return null;
        
        return (
          <Marker
            key={load.id}
            position={[bus.y - 0.001, bus.x - 0.001]}
            icon={createIcon('Load', selectedComponent?.id === load.id)}
            eventHandlers={{
              click: () => onComponentSelect(load)
            }}
          >
            <Popup>
              <div>
                <strong>{load.name}</strong><br />
                Type: Load<br />
                Power: {load.p_set} MW<br />
                Carrier: {load.carrier}
              </div>
            </Popup>
          </Marker>
        );
      })}

      {network.storage_units.map(storage => {
        const bus = network.buses.find(b => b.id === storage.bus);
        if (!bus) return null;
        
        return (
          <Marker
            key={storage.id}
            position={[bus.y + 0.002, bus.x - 0.001]}
            icon={createIcon('StorageUnit', selectedComponent?.id === storage.id)}
            eventHandlers={{
              click: () => onComponentSelect(storage)
            }}
          >
            <Popup>
              <div>
                <strong>{storage.name}</strong><br />
                Type: Storage Unit<br />
                Power: {storage.p_nom} MW<br />
                Hours: {storage.max_hours}
              </div>
            </Popup>
          </Marker>
        );
      })}

      {network.stores.map(store => {
        const bus = network.buses.find(b => b.id === store.bus);
        if (!bus) return null;
        
        return (
          <Marker
            key={store.id}
            position={[bus.y - 0.002, bus.x + 0.001]}
            icon={createIcon('Store', selectedComponent?.id === store.id)}
            eventHandlers={{
              click: () => onComponentSelect(store)
            }}
          >
            <Popup>
              <div>
                <strong>{store.name}</strong><br />
                Type: Store<br />
                Energy: {store.e_nom} MWh<br />
                Carrier: {store.carrier}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
};

export default ComponentMarkers;