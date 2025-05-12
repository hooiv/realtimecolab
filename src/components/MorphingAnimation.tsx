import React, { useEffect, useRef, useState } from 'react';
import './MorphingAnimation.css';

interface MorphingAnimationProps {
  id: string;
  className?: string;
  color?: string;
  strokeWidth?: number;
  duration?: number;
  autoPlay?: boolean;
}

// Completely rewritten component to avoid SVG path animation issues
const MorphingAnimation: React.FC<MorphingAnimationProps> = ({
  id,
  className = '',
  color = '#4299e1',
  strokeWidth = 2,
  duration = 3000,
  autoPlay = true
}) => {
  const [currentShape, setCurrentShape] = useState<number>(0);
  const intervalRef = useRef<number | null>(null);

  // Define simple shapes that don't use complex SVG path data
  const shapes = [
    // Circle
    <circle key="circle" cx="50" cy="50" r="40" fill="none" stroke={color} strokeWidth={strokeWidth} />,
    // Square
    <rect key="square" x="10" y="10" width="80" height="80" fill="none" stroke={color} strokeWidth={strokeWidth} />,
    // Triangle
    <polygon key="triangle" points="50,10 90,90 10,90" fill="none" stroke={color} strokeWidth={strokeWidth} />,
    // Diamond
    <polygon key="diamond" points="50,10 90,50 50,90 10,50" fill="none" stroke={color} strokeWidth={strokeWidth} />,
    // Hexagon
    <polygon key="hexagon" points="30,10 70,10 90,50 70,90 30,90 10,50" fill="none" stroke={color} strokeWidth={strokeWidth} />
  ];

  useEffect(() => {
    if (autoPlay) {
      // Use setInterval instead of anime.js for shape transitions
      intervalRef.current = window.setInterval(() => {
        setCurrentShape(prev => (prev + 1) % shapes.length);
      }, duration);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoPlay, duration, shapes.length]);

  return (
    <div className={`morphing-animation-container ${className}`}>
      <svg
        id={id}
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
        className="morphing-svg"
      >
        {/* Apply CSS transition for smooth morphing */}
        <g className="morphing-shape">
          {shapes[currentShape]}
        </g>
      </svg>
    </div>
  );
};

export default MorphingAnimation;
