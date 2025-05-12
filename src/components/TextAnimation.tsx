import React, { useEffect, useRef } from 'react';
import { animate, utils, stagger } from 'animejs';
import './TextAnimation.css';

interface TextAnimationProps {
  text: string;
  className?: string;
  style?: React.CSSProperties;
  delay?: number;
  duration?: number;
  staggerValue?: number;
}

const TextAnimation: React.FC<TextAnimationProps> = ({
  text,
  className = '',
  style = {},
  delay = 0,
  duration = 1000,
  staggerValue = 50
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    container.innerHTML = '';

    // Split text into individual spans for character animation
    text.split('').forEach((char, index) => {
      const span = document.createElement('span');
      span.textContent = char === ' ' ? '\u00A0' : char; // Replace space with non-breaking space
      span.style.opacity = '1'; // Start visible
      span.style.display = 'inline-block';
      span.classList.add('text-anim-char');
      container.appendChild(span);
    });

    // Animate each character
    // In anime.js v4, we need to be more careful with selectors
    // Get the characters directly instead of using a complex selector
    const chars = container.querySelectorAll('.text-anim-char');

    // Set initial opacity to 1 to ensure text is visible even before animation
    chars.forEach(char => {
      (char as HTMLElement).style.opacity = '1';
    });

    animate(chars, {
      opacity: [0.5, 1], // Start from 0.5 instead of 0 for better visibility
      translateY: [10, 0], // Less movement
      scale: [0.9, 1], // Less scaling
      easing: 'easeOutExpo',
      duration: duration,
      delay: stagger(staggerValue, { start: delay }),
      complete: () => {
        // Add a subtle hover effect after animation completes
        chars.forEach(char => {
          char.addEventListener('mouseenter', () => {
            animate(char, {
              scale: 1.2,
              color: '#61dafb', // React blue color
              duration: 300,
              easing: 'easeOutElastic(1, .6)'
            });
          });

          char.addEventListener('mouseleave', () => {
            animate(char, {
              scale: 1,
              color: 'inherit',
              duration: 300,
              easing: 'easeOutElastic(1, .6)'
            });
          });
        });
      }
    });

    return () => {
      // In anime.js v4, we need to be more careful with selectors
      if (containerRef.current) {
        const chars = containerRef.current.querySelectorAll('.text-anim-char');
        if (chars.length > 0) {
          utils.remove(chars);
        }
      }
    };
  }, [text, className, delay, duration, staggerValue]);

  return (
    <div
      ref={containerRef}
      className={`text-animation ${className}`}
      style={{ display: 'inline-block', ...style }}
    />
  );
};

export default TextAnimation;
