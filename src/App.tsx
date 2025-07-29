import React, { useState, useCallback } from 'react';
import { MapContainer, TileLayer, useMapEvents } from 'react-leaflet';
import { LatLng } from 'leaflet';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import { PyPSANetwork, ComponentType, Component, Bus } from './types/pypsa';
import ComponentForm from './components/ComponentForm';
import ComponentMarkers from './components/ComponentMarkers';
import ContextMenu from './components/ContextMenu';
import 'leaflet/dist/leaflet.css';

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  latlng: LatLng | null;
}

function App() {
  const [network, setNetwork] = useState<PyPSANetwork>({
    buses: [],
    generators: [],
    loads: [],
    lines: [],
    links: [],
    transformers: [],
    storage_units: [],
    stores: []
  });

  const [selectedComponent, setSelectedComponent] = useState<Component | null>(null);
  const [selectedComponentType, setSelectedComponentType] = useState<ComponentType>('Bus');
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    latlng: null
  });
  const [connectionMode, setConnectionMode] = useState<'Line' | 'Link' | null>(null);
  const [firstSelectedBus, setFirstSelectedBus] = useState<string | null>(null);

  const MapEventHandler = () => {
    useMapEvents({
      contextmenu: (e) => {
        e.originalEvent.preventDefault();
        setContextMenu({
          visible: true,
          x: e.originalEvent.clientX,
          y: e.originalEvent.clientY,
          latlng: e.latlng
        });
      },
      click: () => {
        setContextMenu({ visible: false, x: 0, y: 0, latlng: null });
      }
    });
    return null;
  };

  const addComponent = useCallback((type: ComponentType, latlng: LatLng) => {
    const id = uuidv4();
    const newComponent: any = {
      id,
      name: `${type}_${id.slice(0, 8)}`,
    };

    if (type === 'Bus') {
      newComponent.v_nom = 230;
      newComponent.x = latlng.lng;
      newComponent.y = latlng.lat;
      newComponent.carrier = 'AC';
      newComponent.v_mag_pu_set = 1.0;
    } else if (['Generator', 'Load', 'StorageUnit', 'Store'].includes(type)) {
      newComponent.bus = '';
      if (type === 'Generator') {
        newComponent.p_nom = 100;
        newComponent.carrier = 'gas';
        newComponent.p_min_pu = 0;
        newComponent.p_max_pu = 1;
        newComponent.efficiency = 0.4;
        newComponent.capital_cost = 0;
        newComponent.marginal_cost = 50;
      } else if (type === 'Load') {
        newComponent.p_set = 100;
        newComponent.q_set = 0;
        newComponent.carrier = 'electricity';
      } else if (type === 'StorageUnit') {
        newComponent.p_nom = 100;
        newComponent.max_hours = 6;
        newComponent.efficiency_store = 0.9;
        newComponent.efficiency_dispatch = 0.9;
        newComponent.state_of_charge_initial = 0;
        newComponent.cyclic_state_of_charge = true;
      } else if (type === 'Store') {
        newComponent.e_nom = 1000;
        newComponent.carrier = 'electricity';
        newComponent.standing_losses = 0;
        newComponent.e_initial = 0;
      }
    } else if (['Line', 'Link', 'Transformer'].includes(type)) {
      newComponent.bus0 = '';
      newComponent.bus1 = '';
      if (type === 'Line') {
        newComponent.x = 0.1;
        newComponent.r = 0.05;
        newComponent.s_nom = 1000;
        newComponent.length = 100;
        newComponent.num_parallel = 1;
      } else if (type === 'Link') {
        newComponent.p_nom = 1000;
        newComponent.efficiency = 1.0;
        newComponent.carrier = 'electricity';
        newComponent.marginal_cost = 0;
      } else if (type === 'Transformer') {
        newComponent.s_nom = 1000;
        newComponent.x = 0.1;
        newComponent.tap_ratio = 1.0;
        newComponent.phase_shift = 0;
      }
    }

    setNetwork(prev => ({
      ...prev,
      [type.toLowerCase() + 's']: [...(prev as any)[type.toLowerCase() + 's'], newComponent]
    }));

    setSelectedComponent(newComponent);
    setContextMenu({ visible: false, x: 0, y: 0, latlng: null });
  }, []);

  const updateComponent = useCallback((updatedComponent: Component) => {
    const componentType = getComponentType(updatedComponent);
    const key = componentType.toLowerCase() + 's';
    
    setNetwork(prev => ({
      ...prev,
      [key]: (prev as any)[key].map((comp: Component) => 
        comp.id === updatedComponent.id ? updatedComponent : comp
      )
    }));
  }, []);

  const deleteComponent = useCallback((componentId: string) => {
    const componentTypes = ['buses', 'generators', 'loads', 'lines', 'links', 'transformers', 'storage_units', 'stores'];
    
    setNetwork(prev => {
      const newNetwork = { ...prev };
      componentTypes.forEach(type => {
        (newNetwork as any)[type] = (newNetwork as any)[type].filter((comp: Component) => comp.id !== componentId);
      });
      return newNetwork;
    });
    
    setSelectedComponent(null);
  }, []);

  const getComponentType = (component: Component): ComponentType => {
    if ('v_nom' in component) return 'Bus';
    if ('p_nom' in component && 'carrier' in component && 'marginal_cost' in component) return 'Generator';
    if ('p_set' in component) return 'Load';
    if ('bus0' in component && 'x' in component && 's_nom' in component) return 'Line';
    if ('bus0' in component && 'p_nom' in component && 'efficiency' in component) return 'Link';
    if ('bus0' in component && 'tap_ratio' in component) return 'Transformer';
    if ('max_hours' in component) return 'StorageUnit';
    return 'Store';
  };

  const exportToExcel = useCallback(() => {
    const workbook = XLSX.utils.book_new();

    Object.entries(network).forEach(([sheetName, data]) => {
      if (data.length > 0) {
        const worksheet = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      }
    });

    XLSX.writeFile(workbook, 'pypsa_network.xlsx');
  }, [network]);

  return (
    <div className="app">
      <div className="map-container">
        <MapContainer
          center={[40.7128, -74.0060]}
          zoom={10}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          <MapEventHandler />
          <ComponentMarkers 
            network={network} 
            onComponentSelect={setSelectedComponent}
            selectedComponent={selectedComponent}
            connectionMode={connectionMode}
            firstSelectedBus={firstSelectedBus}
            onBusSelect={(busId) => {
              if (connectionMode && !firstSelectedBus) {
                setFirstSelectedBus(busId);
              } else if (connectionMode && firstSelectedBus && busId !== firstSelectedBus) {
                const newId = uuidv4();
                const newConnection: any = {
                  id: newId,
                  name: `${connectionMode}_${newId.slice(0, 8)}`,
                  bus0: firstSelectedBus,
                  bus1: busId
                };

                if (connectionMode === 'Line') {
                  newConnection.x = 0.1;
                  newConnection.r = 0.05;
                  newConnection.s_nom = 1000;
                  newConnection.length = 100;
                  newConnection.num_parallel = 1;
                } else {
                  newConnection.p_nom = 1000;
                  newConnection.efficiency = 1.0;
                  newConnection.carrier = 'electricity';
                  newConnection.marginal_cost = 0;
                }

                setNetwork(prev => ({
                  ...prev,
                  [connectionMode.toLowerCase() + 's']: [...(prev as any)[connectionMode.toLowerCase() + 's'], newConnection]
                }));

                setConnectionMode(null);
                setFirstSelectedBus(null);
              }
            }}
          />
        </MapContainer>
        
        {contextMenu.visible && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            onAddComponent={(type) => contextMenu.latlng && addComponent(type, contextMenu.latlng)}
            onClose={() => setContextMenu({ visible: false, x: 0, y: 0, latlng: null })}
          />
        )}
      </div>

      <div className="right-panel">
        <div className="button-group">
          <button 
            className={`btn ${connectionMode === 'Line' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => {
              setConnectionMode(connectionMode === 'Line' ? null : 'Line');
              setFirstSelectedBus(null);
            }}
          >
            {connectionMode === 'Line' ? 'Cancel Line' : 'Add Line'}
          </button>
          <button 
            className={`btn ${connectionMode === 'Link' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => {
              setConnectionMode(connectionMode === 'Link' ? null : 'Link');
              setFirstSelectedBus(null);
            }}
          >
            {connectionMode === 'Link' ? 'Cancel Link' : 'Add Link'}
          </button>
        </div>

        <button className="btn btn-success" onClick={exportToExcel} style={{ width: '100%', marginTop: '10px' }}>
          Export to Excel
        </button>

        <ComponentForm
          component={selectedComponent}
          network={network}
          onUpdate={updateComponent}
          onDelete={deleteComponent}
        />
      </div>
    </div>
  );
}

export default App;