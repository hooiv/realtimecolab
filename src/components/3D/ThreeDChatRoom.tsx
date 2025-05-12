import React, { useState, useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Text, Html, PositionalAudio } from '@react-three/drei';
import { Vector3 } from 'three';
import { animate, utils } from 'animejs';
import { socket } from '../../services/socket';
import { useAuth } from '../../context/AuthContext';
import './ThreeDChatRoom.css';

// Types
interface ChatMessage {
  id: string;
  sender: string;
  content: string;
  timestamp: number;
  position: [number, number, number];
  color: string;
}

interface User3D {
  id: string;
  username: string;
  position: [number, number, number];
  color: string;
  speaking: boolean;
}

// Message Bubble Component
interface MessageBubbleProps {
  message: ChatMessage;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Animate message appearance
    setVisible(true);

    if (meshRef.current) {
      animate({
        targets: meshRef.current.scale,
        x: [0, 1],
        y: [0, 1],
        z: [0, 1],
        easing: 'easeOutElastic(1, .5)',
        duration: 1000
      });

      animate({
        targets: meshRef.current.position,
        y: [message.position[1] - 0.5, message.position[1]],
        easing: 'easeOutQuad',
        duration: 500
      });
    }

    // Auto-hide message after 10 seconds
    const timer = setTimeout(() => {
      if (meshRef.current) {
        animate({
          targets: meshRef.current.scale,
          x: [1, 0],
          y: [1, 0],
          z: [1, 0],
          easing: 'easeInQuad',
          duration: 500,
          complete: () => setVisible(false)
        });
      }
    }, 10000);

    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <group position={message.position}>
      <mesh ref={meshRef} castShadow>
        <sphereGeometry args={[0.3, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial
          color={message.color}
          transparent
          opacity={0.8}
        />
      </mesh>

      <Text
        position={[0, 0.4, 0]}
        fontSize={0.15}
        color="white"
        anchorX="center"
        anchorY="middle"
        maxWidth={2}
        outlineColor="black"
        outlineWidth={0.01}
      >
        {message.content}
      </Text>

      <Text
        position={[0, 0.6, 0]}
        fontSize={0.1}
        color="#aaaaaa"
        anchorX="center"
        anchorY="middle"
      >
        {message.sender}
      </Text>
    </group>
  );
};

// User Avatar Component
interface UserAvatarProps {
  user: User3D;
  isCurrentUser: boolean;
  onMove?: (position: [number, number, number]) => void;
}

const UserAvatar: React.FC<UserAvatarProps> = ({ user, isCurrentUser, onMove }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const audioRef = useRef<any>(null);
  const { camera } = useThree();
  const [dragging, setDragging] = useState(false);

  useFrame(({ mouse, viewport }) => {
    if (isCurrentUser && dragging && meshRef.current) {
      // Convert mouse position to 3D space
      const x = (mouse.x * viewport.width) / 2;
      const z = -(mouse.y * viewport.height) / 2;

      // Update avatar position
      meshRef.current.position.x = x;
      meshRef.current.position.z = z;

      // Emit position update
      if (onMove) {
        onMove([x, user.position[1], z]);
      }
    }

    // Make avatar gently float
    if (meshRef.current && !dragging) {
      meshRef.current.position.y = user.position[1] + Math.sin(Date.now() * 0.001) * 0.05;
    }

    // Update audio listener position for spatial audio
    if (isCurrentUser) {
      camera.position.copy(new Vector3(
        meshRef.current?.position.x || 0,
        meshRef.current?.position.y || 0 + 1.5, // Above the avatar
        meshRef.current?.position.z || 0 + 3    // Behind the avatar
      ));
      camera.lookAt(new Vector3(
        meshRef.current?.position.x || 0,
        meshRef.current?.position.y || 0,
        meshRef.current?.position.z || 0
      ));
    }
  });

  useEffect(() => {
    if (meshRef.current) {
      // Pulse effect when speaking
      if (user.speaking) {
        animate({
          targets: meshRef.current.scale,
          x: [1, 1.1, 1],
          y: [1, 1.1, 1],
          z: [1, 1.1, 1],
          easing: 'easeInOutQuad',
          duration: 300,
          loop: true
        });
      } else {
        // Stop animation
        utils.remove(meshRef.current);

        // Reset scale
        meshRef.current.scale.set(1, 1, 1);
      }
    }
  }, [user.speaking]);

  return (
    <group position={user.position}>
      <mesh
        ref={meshRef}
        onPointerDown={() => isCurrentUser && setDragging(true)}
        onPointerUp={() => isCurrentUser && setDragging(false)}
        castShadow
      >
        {isCurrentUser ? (
          <sphereGeometry args={[0.5, 32, 32]} />
        ) : (
          <boxGeometry args={[0.5, 0.5, 0.5]} />
        )}
        <meshStandardMaterial
          color={user.color}
          emissive={user.color}
          emissiveIntensity={user.speaking ? 0.5 : 0.2}
          metalness={0.5}
          roughness={0.2}
        />
      </mesh>

      <Text
        position={[0, 0.8, 0]}
        fontSize={0.2}
        color="white"
        anchorX="center"
        anchorY="middle"
        outlineColor="black"
        outlineWidth={0.01}
      >
        {user.username}
      </Text>

      {!isCurrentUser && user.speaking && (
        <PositionalAudio
          ref={audioRef}
          url="/audio/voice.mp3"
          distance={5}
          loop
        />
      )}
    </group>
  );
};

// Main Chat Room Component
const ThreeDChatRoom: React.FC = () => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [users, setUsers] = useState<User3D[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [currentUserPosition, setCurrentUserPosition] = useState<[number, number, number]>([0, 0, 0]);

  useEffect(() => {
    // Listen for new messages
    socket.on('chat-message', (message: ChatMessage) => {
      setMessages(prev => [...prev, message]);
    });

    // Listen for user updates
    socket.on('users-update', (connectedUsers: User3D[]) => {
      setUsers(connectedUsers);
    });

    // Initialize current user
    if (user) {
      const currentUser: User3D = {
        id: user.id,
        username: user.username,
        position: [0, 0, 0],
        color: user.color || '#61dafb',
        speaking: false
      };

      socket.emit('user-joined', currentUser);
    }

    return () => {
      socket.off('chat-message');
      socket.off('users-update');
    };
  }, [user]);

  const handleSendMessage = () => {
    if (!inputMessage.trim() || !user) return;

    const newMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: user.username,
      content: inputMessage,
      timestamp: Date.now(),
      position: [currentUserPosition[0], currentUserPosition[1] + 1, currentUserPosition[2]],
      color: user.color || '#61dafb'
    };

    // Emit message to server
    socket.emit('chat-message', newMessage);

    // Clear input
    setInputMessage('');
  };

  const handleUserMove = (position: [number, number, number]) => {
    setCurrentUserPosition(position);

    // Emit position update
    if (user) {
      socket.emit('user-move', {
        userId: user.id,
        position
      });
    }
  };

  return (
    <>
      {/* Chat Environment */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]} receiveShadow>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial color="#1a2a3a" />
      </mesh>

      {/* Chat Messages */}
      {messages.map(message => (
        <MessageBubble key={message.id} message={message} />
      ))}

      {/* User Avatars */}
      {users.map(u => (
        <UserAvatar
          key={u.id}
          user={u}
          isCurrentUser={user?.id === u.id}
          onMove={user?.id === u.id ? handleUserMove : undefined}
        />
      ))}

      {/* Chat Input */}
      <Html position={[0, -2, 0]} center>
        <div className="chat-input-container">
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder="Type a message..."
            className="chat-input"
          />
          <button onClick={handleSendMessage} className="chat-send-button">
            Send
          </button>
        </div>
      </Html>
    </>
  );
};

export default ThreeDChatRoom;
