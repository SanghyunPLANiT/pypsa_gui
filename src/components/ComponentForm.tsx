import React, { useState, useEffect } from 'react';
import { Component, PyPSANetwork, Bus } from '../types/pypsa';

interface ComponentFormProps {
  component: Component | null;
  network: PyPSANetwork;
  onUpdate: (component: Component) => void;
  onDelete: (componentId: string) => void;
}

const ComponentForm: React.FC<ComponentFormProps> = ({
  component,
  network,
  onUpdate,
  onDelete
}) => {
  const [formData, setFormData] = useState<any>({});

  useEffect(() => {
    if (component) {
      setFormData({ ...component });
    } else {
      setFormData({});
    }
  }, [component]);

  if (!component) {
    return (
      <div style={{ marginTop: '20px' }}>
        <h3>Component Editor</h3>
        <p>Right-click on the map to add components or select an existing component to edit.</p>
      </div>
    );
  }

  const handleInputChange = (field: string, value: any) => {
    const newFormData = { ...formData, [field]: value };
    setFormData(newFormData);
    onUpdate(newFormData);
  };

  const getComponentType = (): string => {
    if ('v_nom' in component) return 'Bus';
    if ('p_nom' in component && 'carrier' in component && 'marginal_cost' in component) return 'Generator';
    if ('p_set' in component) return 'Load';
    if ('bus0' in component && 'x' in component && 's_nom' in component) return 'Line';
    if ('bus0' in component && 'p_nom' in component && 'efficiency' in component) return 'Link';
    if ('bus0' in component && 'tap_ratio' in component) return 'Transformer';
    if ('max_hours' in component) return 'StorageUnit';
    return 'Store';
  };

  const renderBusSelector = (field: string, label: string) => (
    <div className="form-group">
      <label>{label}</label>
      <select
        value={formData[field] || ''}
        onChange={(e) => handleInputChange(field, e.target.value)}
      >
        <option value="">Select Bus</option>
        {network.buses.map(bus => (
          <option key={bus.id} value={bus.id}>
            {bus.name}
          </option>
        ))}
      </select>
    </div>
  );

  const renderForm = () => {
    const type = getComponentType();

    switch (type) {
      case 'Bus':
        return (
          <>
            <div className="form-group">
              <label>Name</label>
              <input
                type="text"
                value={formData.name || ''}
                onChange={(e) => handleInputChange('name', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Nominal Voltage (kV)</label>
              <input
                type="number"
                value={formData.v_nom || 0}
                onChange={(e) => handleInputChange('v_nom', parseFloat(e.target.value))}
              />
            </div>
            <div className="form-group">
              <label>Longitude</label>
              <input
                type="number"
                step="any"
                value={formData.x || 0}
                onChange={(e) => handleInputChange('x', parseFloat(e.target.value))}
              />
            </div>
            <div className="form-group">
              <label>Latitude</label>
              <input
                type="number"
                step="any"
                value={formData.y || 0}
                onChange={(e) => handleInputChange('y', parseFloat(e.target.value))}
              />
            </div>
            <div className="form-group">
              <label>Carrier</label>
              <select
                value={formData.carrier || 'AC'}
                onChange={(e) => handleInputChange('carrier', e.target.value)}
              >
                <option value="AC">AC</option>
                <option value="DC">DC</option>
                <option value="heat">Heat</option>
                <option value="gas">Gas</option>
              </select>
            </div>
            <div className="form-group">
              <label>Voltage Magnitude (p.u.)</label>
              <input
                type="number"
                step="0.01"
                value={formData.v_mag_pu_set || 1.0}
                onChange={(e) => handleInputChange('v_mag_pu_set', parseFloat(e.target.value))}
              />
            </div>
          </>
        );

      case 'Generator':
        return (
          <>
            <div className="form-group">
              <label>Name</label>
              <input
                type="text"
                value={formData.name || ''}
                onChange={(e) => handleInputChange('name', e.target.value)}
              />
            </div>
            {renderBusSelector('bus', 'Connected Bus')}
            <div className="form-group">
              <label>Nominal Power (MW)</label>
              <input
                type="number"
                value={formData.p_nom || 0}
                onChange={(e) => handleInputChange('p_nom', parseFloat(e.target.value))}
              />
            </div>
            <div className="form-group">
              <label>Carrier</label>
              <select
                value={formData.carrier || 'gas'}
                onChange={(e) => handleInputChange('carrier', e.target.value)}
              >
                <option value="gas">Gas</option>
                <option value="coal">Coal</option>
                <option value="nuclear">Nuclear</option>
                <option value="solar">Solar</option>
                <option value="wind">Wind</option>
                <option value="hydro">Hydro</option>
              </select>
            </div>
            <div className="form-group">
              <label>Min Power (p.u.)</label>
              <input
                type="number"
                step="0.01"
                value={formData.p_min_pu || 0}
                onChange={(e) => handleInputChange('p_min_pu', parseFloat(e.target.value))}
              />
            </div>
            <div className="form-group">
              <label>Max Power (p.u.)</label>
              <input
                type="number"
                step="0.01"
                value={formData.p_max_pu || 1}
                onChange={(e) => handleInputChange('p_max_pu', parseFloat(e.target.value))}
              />
            </div>
            <div className="form-group">
              <label>Efficiency</label>
              <input
                type="number"
                step="0.01"
                value={formData.efficiency || 0.4}
                onChange={(e) => handleInputChange('efficiency', parseFloat(e.target.value))}
              />
            </div>
            <div className="form-group">
              <label>Capital Cost (€/MW)</label>
              <input
                type="number"
                value={formData.capital_cost || 0}
                onChange={(e) => handleInputChange('capital_cost', parseFloat(e.target.value))}
              />
            </div>
            <div className="form-group">
              <label>Marginal Cost (€/MWh)</label>
              <input
                type="number"
                value={formData.marginal_cost || 50}
                onChange={(e) => handleInputChange('marginal_cost', parseFloat(e.target.value))}
              />
            </div>
          </>
        );

      case 'Load':
        return (
          <>
            <div className="form-group">
              <label>Name</label>
              <input
                type="text"
                value={formData.name || ''}
                onChange={(e) => handleInputChange('name', e.target.value)}
              />
            </div>
            {renderBusSelector('bus', 'Connected Bus')}
            <div className="form-group">
              <label>Active Power (MW)</label>
              <input
                type="number"
                value={formData.p_set || 0}
                onChange={(e) => handleInputChange('p_set', parseFloat(e.target.value))}
              />
            </div>
            <div className="form-group">
              <label>Reactive Power (MVAr)</label>
              <input
                type="number"
                value={formData.q_set || 0}
                onChange={(e) => handleInputChange('q_set', parseFloat(e.target.value))}
              />
            </div>
            <div className="form-group">
              <label>Carrier</label>
              <select
                value={formData.carrier || 'electricity'}
                onChange={(e) => handleInputChange('carrier', e.target.value)}
              >
                <option value="electricity">Electricity</option>
                <option value="heat">Heat</option>
                <option value="gas">Gas</option>
              </select>
            </div>
          </>
        );

      case 'Line':
        return (
          <>
            <div className="form-group">
              <label>Name</label>
              <input
                type="text"
                value={formData.name || ''}
                onChange={(e) => handleInputChange('name', e.target.value)}
              />
            </div>
            {renderBusSelector('bus0', 'From Bus')}
            {renderBusSelector('bus1', 'To Bus')}
            <div className="form-group">
              <label>Reactance (p.u.)</label>
              <input
                type="number"
                step="0.001"
                value={formData.x || 0.1}
                onChange={(e) => handleInputChange('x', parseFloat(e.target.value))}
              />
            </div>
            <div className="form-group">
              <label>Resistance (p.u.)</label>
              <input
                type="number"
                step="0.001"
                value={formData.r || 0.05}
                onChange={(e) => handleInputChange('r', parseFloat(e.target.value))}
              />
            </div>
            <div className="form-group">
              <label>Nominal Power (MVA)</label>
              <input
                type="number"
                value={formData.s_nom || 1000}
                onChange={(e) => handleInputChange('s_nom', parseFloat(e.target.value))}
              />
            </div>
            <div className="form-group">
              <label>Length (km)</label>
              <input
                type="number"
                value={formData.length || 100}
                onChange={(e) => handleInputChange('length', parseFloat(e.target.value))}
              />
            </div>
            <div className="form-group">
              <label>Number of Parallel Lines</label>
              <input
                type="number"
                value={formData.num_parallel || 1}
                onChange={(e) => handleInputChange('num_parallel', parseInt(e.target.value))}
              />
            </div>
          </>
        );

      case 'Link':
        return (
          <>
            <div className="form-group">
              <label>Name</label>
              <input
                type="text"
                value={formData.name || ''}
                onChange={(e) => handleInputChange('name', e.target.value)}
              />
            </div>
            {renderBusSelector('bus0', 'From Bus')}
            {renderBusSelector('bus1', 'To Bus')}
            <div className="form-group">
              <label>Nominal Power (MW)</label>
              <input
                type="number"
                value={formData.p_nom || 1000}
                onChange={(e) => handleInputChange('p_nom', parseFloat(e.target.value))}
              />
            </div>
            <div className="form-group">
              <label>Efficiency</label>
              <input
                type="number"
                step="0.01"
                value={formData.efficiency || 1.0}
                onChange={(e) => handleInputChange('efficiency', parseFloat(e.target.value))}
              />
            </div>
            <div className="form-group">
              <label>Carrier</label>
              <select
                value={formData.carrier || 'electricity'}
                onChange={(e) => handleInputChange('carrier', e.target.value)}
              >
                <option value="electricity">Electricity</option>
                <option value="heat">Heat</option>
                <option value="gas">Gas</option>
              </select>
            </div>
            <div className="form-group">
              <label>Marginal Cost (€/MWh)</label>
              <input
                type="number"
                value={formData.marginal_cost || 0}
                onChange={(e) => handleInputChange('marginal_cost', parseFloat(e.target.value))}
              />
            </div>
          </>
        );

      case 'StorageUnit':
        return (
          <>
            <div className="form-group">
              <label>Name</label>
              <input
                type="text"
                value={formData.name || ''}
                onChange={(e) => handleInputChange('name', e.target.value)}
              />
            </div>
            {renderBusSelector('bus', 'Connected Bus')}
            <div className="form-group">
              <label>Nominal Power (MW)</label>
              <input
                type="number"
                value={formData.p_nom || 100}
                onChange={(e) => handleInputChange('p_nom', parseFloat(e.target.value))}
              />
            </div>
            <div className="form-group">
              <label>Max Hours</label>
              <input
                type="number"
                value={formData.max_hours || 6}
                onChange={(e) => handleInputChange('max_hours', parseFloat(e.target.value))}
              />
            </div>
            <div className="form-group">
              <label>Store Efficiency</label>
              <input
                type="number"
                step="0.01"
                value={formData.efficiency_store || 0.9}
                onChange={(e) => handleInputChange('efficiency_store', parseFloat(e.target.value))}
              />
            </div>
            <div className="form-group">
              <label>Dispatch Efficiency</label>
              <input
                type="number"
                step="0.01"
                value={formData.efficiency_dispatch || 0.9}
                onChange={(e) => handleInputChange('efficiency_dispatch', parseFloat(e.target.value))}
              />
            </div>
          </>
        );

      default:
        return (
          <>
            <div className="form-group">
              <label>Name</label>
              <input
                type="text"
                value={formData.name || ''}
                onChange={(e) => handleInputChange('name', e.target.value)}
              />
            </div>
            {renderBusSelector('bus', 'Connected Bus')}
            <div className="form-group">
              <label>Energy Capacity (MWh)</label>
              <input
                type="number"
                value={formData.e_nom || 1000}
                onChange={(e) => handleInputChange('e_nom', parseFloat(e.target.value))}
              />
            </div>
            <div className="form-group">
              <label>Carrier</label>
              <select
                value={formData.carrier || 'electricity'}
                onChange={(e) => handleInputChange('carrier', e.target.value)}
              >
                <option value="electricity">Electricity</option>
                <option value="heat">Heat</option>
                <option value="gas">Gas</option>
              </select>
            </div>
          </>
        );
    }
  };

  return (
    <div style={{ marginTop: '20px' }}>
      <h3>{getComponentType()} Editor</h3>
      {renderForm()}
      <div className="button-group">
        <button
          className="btn btn-danger"
          onClick={() => onDelete(component.id)}
        >
          Delete
        </button>
      </div>
    </div>
  );
};

export default ComponentForm;