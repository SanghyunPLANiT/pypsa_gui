import React from 'react';
import { ComponentType } from '../types/pypsa';

interface ContextMenuProps {
  x: number;
  y: number;
  onAddComponent: (type: ComponentType) => void;
  onClose: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, onAddComponent, onClose }) => {
  const componentTypes: ComponentType[] = [
    'Bus', 'Generator', 'Load', 'Line', 'Link', 'Transformer', 'StorageUnit', 'Store'
  ];

  return (
    <div 
      className="context-menu" 
      style={{ left: x, top: y }}
      onMouseLeave={onClose}
    >
      {componentTypes.map(type => (
        <div
          key={type}
          className="context-menu-item"
          onClick={() => onAddComponent(type)}
        >
          Add {type}
        </div>
      ))}
    </div>
  );
};

export default ContextMenu;