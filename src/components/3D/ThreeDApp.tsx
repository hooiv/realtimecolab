import React, { useState, useRef, useEffect, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import {
  OrbitControls,
  PerspectiveCamera,
  Environment,
  Stars,
  Sky,
  Cloud,
  Html,
  useProgress,
  Loader
} from '@react-three/drei';
import { animate } from 'animejs';
import { useAuth } from '../../context/AuthContext';
import { useSocketInitializer, setSocket } from '../../services/socket';
import ThreeDWorkspace from './ThreeDWorkspace';
import ThreeDNavigation from './ThreeDNavigation';
import ThreeDKanban from './ThreeDKanban';
import ThreeDChatRoom from './ThreeDChatRoom';
import SimpleTest from './SimpleTest';
import KeyboardControls from './KeyboardControls';
import './ThreeDApp.css';

// Loading screen
const LoadingScreen = () => {
  const { progress } = useProgress();
  // Use a fixed width to avoid re-rendering issues
  const progressWidth = Math.floor(progress);

  return (
    <Html center>
      <div className="loading-screen">
        <h2>Loading 3D Environment</h2>
        <div className="progress-bar">
          <div
            className="progress-bar-fill"
            style={{ width: `${progressWidth}%` }}
          ></div>
        </div>
        <p>{progressWidth}%</p>
      </div>
    </Html>
  );
};

// Background effects
const BackgroundEffects = () => {
  return (
    <>
      <Stars radius={100} depth={50} count={5000} factor={4} fade speed={1} />
      <Sky distance={450000} sunPosition={[0, 1, 0]} inclination={0} azimuth={0.25} />

      <Cloud
        opacity={0.5}
        speed={0.4}
        width={10}
        depth={1.5}
        segments={20}
        position={[-10, 10, -15]}
      />

      <Cloud
        opacity={0.3}
        speed={0.3}
        width={8}
        depth={2}
        segments={15}
        position={[10, 5, -10]}
      />
    </>
  );
};

// Animated camera movement
const AnimatedCamera = ({ target }: { target: [number, number, number] }) => {
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const [animating, setAnimating] = useState(false);
  const [currentTarget, setCurrentTarget] = useState<[number, number, number]>(target);

  useEffect(() => {
    if (cameraRef.current && target !== currentTarget) {
      setAnimating(true);

      animate({
        targets: cameraRef.current.position,
        x: [cameraRef.current.position.x, target[0] + 5],
        y: [cameraRef.current.position.y, target[1] + 3],
        z: [cameraRef.current.position.z, target[2] + 8],
        easing: 'easeInOutQuad',
        duration: 2000,
        complete: () => {
          setAnimating(false);
          setCurrentTarget(target);
        }
      });
    }
  }, [target]);

  return (
    <PerspectiveCamera
      ref={cameraRef}
      makeDefault
      position={[5, 3, 8]}
      fov={75}
    />
  );
};

// Main 3D App Component
const ThreeDApp: React.FC = () => {
  const { user } = useAuth();
  const { initSocket } = useSocketInitializer();

  // Initialize socket when component mounts
  useEffect(() => {
    console.log('Initializing socket for 3D app');
    initSocket();
  }, []);

  return (
    <div className="three-d-app">
      <Canvas
        shadows
        camera={{ position: [0, 2, 8], fov: 75 }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
          stencil: false,
          depth: true
        }}
      >
        <color attach="background" args={['#202030']} />
        <fog attach="fog" args={['#202030', 5, 30]} />
        <ambientLight intensity={0.4} />
        <directionalLight
          position={[5, 5, 5]}
          intensity={0.5}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />

        <Suspense fallback={<LoadingScreen />}>
          {/* Environment and background */}
          <Environment preset="night" />
          <BackgroundEffects />

          {/* Simple test cube to verify 3D is working */}
          <SimpleTest />

          {/* Floor */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]} receiveShadow>
            <planeGeometry args={[50, 50]} />
            <meshStandardMaterial color="#303040" />
          </mesh>
        </Suspense>

        {/* Controls */}
        <OrbitControls
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={Math.PI / 2}
          minDistance={2}
          maxDistance={20}
        />

        {/* Keyboard Controls for WASD movement */}
        <KeyboardControls moveSpeed={0.15} />
      </Canvas>

      {/* External loader */}
      <Loader />

      {/* Keyboard controls indicator */}
      <div className="keyboard-controls-indicator">
        <div>Movement Controls</div>
        <div className="key-row">
          <span className="keyboard-key">W</span>
        </div>
        <div className="key-row">
          <span className="keyboard-key">A</span>
          <span className="keyboard-key">S</span>
          <span className="keyboard-key">D</span>
        </div>
      </div>

      {/* Help button */}
      <div className="help-button" style={{ bottom: '20px' }}>
        <button onClick={() => alert('Controls:\n\nMovement: Use W (forward), A (left), S (backward), D (right) keys to move\nCamera: Click and drag with mouse to look around\nZoom: Use mouse wheel to zoom in/out\nInteraction: Click on objects to select them')}>
          Help
        </button>
      </div>

      {/* User info */}
      {user && (
        <div className="user-info">
          <div className="user-avatar" style={{ backgroundColor: user.color || '#61dafb' }}></div>
          <span>{user.username}</span>
        </div>
      )}
    </div>
  );
};

export default ThreeDApp;
