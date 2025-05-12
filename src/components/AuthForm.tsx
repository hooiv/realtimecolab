import React, { useState, useEffect, useRef } from 'react';
import { animate } from 'animejs';
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
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          {!isLoginMode && (
            <>
              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="avatar-color">Avatar Color</label>
                <input
                  type="color"
                  id="avatar-color"
                  value={avatarColor}
                  onChange={(e) => setAvatarColor(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {!isLoginMode && (
            <div className="form-group">
              <label htmlFor="confirm-password">Confirm Password</label>
              <input
                type="password"
                id="confirm-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
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
              <span className="loading-spinner"></span>
            ) : (
              isLoginMode ? 'Login' : 'Register'
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
