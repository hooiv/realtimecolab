import React, { useState, useEffect, useRef } from 'react';
import { animate } from 'animejs';
import LoadingAnimation from './LoadingAnimation';
import './AuthForm.css';

interface AuthFormProps {
  onLogin: (username: string, password: string) => void;
  onRegister: (username: string, email: string, password: string, color: string) => void;
  isLoading: boolean;
  error?: string;
}

const AuthForm: React.FC<AuthFormProps> = ({ onLogin, onRegister, isLoading, error }) => {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [avatarColor, setAvatarColor] = useState('#3498db');
  const formRef = useRef<HTMLDivElement>(null);
  const submitBtnRef = useRef<HTMLButtonElement>(null);

  // Button hover animation
  const animateButton = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (isLoading) return;

    animate(e.currentTarget, {
      scale: [1, 1.05],
      boxShadow: ['0px 0px 0px rgba(0,0,0,0.2)', '0px 5px 15px rgba(0,0,0,0.3)'],
      duration: 300,
      easing: 'easeOutElastic(1, .6)'
    });
  };

  const resetButton = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (isLoading) return;

    animate(e.currentTarget, {
      scale: 1,
      boxShadow: '0px 0px 0px rgba(0,0,0,0.2)',
      duration: 500,
      easing: 'easeOutElastic(1, .6)'
    });
  };

  // Toggle form animation
  useEffect(() => {
    if (formRef.current) {
      animate(formRef.current, {
        opacity: [0.8, 1],
        translateY: [20, 0],
        easing: 'easeOutExpo',
        duration: 500
      });
    }
  }, [isLoginMode]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (isLoginMode) {
      onLogin(username, password);
    } else {
      if (password !== confirmPassword) {
        alert('Passwords do not match');
        return;
      }
      onRegister(username, email, password, avatarColor);
    }
  };

  const toggleMode = () => {
    setIsLoginMode((prevMode) => !prevMode);
  };

  return (
    <div className="auth-form-container">
      <div className="auth-form-box" ref={formRef}>
        <h2>{isLoginMode ? 'Login' : 'Register'}</h2>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <div className="input-with-icon">
              <i className="user-icon">👤</i>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                required
              />
            </div>
          </div>

          {!isLoginMode && (
            <>
              <div className="form-group">
                <label htmlFor="email">Email</label>
                <div className="input-with-icon">
                  <i className="email-icon">✉️</i>
                  <input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="avatar-color">Avatar Color</label>
                <div className="color-input-container">
                  <input
                    type="color"
                    id="avatar-color"
                    value={avatarColor}
                    onChange={(e) => setAvatarColor(e.target.value)}
                  />
                  <span className="color-preview" style={{ backgroundColor: avatarColor }}></span>
                </div>
              </div>
            </>
          )}

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="input-with-icon">
              <i className="password-icon">🔒</i>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
              />
            </div>
          </div>

          {!isLoginMode && (
            <div className="form-group">
              <label htmlFor="confirm-password">Confirm Password</label>
              <div className="input-with-icon">
                <i className="password-icon">🔒</i>
                <input
                  type="password"
                  id="confirm-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your password"
                  required
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            className="auth-submit-btn"
            disabled={isLoading}
            ref={submitBtnRef}
            onMouseEnter={animateButton}
            onMouseLeave={resetButton}
          >
            {isLoading ? (
              <LoadingAnimation type="dots" size="small" color="#ffffff" />
            ) : (
              <>
                <span className="btn-icon">{isLoginMode ? '🚀' : '✨'}</span>
                <span className="btn-text">{isLoginMode ? 'Login' : 'Register'}</span>
              </>
            )}
          </button>
        </form>

        <div className="auth-switch">
          <p onClick={toggleMode}>
            {isLoginMode
              ? "Don't have an account? Register"
              : "Already have an account? Login"}
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuthForm;
