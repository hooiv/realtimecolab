import React, { useRef, useState, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Text, Html, useCursor } from '@react-three/drei';
import { Vector3 } from 'three';
import { animate, utils } from 'animejs';
import { socket } from '../../services/socket';
import './ThreeDKanban.css';

// Types
interface KanbanCard {
  id: string;
  title: string;
  description: string;
  status: string;
  assignee?: string;
  color: string;
  position: [number, number, number];
}

interface KanbanColumn {
  id: string;
  title: string;
  position: [number, number, number];
  cards: KanbanCard[];
}

// Card Component
interface CardProps {
  card: KanbanCard;
  onDragStart: (card: KanbanCard) => void;
  onDragEnd: (card: KanbanCard, columnId: string) => void;
  onCardClick: (card: KanbanCard) => void;
}

const KanbanCard3D: React.FC<CardProps> = ({ card, onDragStart, onDragEnd, onCardClick }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const { camera } = useThree();
  
  useCursor(hovered);
  
  useEffect(() => {
    if (meshRef.current) {
      animate({
        targets: meshRef.current.scale,
        x: hovered ? 1.05 : 1,
        y: hovered ? 1.05 : 1,
        z: hovered ? 1.05 : 1,
        easing: 'easeOutElastic(1, .5)',
        duration: 300
      });
    }
  }, [hovered]);
  
  useFrame(({ mouse, viewport }) => {
    if (dragging && meshRef.current) {
      // Convert mouse position to 3D space
      const x = (mouse.x * viewport.width) / 2;
      const y = (mouse.y * viewport.height) / 2;
      
      // Update card position
      meshRef.current.position.x = x;
      meshRef.current.position.y = y;
      meshRef.current.position.z = 0.5; // Bring forward while dragging
    }
  });
  
  const handleDragStart = () => {
    setDragging(true);
    onDragStart(card);
  };
  
  const handleDragEnd = (columnId: string) => {
    setDragging(false);
    if (meshRef.current) {
      const newPosition: [number, number, number] = [
        meshRef.current.position.x,
        meshRef.current.position.y,
        meshRef.current.position.z
      ];
      
      const updatedCard = { ...card, position: newPosition };
      onDragEnd(updatedCard, columnId);
    }
  };
  
  return (
    <group position={card.position}>
      <mesh 
        ref={meshRef}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        onClick={() => onCardClick(card)}
        onPointerDown={handleDragStart}
        onPointerUp={() => handleDragEnd(card.status)}
        castShadow
      >
        <boxGeometry args={[1.8, 1, 0.1]} />
        <meshStandardMaterial 
          color={card.color} 
          metalness={0.1} 
          roughness={0.6}
          transparent
          opacity={0.9}
        />
      </mesh>
      
      <Text
        position={[0, 0.2, 0.06]}
        fontSize={0.15}
        color="white"
        anchorX="center"
        anchorY="middle"
        maxWidth={1.5}
      >
        {card.title}
      </Text>
      
      <Text
        position={[0, -0.1, 0.06]}
        fontSize={0.1}
        color="#cccccc"
        anchorX="center"
        anchorY="middle"
        maxWidth={1.5}
      >
        {card.description.substring(0, 50)}
        {card.description.length > 50 ? '...' : ''}
      </Text>
      
      {card.assignee && (
        <Text
          position={[0, -0.3, 0.06]}
          fontSize={0.08}
          color="#aaaaaa"
          anchorX="center"
          anchorY="middle"
        >
          {`Assigned to: ${card.assignee}`}
        </Text>
      )}
    </group>
  );
};

// Column Component
interface ColumnProps {
  column: KanbanColumn;
  onCardDragStart: (card: KanbanCard) => void;
  onCardDragEnd: (card: KanbanCard, columnId: string) => void;
  onCardClick: (card: KanbanCard) => void;
  onAddCard: (columnId: string) => void;
}

const KanbanColumn3D: React.FC<ColumnProps> = ({ 
  column, 
  onCardDragStart, 
  onCardDragEnd, 
  onCardClick,
  onAddCard
}) => {
  return (
    <group position={column.position}>
      {/* Column Header */}
      <mesh position={[0, 2, 0]} castShadow>
        <boxGeometry args={[2.5, 0.5, 0.1]} />
        <meshStandardMaterial color="#2a3a4a" />
      </mesh>
      
      <Text
        position={[0, 2, 0.06]}
        fontSize={0.2}
        color="white"
        anchorX="center"
        anchorY="middle"
      >
        {column.title}
      </Text>
      
      {/* Column Body */}
      <mesh position={[0, 0, 0]} receiveShadow>
        <boxGeometry args={[2.5, 4, 0.05]} />
        <meshStandardMaterial 
          color="#1a2a3a" 
          transparent
          opacity={0.7}
        />
      </mesh>
      
      {/* Cards */}
      {column.cards.map((card, index) => (
        <KanbanCard3D
          key={card.id}
          card={{
            ...card,
            position: [0, 1.5 - index * 1.2, 0.1]
          }}
          onDragStart={onCardDragStart}
          onDragEnd={onCardDragEnd}
          onCardClick={onCardClick}
        />
      ))}
      
      {/* Add Card Button */}
      <Html position={[0, -1.8, 0.1]}>
        <button 
          className="add-card-button"
          onClick={() => onAddCard(column.id)}
        >
          + Add Card
        </button>
      </Html>
    </group>
  );
};

