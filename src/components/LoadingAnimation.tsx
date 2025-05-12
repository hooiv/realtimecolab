import React, { useEffect, useRef } from 'react';
import { animate, stagger, utils } from 'animejs';
import './LoadingAnimation.css';

interface LoadingAnimationProps {
  type?: 'dots' | 'bars' | 'spinner' | 'boxes' | 'pulse';
  size?: 'small' | 'medium' | 'large';
  color?: string;
  className?: string;
  text?: string;
}

const LoadingAnimation: React.FC<LoadingAnimationProps> = ({
  type = 'dots',
  size = 'medium',
  color = '#4299e1',
  className = '',
  text
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const animationContainer = container.querySelector('.animation-container');

    if (!animationContainer) return;

    // Clear previous content
    animationContainer.innerHTML = '';

    // Create elements based on animation type
    switch (type) {
      case 'dots':
        for (let i = 0; i < 3; i++) {
          const dot = document.createElement('div');
          dot.classList.add('loading-dot');
          dot.style.backgroundColor = color;
          animationContainer.appendChild(dot);
        }

        // Wait for DOM to update before animating
        setTimeout(() => {
          const dots = container.querySelectorAll('.loading-dot');
          if (dots && dots.length > 0) {
            animate(dots, {
              translateY: [0, -15, 0],
              duration: 1200,
              delay: stagger(180),
              loop: true,
              easing: 'easeInOutSine'
            });
          }
        }, 0);
        break;

      case 'bars':
        for (let i = 0; i < 5; i++) {
          const bar = document.createElement('div');
          bar.classList.add('loading-bar');
          bar.style.backgroundColor = color;
          animationContainer.appendChild(bar);
        }

        setTimeout(() => {
          const bars = container.querySelectorAll('.loading-bar');
          if (bars && bars.length > 0) {
            animate(bars, {
              height: (_el: Element, i: number) => [
                5,
                20 + (i * 5),
                5
              ],
              duration: 1000,
              delay: stagger(120),
              loop: true,
              easing: 'easeInOutQuad'
            });
          }
        }, 0);
        break;

      case 'spinner':
        const spinnerRing = document.createElement('div');
        spinnerRing.classList.add('spinner-ring');
        spinnerRing.style.borderColor = `${color}33`;
        spinnerRing.style.borderTopColor = color;
        animationContainer.appendChild(spinnerRing);

        setTimeout(() => {
          const spinner = container.querySelector('.spinner-ring');
          if (spinner) {
            animate(spinner, {
              rotate: 360,
              duration: 1200,
              loop: true,
              easing: 'linear'
            });
          }
        }, 0);
        break;

      case 'boxes':
        for (let i = 0; i < 4; i++) {
          const box = document.createElement('div');
          box.classList.add('loading-box');
          box.style.backgroundColor = color;
          animationContainer.appendChild(box);
        }

        setTimeout(() => {
          const boxes = container.querySelectorAll('.loading-box');
          if (boxes && boxes.length > 0) {
            animate(boxes, {
              scale: [
                {value: 1, duration: 0, delay: 0},
                {value: 0, duration: 500, delay: stagger(200)},
                {value: 1, duration: 500, delay: 0}
              ],
              rotate: stagger([0, 90, 180, 270]),
              loop: true,
              easing: 'easeInOutSine',
              delay: stagger(200)
            });
          }
        }, 0);
        break;

      case 'pulse':
        const circle = document.createElement('div');
        circle.classList.add('pulse-circle');
        circle.style.borderColor = color;
        animationContainer.appendChild(circle);

        setTimeout(() => {
          const pulseCircle = container.querySelector('.pulse-circle');
          if (pulseCircle) {
            animate(pulseCircle, {
              scale: [1, 1.5],
              opacity: [0.8, 0],
              duration: 1200,
              loop: true,
              easing: 'easeInOutQuad'
            });
          }
        }, 0);
        break;
    }

    // Cleanup function
    return () => {
      try {
        // Try to remove animations more safely
        const elements = container.querySelectorAll('.loading-dot, .loading-bar, .spinner-ring, .loading-box, .pulse-circle');
        if (elements.length > 0) {
          utils.remove(elements);
        }
      } catch (error) {
        console.log('Animation cleanup error:', error);
      }
    };
  }, [type, color]);

  return (
    <div
      id={`loading-animation-${Math.floor(Math.random() * 10000)}`}
      ref={containerRef}
      className={`loading-animation ${size} ${className}`}
    >
      <div className="animation-container"></div>
      {text && <div className="loading-text" style={{ color }}>{text}</div>}
    </div>
  );
};

export default LoadingAnimation;
