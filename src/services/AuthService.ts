import { Socket } from 'socket.io-client';

// Define types for user authentication
export interface User {
  id: string;
  username: string;
  email?: string;
  color: string;
  token?: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  loading: boolean;
  error: string | null;
}

// This would be replaced with actual API calls in production
class AuthService {
  private localStorageKey = 'task_board_auth';
  private socket: Socket | null = null;

  constructor() {
    // Try to load the user from local storage on initialization
    this.getStoredUser();
  }

  // Set the socket instance for later use
  setSocket(socket: Socket) {
    this.socket = socket;
  }

  // Get user data from local storage
  getStoredUser(): User | null {
    const storedData = localStorage.getItem(this.localStorageKey);
    if (storedData) {
      try {
        return JSON.parse(storedData);
      } catch (e) {
        console.error('Failed to parse stored user data:', e);
        localStorage.removeItem(this.localStorageKey);
      }
    }
    return null;
  }

  // Store user data in local storage
  storeUser(user: User): void {
    localStorage.setItem(this.localStorageKey, JSON.stringify(user));
  }

  // Remove user data from local storage
  clearStoredUser(): void {
    localStorage.removeItem(this.localStorageKey);
  }
  // Register a new user
  async register(username: string, email: string, password: string, color?: string): Promise<User> {
    // Simulate network request
    await new Promise(resolve => setTimeout(resolve, 800));

    // In a real app, this would be an API call to your backend
    if (!this.socket) {
      // Instead of failing, create a mock user for development
      console.warn('Socket not initialized. Creating mock user instead of registering with server.');
      return this.mockLogin(username, color);
    }

    return new Promise((resolve, reject) => {
      // Emit register event to server
      this.socket?.emit('register', { username, email, password, color }, (response: { success: boolean, user?: User, error?: string }) => {
        if (response.success && response.user) {
          this.storeUser(response.user);
          resolve(response.user);
        } else {
          reject(new Error(response.error || 'Registration failed'));
        }
      });

      // Set a timeout for the server response
      setTimeout(() => {
        reject(new Error('Registration timed out. Server did not respond.'));
      }, 5000);
    });
  }

  // Login an existing user
  async login(username: string, password: string): Promise<User> {
    // Simulate network request
    await new Promise(resolve => setTimeout(resolve, 800));    // In a real app, this would be an API call to your backend
    if (!this.socket) {
      console.warn('Socket not initialized. Creating mock user instead of logging in with server.');
      return this.mockLogin(username);
    }

    return new Promise((resolve, reject) => {
      // Emit login event to server
      this.socket?.emit('login', { username, password }, (response: { success: boolean, user?: User, error?: string }) => {
        if (response.success && response.user) {
          this.storeUser(response.user);
          resolve(response.user);
        } else {
          reject(new Error(response.error || 'Login failed'));
        }
      });

      // Set a timeout for the server response
      setTimeout(() => {
        reject(new Error('Login timed out. Server did not respond.'));
      }, 5000);
    });
  }

  // Logout the current user
  async logout(): Promise<void> {
    if (this.socket) {
      this.socket.emit('logout');
    }
    this.clearStoredUser();
  }  // For demo/development - create a mock user
  mockLogin(username: string, color?: string): User {
    console.log('[AuthService] Creating mock user with username:', username, 'and color:', color);
    const mockUser: User = {
      id: `user_${Math.floor(Math.random() * 10000)}`,
      username,
      color: color || `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`,
      token: `mock_token_${Math.random()}`
    };
    
    this.storeUser(mockUser);
    return mockUser;
  }
}

// Export a singleton instance of the AuthService
export const authService = new AuthService();
