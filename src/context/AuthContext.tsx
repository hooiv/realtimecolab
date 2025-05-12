import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Socket } from 'socket.io-client';
import io from 'socket.io-client';
import { authService } from '../services/AuthService';
import type { User, AuthState } from '../services/AuthService';

// Create context with initial state
const initialAuthState: AuthState = {
  isAuthenticated: false,
  user: null,
  loading: true,
  error: null
};

const AuthContext = createContext<{
  authState: AuthState;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string, color?: string) => Promise<void>;
  logout: () => void;
  setSocket: (socket: Socket) => void;
  initializeSocket: () => Socket | null;
  // For demo/development only
  mockLogin: (username: string) => void;
}>({
  authState: initialAuthState,
  login: async () => {},
  register: async () => {},
  logout: () => {},
  setSocket: () => {},
  initializeSocket: () => null,
  mockLogin: () => {}
});

// Custom hook to use the auth context
export const useAuth = () => useContext(AuthContext);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>(initialAuthState);
  const [socketInitialized, setSocketInitialized] = useState<boolean>(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Check if user is already logged in from localStorage
    const storedUser = authService.getStoredUser();
    if (storedUser) {
      setAuthState({
        isAuthenticated: true,
        user: storedUser,
        loading: false,
        error: null
      });
      
      // Initialize socket with stored user credentials
      if (!socketRef.current) {
        const socket = initializeSocket();
        if (socket) {
          authService.setSocket(socket);
        }
      }
    } else {
      setAuthState(prev => ({ ...prev, loading: false }));
    }
  }, []);
// Initialize socket with authentication
  const initializeSocket = () => {
    if (socketRef.current) {
      console.log('[AuthContext] Socket already exists, reusing');
      return socketRef.current;
    }
    
    console.log('[AuthContext] Creating new socket connection');
    const options: any = {};
    
    // Add auth data to socket connection if user is authenticated
    if (authState.isAuthenticated && authState.user?.token) {
      options.auth = {
        token: authState.user.token
      };
      console.log('[AuthContext] Added auth token to socket options');
    } else if (authState.isAuthenticated && authState.user) {
      options.auth = {
        userId: authState.user.id,
        username: authState.user.username
      };
      console.log('[AuthContext] Added user info to socket options');
    } else {
      console.log('[AuthContext] No auth data available, connecting as guest');
    }

    try {
      const socket = io('http://localhost:3001', options);
      socketRef.current = socket;

      // Set up event handler for connection established
      socket.on('connect', () => {
        console.log('[AuthContext] Socket connected with ID:', socket.id);
        
        // Send user data after connection if the user is authenticated
        if (authState.isAuthenticated && authState.user) {
          console.log('[AuthContext] Sending authenticated user data to server');
          socket.emit('user-authenticated', {
            userId: authState.user.id,
            username: authState.user.username,
            color: authState.user.color
          });
        }
      });

      // Set up debug listeners
      socket.on('connect_error', (err) => {
        console.error('[AuthContext] Socket connection error:', err);
      });

      socket.on('disconnect', () => {
        console.log('[AuthContext] Socket disconnected');
      });

      // Make socket available to auth service
      authService.setSocket(socket);
      
      setSocketInitialized(true);
      console.log('[AuthContext] Socket initialized successfully');
      return socket;
    } catch (error) {
      console.error('[AuthContext] Socket initialization failed:', error);
      return null;
    }
  };

  // Set the socket in the auth service
  const setSocket = (socket: Socket) => {
    console.log('[AuthContext] Setting socket in AuthService');
    socketRef.current = socket;
    authService.setSocket(socket);
    setSocketInitialized(true);
  };  // Login handler
  const login = async (username: string, password: string) => {
    try {
      setAuthState(prev => ({ ...prev, loading: true, error: null }));
      
      // Ensure socket is initialized
      if (!socketRef.current) {
        initializeSocket();
      }
      
      // Attempt login
      let user;
      try {
        user = await authService.login(username, password);
      } catch (error) {
        if (error instanceof Error && error.message === 'Socket not initialized') {
          console.warn('[AuthContext] Socket not initialized during login, using mock login instead');
          user = authService.mockLogin(username);
        } else {
          throw error;
        }
      }
      
      setAuthState({
        isAuthenticated: true,
        user,
        loading: false,
        error: null
      });

      // Send authenticated user data to server
      if (socketRef.current) {
        console.log('[AuthContext] Sending authenticated user data after login');
        socketRef.current.emit('user-authenticated', {
          userId: user.id,
          username: user.username,
          color: user.color
        });
      }
    } catch (error) {
      setAuthState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Login failed'
      }));
      throw error;
    }
  };  
  // Register handler
  const register = async (username: string, email: string, password: string, color?: string) => {
    try {
      setAuthState(prev => ({ ...prev, loading: true, error: null }));
      
      // Ensure socket is initialized
      if (!socketRef.current) {
        initializeSocket();
      }
      
      // Attempt registration
      let user;
      try {
        user = await authService.register(username, email, password, color);
      } catch (error) {
        if (error instanceof Error && error.message === 'Socket not initialized') {
          console.warn('[AuthContext] Socket not initialized during registration, using mock login instead');
          user = authService.mockLogin(username, color);
        } else {
          throw error;
        }
      }
      
      setAuthState({
        isAuthenticated: true,
        user,
        loading: false,
        error: null
      });

      // Send authenticated user data to server
      if (socketRef.current) {
        console.log('[AuthContext] Sending authenticated user data after registration');
        socketRef.current.emit('user-authenticated', {
          userId: user.id,
          username: user.username,
          color: user.color
        });
      }
    } catch (error) {
      setAuthState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Registration failed'
      }));
      throw error;
    }
  };

  // Logout handler
  const logout = () => {
    // Disconnect socket if it exists
    if (socketRef.current) {
      console.log('[AuthContext] Disconnecting socket during logout');
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    
    authService.logout();
    setAuthState({
      isAuthenticated: false,
      user: null,
      loading: false,
      error: null
    });
  };
  // For demo/development - create a mock user without backend
  const mockLogin = (username: string) => {
    const mockUser = authService.mockLogin(username);
    
    // Ensure socket is initialized
    if (!socketRef.current) {
      initializeSocket();
    }
    
    setAuthState({
      isAuthenticated: true,
      user: mockUser,
      loading: false,
      error: null
    });

    // Send authenticated user data to server
    if (socketRef.current) {
      console.log('[AuthContext] Sending authenticated mock user data');
      socketRef.current.emit('user-authenticated', {
        userId: mockUser.id,
        username: mockUser.username,
        color: mockUser.color
      });
    }
  };

  return (
    <AuthContext.Provider value={{ 
      authState, 
      login, 
      register, 
      logout, 
      setSocket, 
      initializeSocket,
      mockLogin 
    }}>
      {children}
    </AuthContext.Provider>
  );
};
