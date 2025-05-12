import React, { useEffect, useRef } from 'react';
import { animate, utils } from 'animejs';
import './AnimatedNotification.css';

interface AnimatedNotificationProps {
  message: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
  onClose?: () => void;
}

const AnimatedNotification: React.FC<AnimatedNotificationProps> = ({
  message,
  type = 'info',
  duration = 3000,
  onClose
}) => {
  const notificationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!notificationRef.current) return;

    // Define colors based on type
    const colors = {
      success: '#06D6A0',
      error: '#EF476F',
      warning: '#FFD166',
      info: '#118AB2'
    };

    // First animation: slide in and bounce
    const enterAnimation = animate(notificationRef.current, {
      translateX: [-300, 0],
      opacity: [0, 1],
      duration: 800,
      easing: 'easeOutElastic(1, 0.6)',
      complete: () => {
        // Second animation: subtle pulse
        animate(notificationRef.current, {
          scale: [1, 1.02, 1],
          boxShadow: [
            `0 3px 12px rgba(0,0,0,0.15)`,
            `0 6px 20px rgba(0,0,0,0.25)`,
            `0 3px 12px rgba(0,0,0,0.15)`
          ],
          duration: 1500,
          direction: 'alternate',
          loop: 1,
          easing: 'easeInOutQuad'
        });

        // Auto-close after duration
        setTimeout(() => {
          if (notificationRef.current) {
            // Exit animation
            animate(notificationRef.current, {
              translateX: [0, -300],
              opacity: [1, 0],
              duration: 600,
              easing: 'easeInOutQuad',
              complete: onClose
            });
          }
        }, duration);
      }
    });

    // Cleanup
    return () => {
      enterAnimation.pause();
      utils.remove(notificationRef.current);
    };
  }, [duration, type, onClose]);

  return (
    <div
      ref={notificationRef}
      className={`animated-notification ${type}`}
      onClick={() => {
        // Handle click to dismiss
        if (notificationRef.current) {
          animate(notificationRef.current, {
            translateX: [0, -300],
            opacity: [1, 0],
            duration: 600,
            easing: 'easeInOutQuad',
            complete: onClose
          });
        }
      }}
    >
      <div className="notification-icon">
        {type === 'success' && <span>✓</span>}
        {type === 'error' && <span>✕</span>}
        {type === 'warning' && <span>!</span>}
        {type === 'info' && <span>i</span>}
      </div>
      <div className="notification-content">
        <p>{message}</p>
      </div>
    </div>
  );
};

export default AnimatedNotification;
