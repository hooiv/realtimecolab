import React, { useRef, useState } from 'react';
import { animate } from 'animejs';
import './AnimatedButton.css';

interface AnimatedButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  animationStyle?: 'bounce' | 'ripple' | 'slide' | 'pulse' | 'none';
}

const AnimatedButton: React.FC<AnimatedButtonProps> = ({
  children,
  onClick,
  className = '',
  type = 'button',
  variant = 'primary',
  size = 'medium',
  disabled = false,
  animationStyle = 'bounce'
}) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  // Handle animation
  const handleAnimation = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || isAnimating) return;

    setIsAnimating(true);

    const button = buttonRef.current;
    if (!button) return;

    // Create different animation types based on the selected style
    switch (animationStyle) {
      case 'bounce':
        animate(button, {
          scale: [1, 0.95, 1.05, 1],
          duration: 600,
          easing: 'easeInOutQuad',
          complete: () => setIsAnimating(false)
        });
        break;

      case 'ripple':
        // Create ripple effect
        const rect = button.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const circle = document.createElement('span');
        circle.classList.add('ripple');
        circle.style.top = `${y}px`;
        circle.style.left = `${x}px`;

        button.appendChild(circle);

        animate(circle, {
          scale: [0, 5],
          opacity: [1, 0],
          duration: 800,
          easing: 'easeOutExpo',
          complete: () => {
            if (button.contains(circle)) {
              button.removeChild(circle);
            }
            setIsAnimating(false);
          }
        });
        break;

      case 'slide':
        animate(button, {
          translateX: [0, -5, 5, 0],
          duration: 500,
          easing: 'easeInOutQuad',
          complete: () => setIsAnimating(false)
        });
        break;

      case 'pulse':
        animate(button, {
          boxShadow: [
            '0 0 0 0 rgba(66, 153, 225, 0.5)',
            '0 0 0 15px rgba(66, 153, 225, 0)',
          ],
          duration: 1200,
          easing: 'easeOutExpo',
          complete: () => setIsAnimating(false)
        });
        break;

      default:
        setIsAnimating(false);
        break;
    }

    // Call the original onClick handler
    onClick && onClick();
  };

  return (
    <button
      ref={buttonRef}
      type={type}
      className={`animated-btn ${variant} ${size} ${className}`}
      disabled={disabled}
      onClick={handleAnimation}
    >
      {children}
    </button>
  );
};

export default AnimatedButton;