// Main Kanban Board Component
const ThreeDKanban: React.FC = () => {
  const [columns, setColumns] = useState<KanbanColumn[]>([
    {
      id: 'todo',
      title: 'To Do',
      position: [-5, 0, 0],
      cards: [
        {
          id: 'card1',
          title: 'Implement 3D UI',
          description: 'Create immersive 3D user interface',
          status: 'todo',
          assignee: 'John',
          color: '#bb86fc',
          position: [0, 0, 0]
        },
        {
          id: 'card2',
          title: 'Design Avatars',
          description: 'Create user avatars for 3D space',
          status: 'todo',
          assignee: 'Sarah',
          color: '#03dac6',
          position: [0, 0, 0]
        }
      ]
    },
    {
      id: 'inprogress',
      title: 'In Progress',
      position: [0, 0, 0],
      cards: [
        {
          id: 'card3',
          title: 'Real-time Sync',
          description: 'Implement real-time synchronization',
          status: 'inprogress',
          assignee: 'Mike',
          color: '#61dafb',
          position: [0, 0, 0]
        }
      ]
    },
    {
      id: 'done',
      title: 'Done',
      position: [5, 0, 0],
      cards: [
        {
          id: 'card4',
          title: 'Project Setup',
          description: 'Initialize project and dependencies',
          status: 'done',
          assignee: 'Lisa',
          color: '#4facfe',
          position: [0, 0, 0]
        }
      ]
    }
  ]);
  
  const [activeCard, setActiveCard] = useState<KanbanCard | null>(null);
  const [showCardDetails, setShowCardDetails] = useState(false);
  
  useEffect(() => {
    // Listen for board updates from other users
    socket.on('kanban-update', (updatedColumns) => {
      setColumns(updatedColumns);
    });
    
    return () => {
      socket.off('kanban-update');
    };
  }, []);
  
  const handleCardDragStart = (card: KanbanCard) => {
    setActiveCard(card);
  };
  
  const handleCardDragEnd = (card: KanbanCard, newColumnId: string) => {
    // Update card status
    const updatedCard = { ...card, status: newColumnId };
    
    // Update columns
    const updatedColumns = columns.map(column => {
      // Remove card from old column
      if (column.id === card.status) {
        return {
          ...column,
          cards: column.cards.filter(c => c.id !== card.id)
        };
      }
      
      // Add card to new column
      if (column.id === newColumnId) {
        return {
          ...column,
          cards: [...column.cards, updatedCard]
        };
      }
      
      return column;
    });
    
    setColumns(updatedColumns);
    setActiveCard(null);
    
    // Emit update to other users
    socket.emit('kanban-update', updatedColumns);
  };
  
  const handleCardClick = (card: KanbanCard) => {
    setActiveCard(card);
    setShowCardDetails(true);
  };
  
  const handleAddCard = (columnId: string) => {
    const newCard: KanbanCard = {
      id: `card${Date.now()}`,
      title: 'New Card',
      description: 'Add description here',
      status: columnId,
      color: '#61dafb',
      position: [0, 0, 0]
    };
    
    const updatedColumns = columns.map(column => {
      if (column.id === columnId) {
        return {
          ...column,
          cards: [...column.cards, newCard]
        };
      }
      return column;
    });
    
    setColumns(updatedColumns);
    
    // Emit update to other users
    socket.emit('kanban-update', updatedColumns);
  };
  
  return (
    <>
      {/* Kanban Columns */}
      {columns.map(column => (
        <KanbanColumn3D
          key={column.id}
          column={column}
          onCardDragStart={handleCardDragStart}
          onCardDragEnd={handleCardDragEnd}
          onCardClick={handleCardClick}
          onAddCard={handleAddCard}
        />
      ))}
      
      {/* Card Details Modal */}
      {showCardDetails && activeCard && (
        <Html center position={[0, 0, 2]}>
          <div className="card-details-modal">
            <h2>{activeCard.title}</h2>
            <p>{activeCard.description}</p>
            {activeCard.assignee && <p>Assigned to: {activeCard.assignee}</p>}
            <button onClick={() => setShowCardDetails(false)}>Close</button>
          </div>
        </Html>
      )}
    </>
  );
};

export default ThreeDKanban;
