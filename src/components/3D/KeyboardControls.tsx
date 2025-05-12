import React, { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';

interface KeyboardControlsProps {
  moveSpeed?: number;
}

const KeyboardControls: React.FC<KeyboardControlsProps> = ({ moveSpeed = 0.1 }) => {
  const { camera } = useThree();
  const keys = useRef<{ [key: string]: boolean }>({});
  const isActive = useRef<boolean>(false);

  // Set up key event listeners
  useEffect(() => {
    console.log('[KeyboardControls] Setting up keyboard controls');
    
    const handleKeyDown = (event: KeyboardEvent) => {
      // Convert key to lowercase to handle both uppercase and lowercase
      const key = event.key.toLowerCase();
      
      // Only track WASD keys
      if (['w', 'a', 's', 'd'].includes(key)) {
        keys.current[key] = true;
        isActive.current = true;
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (['w', 'a', 's', 'd'].includes(key)) {
        keys.current[key] = false;
        
        // Check if any movement keys are still pressed
        isActive.current = Object.values(keys.current).some(value => value);
      }
    };

    // Add focus event to ensure controls work when clicking back into the window
    const handleFocus = () => {
      console.log('[KeyboardControls] Window focused');
      // Reset keys state when window regains focus
      keys.current = {};
      isActive.current = false;
    };

    // Add blur event to stop movement when window loses focus
    const handleBlur = () => {
      console.log('[KeyboardControls] Window blurred');
      // Reset keys state when window loses focus
      keys.current = {};
      isActive.current = false;
    };

    // Add event listeners
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    // Log initial setup
    console.log('[KeyboardControls] Keyboard controls initialized');

    // Clean up event listeners on unmount
    return () => {
      console.log('[KeyboardControls] Cleaning up keyboard controls');
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  // Apply movement on each frame
  useFrame(() => {
    if (!isActive.current) return;

    // Get camera direction
    const direction = new Vector3();
    camera.getWorldDirection(direction);
    direction.y = 0; // Keep movement on the horizontal plane
    direction.normalize();

    // Calculate right vector (perpendicular to direction)
    const right = new Vector3(-direction.z, 0, direction.x).normalize();

    // Calculate movement based on pressed keys
    const movement = new Vector3(0, 0, 0);

    if (keys.current['w']) {
      movement.add(direction.clone().multiplyScalar(moveSpeed));
    }
    if (keys.current['s']) {
      movement.add(direction.clone().multiplyScalar(-moveSpeed));
    }
    if (keys.current['a']) {
      movement.add(right.clone().multiplyScalar(-moveSpeed));
    }
    if (keys.current['d']) {
      movement.add(right.clone().multiplyScalar(moveSpeed));
    }

    // Apply movement to camera position
    if (movement.length() > 0) {
      camera.position.add(movement);
      console.log('[KeyboardControls] Camera position:', camera.position);
    }
  });

  // This component doesn't render anything
  return null;
};

export default KeyboardControls;
