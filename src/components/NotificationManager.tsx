import React, { useState, useCallback, useEffect } from 'react';
import AnimatedNotification from './AnimatedNotification';

interface Notification {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
}

interface NotificationManagerProps {
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  maxNotifications?: number;
}

export const useNotification = () => {
  // This will be injected by the NotificationContext later if needed
  const addNotification = (message: string, type: 'success' | 'error' | 'info' | 'warning', duration: number = 3000) => {
    const event = new CustomEvent('add-notification', { 
      detail: { message, type, duration, id: Date.now().toString() } 
    });
    window.dispatchEvent(event);
  };

  return {
    success: (message: string, duration?: number) => addNotification(message, 'success', duration),
    error: (message: string, duration?: number) => addNotification(message, 'error', duration),
    info: (message: string, duration?: number) => addNotification(message, 'info', duration),
    warning: (message: string, duration?: number) => addNotification(message, 'warning', duration)
  };
};

const NotificationManager: React.FC<NotificationManagerProps> = ({
  position = 'bottom-left',
  maxNotifications = 5
}) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  }, []);

  const addNotification = useCallback((notification: Notification) => {
    setNotifications(prev => {
      // Limit the number of notifications
      const updated = [notification, ...prev];
      if (updated.length > maxNotifications) {
        return updated.slice(0, maxNotifications);
      }
      return updated;
    });
  }, [maxNotifications]);

  useEffect(() => {
    const handleAddNotification = (event: Event) => {
      const customEvent = event as CustomEvent<Notification>;
      if (customEvent.detail) {
        addNotification(customEvent.detail);
      }
    };

    window.addEventListener('add-notification', handleAddNotification);
    return () => {
      window.removeEventListener('add-notification', handleAddNotification);
    };
  }, [addNotification]);

  // Position styles
  const positionStyles: React.CSSProperties = {
    position: 'fixed',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    zIndex: 9999,
    ...(position === 'top-right' && { top: '20px', right: '20px' }),
    ...(position === 'top-left' && { top: '20px', left: '20px' }),
    ...(position === 'bottom-right' && { bottom: '20px', right: '20px' }),
    ...(position === 'bottom-left' && { bottom: '20px', left: '20px' })
  };

  return (
    <div style={positionStyles}>
      {notifications.map(notification => (
        <AnimatedNotification
          key={notification.id}
          message={notification.message}
          type={notification.type}
          duration={notification.duration}
          onClose={() => removeNotification(notification.id)}
        />
      ))}
    </div>
  );
};

export default NotificationManager;
