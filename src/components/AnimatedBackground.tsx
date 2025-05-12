import React, { useEffect, useRef } from 'react';
import { animate, utils, stagger } from 'animejs';
import './AnimatedBackground.css';

interface AnimatedBackgroundProps {
  id: string;
}

const AnimatedBackground: React.FC<AnimatedBackgroundProps> = ({ id }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Clear existing dots if any
    containerRef.current.innerHTML = '';

    // Create dots
    const dotCount = 40;
    const colors = ['#FF4B4B', '#6B8CFF', '#FFD166', '#06D6A0'];

    for (let i = 0; i < dotCount; i++) {
      const dot = document.createElement('div');
      dot.classList.add('animated-dot');
      dot.style.width = `${Math.random() * 15 + 5}px`;
      dot.style.height = dot.style.width;
      dot.style.background = colors[Math.floor(Math.random() * colors.length)];
      dot.style.opacity = (Math.random() * 0.5 + 0.1).toString();
      dot.style.position = 'absolute';
      dot.style.borderRadius = '50%';
      dot.style.top = `${Math.random() * 100}%`;
      dot.style.left = `${Math.random() * 100}%`;
      dot.style.pointerEvents = 'none';
      dot.style.zIndex = '0';
      containerRef.current.appendChild(dot);
    }

    // Animate dots
    animate('.animated-dot', {
      translateX: () => utils.random(-150, 150),
      translateY: () => utils.random(-150, 150),
      scale: () => utils.random(0.1, 1.5, 3),
      easing: 'easeInOutQuad',
      duration: () => utils.random(3000, 7000),
      delay: stagger(200), // Using stagger for sequential animation
      loop: true,
      direction: 'alternate',
    });

    // Clean up
    return () => {
      utils.remove('.animated-dot');
    };
  }, []);

  return (
    <div
      id={id}
      ref={containerRef}
      style={{
        position: 'absolute',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        top: 0,
        left: 0,
        zIndex: 0,
      }}
    />
  );
};

export default AnimatedBackground;
