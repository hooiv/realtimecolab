import React, { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import { Vector3, Euler } from 'three';
import { animate } from 'animejs';
import { useAuth } from '../../context/AuthContext';
import { socket } from '../../services/socket';

// 3D Workspace component
const ThreeDWorkspace: React.FC = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    // Listen for user updates
    socket.on('users-update', (connectedUsers) => {
      setUsers(connectedUsers);
    });

    return () => {
      socket.off('users-update');
    };
  }, []);

  return (
    <group>
      {/* Workspace Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]} receiveShadow>
        <planeGeometry args={[50, 50]} />
        <meshStandardMaterial color="#303040" />
      </mesh>

      {/* Workspace Elements */}
      <WorkspaceElements />

      {/* User Avatars */}
      {users.map((user, index) => (
        <UserAvatar
          key={user.id}
          position={new Vector3(index * 2 - users.length, 0, -2)}
          username={user.username}
          color={user.color || '#61dafb'}
        />
      ))}

      {/* Current User Avatar */}
      {user && (
        <UserAvatar
          position={new Vector3(0, 0, 0)}
          username={user.username}
          color={user.color || '#61dafb'}
          isCurrentUser={true}
        />
      )}
    </group>
  );
};

// User Avatar Component
interface UserAvatarProps {
  position: Vector3;
  username: string;
  color: string;
  isCurrentUser?: boolean;
}

const UserAvatar: React.FC<UserAvatarProps> = ({ position, username, color, isCurrentUser = false }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const textRef = useRef<any>(null);

  useEffect(() => {
    if (meshRef.current) {
      // Animate avatar appearance
      animate({
        targets: meshRef.current.position,
        y: [position.y - 2, position.y],
        easing: 'easeOutElastic(1, .5)',
        duration: 1500
      });

      animate({
        targets: meshRef.current.rotation,
        y: [0, Math.PI * 2],
        easing: 'easeInOutQuad',
        duration: 2000
      });
    }
  }, []);

  useFrame(() => {
    if (meshRef.current && !isCurrentUser) {
      // Gentle floating animation for other users
      meshRef.current.position.y = position.y + Math.sin(Date.now() * 0.001) * 0.1;
      meshRef.current.rotation.y += 0.005;
    }

    if (textRef.current) {
      // Make text always face the camera
      textRef.current.lookAt(0, 0, 0);
    }
  });

  return (
    <group position={position}>
      <mesh ref={meshRef} castShadow>
        {isCurrentUser ? (
          <dodecahedronGeometry args={[0.5, 0]} />
        ) : (
          <boxGeometry args={[0.5, 0.5, 0.5]} />
        )}
        <meshStandardMaterial color={color} metalness={0.5} roughness={0.2} />
      </mesh>

      <group position={[0, 1, 0]} ref={textRef}>
        <Text
          position={[0, 0, 0]}
          fontSize={0.3}
          color="white"
          anchorX="center"
          anchorY="middle"
        >
          {username}
        </Text>
      </group>
    </group>
  );
};

// Workspace Elements Component
const WorkspaceElements: React.FC = () => {
  // This would contain your collaborative elements like boards, cards, etc.
  return (
    <group position={[0, 0, -5]}>
      {/* Example 3D Board */}
      <mesh position={[0, 1, 0]} castShadow>
        <boxGeometry args={[4, 3, 0.1]} />
        <meshStandardMaterial color="#2a3a4a" />
      </mesh>

      {/* Board Title */}
      <Text
        position={[0, 2.7, 0.1]}
        fontSize={0.3}
        color="white"
        anchorX="center"
        anchorY="middle"
      >
        Collaboration Board
      </Text>

      {/* Example Cards */}
      <TaskCard position={[-1.2, 1.5, 0.1]} title="Design UI" status="In Progress" />
      <TaskCard position={[0, 1.5, 0.1]} title="Implement 3D" status="In Progress" />
      <TaskCard position={[1.2, 1.5, 0.1]} title="Setup Backend" status="Todo" />
      <TaskCard position={[-1.2, 0.5, 0.1]} title="User Testing" status="Todo" />
      <TaskCard position={[0, 0.5, 0.1]} title="Documentation" status="Todo" />
      <TaskCard position={[1.2, 0.5, 0.1]} title="Deployment" status="Todo" />
    </group>
  );
};

// Task Card Component
interface TaskCardProps {
  position: [number, number, number];
  title: string;
  status: string;
}

const TaskCard: React.FC<TaskCardProps> = ({ position, title, status }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (meshRef.current) {
      animate({
        targets: meshRef.current.scale,
        x: hovered ? 1.1 : 1,
        y: hovered ? 1.1 : 1,
        z: hovered ? 1.1 : 1,
        easing: 'easeOutElastic(1, .5)',
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
        onClick={() => setActive(!active)}
        castShadow
      >
        <boxGeometry args={[1, 0.7, 0.05]} />
        <meshStandardMaterial
          color={status === "In Progress" ? "#61dafb" : "#bb86fc"}
          metalness={0.1}
          roughness={0.5}
        />
      </mesh>

      <Text
        position={[0, 0.1, 0.1]}
        fontSize={0.12}
        color="white"
        anchorX="center"
        anchorY="middle"
        maxWidth={0.8}
      >
        {title}
      </Text>

      <Text
        position={[0, -0.15, 0.1]}
        fontSize={0.08}
        color="#cccccc"
        anchorX="center"
        anchorY="middle"
      >
        {status}
      </Text>
    </group>
  );
};

export default ThreeDWorkspace;
