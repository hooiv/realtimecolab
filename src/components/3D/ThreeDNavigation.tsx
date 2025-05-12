import React, { useState, useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Text, Html } from '@react-three/drei';
import { Vector3 } from 'three';
import { animate } from 'animejs';
import './ThreeDNavigation.css';

interface NavigationPortalProps {
  position: [number, number, number];
  destination: string;
  label: string;
  onNavigate: (destination: string) => void;
}

// Portal to navigate between 3D spaces
const NavigationPortal: React.FC<NavigationPortalProps> = ({ 
  position, 
  destination, 
  label, 
  onNavigate 
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  
  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.01;
      meshRef.current.rotation.z = Math.sin(Date.now() * 0.001) * 0.1;
    }
  });
  
  useEffect(() => {
    if (meshRef.current) {
      animate({
        targets: meshRef.current.scale,
        x: hovered ? 1.2 : 1,
        y: hovered ? 1.2 : 1,
        z: hovered ? 1.2 : 1,
        easing: 'easeOutElastic(1, .5)',
        duration: 300
      });
      
      animate({
        targets: meshRef.current.material,
        emissiveIntensity: hovered ? 0.8 : 0.4,
        duration: 300
      });
    }
  }, [hovered]);
  
  return (
    <group position={position}>
      <mesh 
        ref={meshRef}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        onClick={() => onNavigate(destination)}
      >
        <torusGeometry args={[0.5, 0.2, 16, 32]} />
        <meshStandardMaterial 
          color="#61dafb" 
          emissive="#61dafb"
          emissiveIntensity={0.4}
          metalness={0.8}
          roughness={0.2}
        />
      </mesh>
      
      <Text
        position={[0, 0, 0]}
        fontSize={0.15}
        color="white"
        anchorX="center"
        anchorY="middle"
      >
        {label}
      </Text>
    </group>
  );
};

interface ThreeDNavigationProps {
  onNavigate: (destination: string) => void;
}

// Main navigation component
const ThreeDNavigation: React.FC<ThreeDNavigationProps> = ({ onNavigate }) => {
  const { camera } = useThree();
  const [showMenu, setShowMenu] = useState(false);
  
  // Position the menu relative to the camera
  const getMenuPosition = () => {
    const direction = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    return direction.multiplyScalar(3).add(camera.position);
  };
  
  return (
    <>
      {/* 3D Navigation Menu Toggle */}
      <Html position={[0, 0, 0]} center style={{ position: 'absolute', bottom: '20px', right: '20px' }}>
        <button 
          className="nav-toggle-button"
          onClick={() => setShowMenu(!showMenu)}
        >
          {showMenu ? 'Hide Menu' : 'Show Menu'}
        </button>
      </Html>
      
      {/* 3D Navigation Menu */}
      {showMenu && (
        <group position={getMenuPosition()}>
          <NavigationPortal 
            position={[-2, 0, 0]} 
            destination="kanban" 
            label="Kanban Board" 
            onNavigate={onNavigate} 
          />
          <NavigationPortal 
            position={[0, 0, 0]} 
            destination="chat" 
            label="Chat Room" 
            onNavigate={onNavigate} 
          />
          <NavigationPortal 
            position={[2, 0, 0]} 
            destination="documents" 
            label="Documents" 
            onNavigate={onNavigate} 
          />
          <NavigationPortal 
            position={[0, 2, 0]} 
            destination="dashboard" 
            label="Dashboard" 
            onNavigate={onNavigate} 
          />
          <NavigationPortal 
            position={[0, -2, 0]} 
            destination="settings" 
            label="Settings" 
            onNavigate={onNavigate} 
          />
        </group>
      )}
    </>
  );
};

export default ThreeDNavigation;
