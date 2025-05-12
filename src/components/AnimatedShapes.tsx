import React, { useEffect, useRef } from 'react';
import { animate, utils, stagger } from 'animejs';
import './AnimatedShapes.css';

interface AnimatedShapesProps {
  id: string;
}

const AnimatedShapes: React.FC<AnimatedShapesProps> = ({ id }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    // Create a group of circles with different colors
    const colors = ['#FF4B4B', '#6B8CFF', '#FFD166', '#06D6A0', '#61DAFB'];
    const shapesContainer = svgRef.current.querySelector('#shapes-container');

    if (shapesContainer) {
      // Clear existing shapes
      shapesContainer.innerHTML = '';

      // Create circles
      for (let i = 0; i < 10; i++) {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        const size = Math.random() * 30 + 10;
        circle.setAttribute('r', size.toString());
        circle.setAttribute('cx', (Math.random() * 500).toString());
        circle.setAttribute('cy', (Math.random() * 300).toString());
        circle.setAttribute('fill', colors[Math.floor(Math.random() * colors.length)]);
        circle.setAttribute('opacity', (Math.random() * 0.5 + 0.3).toString());
        shapesContainer.appendChild(circle);
      }

      // Create rectangles
      for (let i = 0; i < 8; i++) {
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        const width = Math.random() * 50 + 10;
        const height = Math.random() * 50 + 10;
        rect.setAttribute('width', width.toString());
        rect.setAttribute('height', height.toString());
        rect.setAttribute('x', (Math.random() * 500).toString());
        rect.setAttribute('y', (Math.random() * 300).toString());
        rect.setAttribute('fill', colors[Math.floor(Math.random() * colors.length)]);
        rect.setAttribute('opacity', (Math.random() * 0.5 + 0.3).toString());
        rect.setAttribute('rx', (5).toString()); // Rounded corners
        shapesContainer.appendChild(rect);
      }

      // Create lines
      for (let i = 0; i < 5; i++) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', (Math.random() * 500).toString());
        line.setAttribute('y1', (Math.random() * 300).toString());
        line.setAttribute('x2', (Math.random() * 500).toString());
        line.setAttribute('y2', (Math.random() * 300).toString());
        line.setAttribute('stroke', colors[Math.floor(Math.random() * colors.length)]);
        line.setAttribute('stroke-width', (Math.random() * 3 + 1).toString());
        line.setAttribute('opacity', (Math.random() * 0.5 + 0.3).toString());
        shapesContainer.appendChild(line);
      }

      // Animate all shapes
      const allShapes = shapesContainer.querySelectorAll('circle, rect, line');

      animate(allShapes, {
        translateX: () => utils.random(-50, 50),
        translateY: () => utils.random(-30, 30),
        scale: () => utils.random(0.8, 1.2),
        rotate: () => utils.random(-15, 15),
        opacity: () => utils.random(0.3, 0.8),
        duration: () => utils.random(3000, 5000),
        delay: stagger(100),
        direction: 'alternate',
        loop: true,
        easing: 'easeInOutSine'
      });
    }

    return () => {
      if (svgRef.current) {
        utils.remove(svgRef.current.querySelectorAll('circle, rect, line'));
      }
    };
  }, []);

  return (
    <svg
      ref={svgRef}
      id={id}
      width="100%"
      height="300"
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        zIndex: 0,
        pointerEvents: 'none',
        opacity: 0.7
      }}
    >
      <g id="shapes-container"></g>
    </svg>
  );
};

export default AnimatedShapes;
