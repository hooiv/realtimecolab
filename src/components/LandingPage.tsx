import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import AuthForm from './AuthForm';
import './LandingPage.css';

interface LandingPageProps {
  onEnterApp: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onEnterApp }) => {
  const { authState, login, register, mockLogin } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (username: string, password: string) => {
    try {
      await login(username, password);
      onEnterApp();
    } catch (error) {
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError('Login failed. Please try again.');
      }
    }
  };
  const handleRegister = async (username: string, email: string, password: string, color: string) => {
    try {
      await register(username, email, password, color);
      onEnterApp();
    } catch (error) {
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError('Registration failed. Please try again.');
      }
    }
  };

  const handleGuestEntry = () => {
    // Generate a random guest username
    const guestUsername = `Guest-${Math.floor(Math.random() * 10000)}`;
    mockLogin(guestUsername);
    onEnterApp();
  };

  return (
    <div className="landing-page">
      <div className="landing-content">
        <div className="landing-header">
          <h1>Collaborative 3D Task Environment</h1>
          <p>Experience a new dimension of teamwork. Manage tasks, visualize progress, and collaborate in a shared 3D space.</p>
        </div>
        
        <div className="auth-section">
          <AuthForm 
            onLogin={handleLogin}
            onRegister={handleRegister}
            isLoading={authState.loading}
            error={error || authState.error || undefined}
          />
          
          <div className="guest-login">
            <p>Don't want to sign up right now?</p>
            <button onClick={handleGuestEntry} className="guest-button">
              Continue as Guest
            </button>
          </div>
        </div>
      </div>
      
      <footer>
        Powered by Three.js, React, and Socket.IO - Project {new Date().getFullYear()}
      </footer>
    </div>
  );
};

export default LandingPage;
