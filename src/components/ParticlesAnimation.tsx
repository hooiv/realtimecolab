import React, { useEffect, useRef } from 'react';
import { animate, utils } from 'animejs';
import './ParticlesAnimation.css';

interface ParticlesAnimationProps {
  id: string;
  particleCount?: number;
  targetSelector?: string;
}

const ParticlesAnimation: React.FC<ParticlesAnimationProps> = ({
  id,
  particleCount = 20,
  targetSelector = '.dot-follow'
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const dotContainer = containerRef.current;
    dotContainer.innerHTML = '';
    const dotSize = 10;

    // Dynamically create particles
    for (let i = 0; i < particleCount; i++) {
      const dot = document.createElement('div');
      dot.classList.add('dot-follow');
      dot.style.width = `${dotSize}px`;
      dot.style.height = `${dotSize}px`;
      dot.style.borderRadius = '50%';
      dot.style.background = `rgba(255, 255, 255, ${Math.random() * 0.5 + 0.1})`;
      dot.style.position = 'absolute';
      dot.style.zIndex = '0';
      dot.style.pointerEvents = 'none';
      containerRef.current.appendChild(dot);
    }

    // Mouse follow effect
    let mouseX = 0;
    let mouseY = 0;

    const updateMousePosition = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };

    window.addEventListener('mousemove', updateMousePosition);

    // Animate particles to follow mouse with delay
    const dots = document.querySelectorAll(targetSelector);
    dots.forEach((dot, index) => {
      animate(dot, {
        translateX: () => mouseX - dotSize / 2,
        translateY: () => mouseY - dotSize / 2,
        scale: () => Math.max(0.2, Math.random()),
        opacity: () => Math.random() * 0.8 + 0.2,
        delay: () => index * 10,
        duration: () => Math.random() * 2000 + 1000,
        easing: 'easeOutExpo',
        update: (anim) => {
          // Add trail effect
          const progress = utils.random(0, 1);
          if (progress > 0.995) {
            animate(dot, {
              scale: [1, 0],
              opacity: [1, 0],
              duration: 1000,
              easing: 'easeOutExpo',
              complete: () => {
                animate(dot, {
                  scale: [0, 1],
                  opacity: [0, 1],
                  duration: 1000,
                  easing: 'easeInExpo'
                });
              }
            });
          }
        }
      });
    });

    return () => {
      window.removeEventListener('mousemove', updateMousePosition);
      utils.remove(targetSelector);
    };
  }, [particleCount, targetSelector]);

  return (
    <div
      id={id}
      ref={containerRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 1,
        overflow: 'hidden'
      }}
    />
  );
};

export default ParticlesAnimation;
