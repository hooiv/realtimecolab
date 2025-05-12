import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Socket } from 'socket.io-client';
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
  // For demo/development only
  mockLogin: (username: string) => void;
}>({
  authState: initialAuthState,
  login: async () => {},
  register: async () => {},
  logout: () => {},
  setSocket: () => {},
  mockLogin: () => {}
});

// Custom hook to use the auth context
export const useAuth = () => useContext(AuthContext);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>(initialAuthState);

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
    } else {
      setAuthState(prev => ({ ...prev, loading: false }));
    }
  }, []);

  // Set the socket in the auth service
  const setSocket = (socket: Socket) => {
    authService.setSocket(socket);
  };

  // Login handler
  const login = async (username: string, password: string) => {
    try {
      setAuthState(prev => ({ ...prev, loading: true, error: null }));
      const user = await authService.login(username, password);
      setAuthState({
        isAuthenticated: true,
        user,
        loading: false,
        error: null
      });
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
      const user = await authService.register(username, email, password, color);
      setAuthState({
        isAuthenticated: true,
        user,
        loading: false,
        error: null
      });
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
    setAuthState({
      isAuthenticated: true,
      user: mockUser,
      loading: false,
      error: null
    });
  };

  return (
    <AuthContext.Provider value={{ authState, login, register, logout, setSocket, mockLogin }}>
      {children}
    </AuthContext.Provider>
  );
};
