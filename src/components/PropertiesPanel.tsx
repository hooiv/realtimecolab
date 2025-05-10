import React, { useState, useEffect } from 'react';
import * as THREE from 'three';
import { Socket } from 'socket.io-client'; // Assuming Socket type is imported from socket.io-client

interface PropertiesPanelProps {
  selectedObject: THREE.Mesh | null;
  socket: Socket | null;
}

// Define a type for the scale state
interface ScaleState {
  x: number;
  y: number;
  z: number;
}

const PropertiesPanel: React.FC<PropertiesPanelProps> = ({ selectedObject, socket }) => {
  const [color, setColor] = useState('#ffffff');
  const [scale, setScale] = useState<ScaleState>({ x: 1, y: 1, z: 1 }); // Initialize scale state

  useEffect(() => {
    if (selectedObject) {
      if (selectedObject.material instanceof THREE.MeshStandardMaterial) {
        setColor('#' + selectedObject.material.color.getHexString());
      }
      // Update scale state from selected object
      setScale({ x: selectedObject.scale.x, y: selectedObject.scale.y, z: selectedObject.scale.z });
    } else {
      // Reset state when no object is selected
      setColor('#ffffff'); // Default color
      setScale({ x: 1, y: 1, z: 1 }); // Default scale
    }
  }, [selectedObject]);

  const handleColorChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newColor = event.target.value;
    setColor(newColor);

    if (selectedObject && selectedObject.material instanceof THREE.MeshStandardMaterial && socket) {
      // Apply color locally immediately
      selectedObject.material.color.set(newColor);

      socket.emit('object-property-changed', {
        objectId: selectedObject.userData.sharedId,
        property: 'color',
        value: newColor, // Send as hex string
      });
    }
  };

  // Handler for scale changes
  const handleScaleChange = (axis: 'x' | 'y' | 'z', value: string) => {
    const newScaleValue = parseFloat(value);
    if (isNaN(newScaleValue) || !selectedObject || !socket) return;

    // Create a new scale object for the state and for emission
    const newScale = { ...scale, [axis]: newScaleValue };

    // Apply scale locally immediately
    selectedObject.scale[axis] = newScaleValue;
    setScale(newScale); // Update local React state

    socket.emit('object-property-changed', {
      objectId: selectedObject.userData.sharedId,
      property: 'scale',
      value: { // Send the full scale object
        x: selectedObject.scale.x,
        y: selectedObject.scale.y,
        z: selectedObject.scale.z,
      },
    });
  };

  if (!selectedObject) {
    return (
      <div style={{
        position: 'absolute',
        bottom: '20px',
        left: '20px',
        background: 'rgba(50, 50, 50, 0.7)',
        color: 'white',
        padding: '15px',
        borderRadius: '8px',
        zIndex: 200,
        fontFamily: 'Arial, sans-serif',
        width: '220px',
        boxShadow: '0 4px 8px rgba(0,0,0,0.3)'
      }}>
        <p style={{ margin: 0, textAlign: 'center' }}>No object selected</p>
      </div>
    );
  }

  return (
    <div style={{
      position: 'absolute',
      bottom: '20px',
      left: '20px',
      background: 'rgba(50, 50, 50, 0.9)',
      color: 'white',
      padding: '20px',
      borderRadius: '8px',
      zIndex: 200,
      fontFamily: 'Arial, sans-serif',
      width: '250px', // Adjusted width
      boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
    }}>
      <h4 style={{ marginTop: 0, marginBottom: '15px', borderBottom: '1px solid #555', paddingBottom: '10px' }}>
        Properties: <span style={{ fontWeight: 'normal' }}>{selectedObject.userData.sharedId}</span>
      </h4>
      <div style={{ marginBottom: '15px' }}>
        <label htmlFor="objectColor" style={{ marginRight: '10px', display: 'block', marginBottom: '5px' }}>Color:</label>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <input
            type="color"
            id="objectColor"
            value={color}
            onChange={handleColorChange}
            style={{ verticalAlign: 'middle', height: '30px', width: '50px', border: 'none', padding: '0', borderRadius: '4px' }}
          />
          <span style={{ marginLeft: '10px', verticalAlign: 'middle', background: '#444', padding: '5px 8px', borderRadius: '4px' }}>{color}</span>
        </div>
      </div>

      {/* Scale Controls */}
      <div style={{ marginBottom: '10px' }}>
        <label style={{ display: 'block', marginBottom: '5px' }}>Scale:</label>
        <div style={{ display: 'grid', gridTemplateColumns: '20px 1fr', gap: '5px 10px', alignItems: 'center' }}>
          <span>X:</span>
          <input
            type="number"
            step="0.1"
            value={scale.x}
            onChange={(e) => handleScaleChange('x', e.target.value)}
            style={{ width: '100%', padding: '5px', border: '1px solid #666', borderRadius: '4px', backgroundColor: '#444', color: '#fff' }}
          />
          <span>Y:</span>
          <input
            type="number"
            step="0.1"
            value={scale.y}
            onChange={(e) => handleScaleChange('y', e.target.value)}
            style={{ width: '100%', padding: '5px', border: '1px solid #666', borderRadius: '4px', backgroundColor: '#444', color: '#fff' }}
          />
          <span>Z:</span>
          <input
            type="number"
            step="0.1"
            value={scale.z}
            onChange={(e) => handleScaleChange('z', e.target.value)}
            style={{ width: '100%', padding: '5px', border: '1px solid #666', borderRadius: '4px', backgroundColor: '#444', color: '#fff' }}
          />
        </div>
      </div>
    </div>
  );
};

export default PropertiesPanel;
