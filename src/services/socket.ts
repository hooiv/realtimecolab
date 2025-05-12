import { Socket } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';

// This is a singleton pattern to access the socket instance from anywhere
let socketInstance: Socket | null = null;

// Function to get the socket instance
export const getSocket = (): Socket | null => {
  return socketInstance;
};

// Function to set the socket instance
export const setSocket = (socket: Socket): void => {
  socketInstance = socket;
};

// Export a proxy object that forwards calls to the socket instance
// This allows components to import and use socket directly
export const socket = new Proxy({} as Socket, {
  get: (target, prop) => {
    // Get the current socket instance
    const currentSocket = getSocket();
    
    if (!currentSocket) {
      console.warn(`Socket not initialized when accessing ${String(prop)}`);
      // Return a no-op function for methods
      if (typeof prop === 'string' && ['on', 'emit', 'off'].includes(prop)) {
        return (...args: any[]) => {
          console.warn(`Socket method ${prop} called before socket initialization`);
          return undefined;
        };
      }
      return undefined;
    }
    
    // Return the property or method from the actual socket
    return (currentSocket as any)[prop];
  }
});

// Hook to initialize socket in components
export const useSocketInitializer = () => {
  const { initializeSocket } = useAuth();
  
  const initSocket = () => {
    const socket = initializeSocket();
    if (socket) {
      setSocket(socket);
      return true;
    }
    return false;
  };
  
  return { initSocket };
};

export default socket;
