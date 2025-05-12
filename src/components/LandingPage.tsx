import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import AuthForm from './AuthForm';
import AnimatedBackground from './AnimatedBackground';
import ParticlesAnimation from './ParticlesAnimation';
import TextAnimation from './TextAnimation';
import AnimatedShapes from './AnimatedShapes';
import AnimatedButton from './AnimatedButton';
import MorphingAnimation from './MorphingAnimation';
import { WaveAnimation } from './WaveAnimation';
import LoadingAnimation from './LoadingAnimation';
import { useScrollAnimation } from '../hooks/useScrollAnimation';
import { usePageTransition } from '../hooks/usePageTransition';
import { animate } from 'animejs';
import './LandingPage.css';

interface LandingPageProps {
  onEnterApp: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onEnterApp }) => {
  const { authState, login, register, mockLogin, initializeSocket } = useAuth();
  const [error, setError] = useState<string | undefined>(undefined);
  const headerRef = useRef<HTMLDivElement>(null);
  const authSectionRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  // Generate unique IDs for animated components
  const backgroundId = useRef(`bg-${Math.random().toString(36).substr(2, 9)}`);
  const particlesId = useRef(`particles-${Math.random().toString(36).substr(2, 9)}`);
  const shapesId = useRef(`shapes-${Math.random().toString(36).substr(2, 9)}`);

  // Initialize socket on component mount
  useEffect(() => {
    initializeSocket();
  }, [initializeSocket]);

  // Apply scroll animations
  useScrollAnimation(titleRef, {
    animation: {
      opacity: [0, 1],
      translateY: [20, 0],
      duration: 1000,
      delay: 300
    }
  });

  useScrollAnimation(subtitleRef, {
    animation: {
      opacity: [0, 1],
      translateY: [20, 0],
      duration: 1000,
      delay: 800
    }
  });

  useScrollAnimation(authSectionRef, {
    animation: {
      opacity: [0, 1],
      translateY: [40, 0],
      duration: 1200,
      delay: 1200
    }
  });

  // Continuous floating animation for header
  useEffect(() => {
    if (!headerRef.current) return;

    animate(headerRef.current, {
      translateY: ['-3px', '3px'],
      duration: 3000,
      easing: 'easeInOutSine',
      loop: true,
      direction: 'alternate'
    });
  }, []);

  // Page transition setup
  const { animateExit } = usePageTransition();

  const handleLogin = async (username: string, password: string) => {
    try {
      // Add form submission animation
      animate('.auth-form-box', {
        translateY: [0, -5, 0],
        opacity: [1, 0.8, 1],
        duration: 800,
        easing: 'easeInOutQuad'
      });

      await login(username, password);

      // Exit animation using page transition hook
      if (pageRef.current) {
        await animateExit(pageRef.current);
        onEnterApp();
      }
    } catch (error) {
      // Error animation
      animate('.auth-error', {
        translateX: [0, -10, 10, -10, 10, 0],
        duration: 600,
        easing: 'easeInOutQuad'
      });

      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError('Login failed. Please try again.');
      }
    }
  };

  const handleRegister = async (username: string, email: string, password: string, color: string) => {
    try {
      animate('.auth-form-box', {
        scale: [1, 0.98, 1],
        boxShadow: [
          '0 4px 12px rgba(0,0,0,0.2)',
          '0 8px 20px rgba(0,0,0,0.4)',
          '0 4px 12px rgba(0,0,0,0.2)'
        ],
        duration: 800,
        easing: 'easeInOutQuad'
      });

      await register(username, email, password, color);

      if (pageRef.current) {
        await animateExit(pageRef.current);
        onEnterApp();
      }
    } catch (error) {
      animate('.auth-error', {
        translateY: [0, -5, 5, -5, 5, 0],
        backgroundColor: ['rgba(220, 53, 69, 0.8)', 'rgba(220, 53, 69, 1)', 'rgba(220, 53, 69, 0.8)'],
        duration: 600,
        easing: 'easeInOutQuad'
      });

      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError('Registration failed. Please try again.');
      }
    }
  };

  const handleGuestEntry = () => {
    const guestUsername = `Guest-${Math.floor(Math.random() * 10000)}`;

    const button = document.querySelector('.guest-button');
    if (button) {
      animate(button, {
        scale: [1, 0.95, 1.05, 1],
        backgroundColor: ['#3498db', '#2980b9'],
        boxShadow: ['0 2px 5px rgba(0,0,0,0.2)', '0 6px 15px rgba(0,0,0,0.3)', '0 2px 5px rgba(0,0,0,0.2)'],
        duration: 600,
        easing: 'easeInOutQuad',
        complete: async () => {
          await mockLogin(guestUsername);

          if (pageRef.current) {
            await animateExit(pageRef.current);
            onEnterApp();
          }
        }
      });
    }
  };

  return (
    <div ref={pageRef} className="landing-page">
      {/* Background elements */}
      <AnimatedBackground id={backgroundId.current} />
      <ParticlesAnimation id={particlesId.current} />
      <WaveAnimation color="#4facfe" height={200} speed={3000} amplitude={15} />

      {/* Header section with animated title - positioned absolutely */}
      <div ref={headerRef} className="header-container">
        <div className="title-container">
          <TextAnimation
            text="Real-Time Collaboration Tool"
            className="main-title"
            duration={1200}
            staggerValue={50}
          />
          <p ref={subtitleRef} className="subtitle">
            Create, collaborate, and visualize together in real-time
          </p>
        </div>
      </div>

      {/* Main content section */}
      <div ref={authSectionRef} className="auth-section">
        <AnimatedShapes id={shapesId.current} />

        <div className="auth-container">
          <div className="auth-card">
            <TextAnimation
              text="Welcome"
              className="welcome-text"
              duration={800}
              staggerValue={30}
            />

            <AuthForm
              onLogin={handleLogin}
              onRegister={handleRegister}
              isLoading={authState.loading}
              error={error}
            />

            <div className="guest-login-container">
              <AnimatedButton
                onClick={handleGuestEntry}
                animationStyle="bounce"
                className="guest-button"
                size="medium"
              >
                Continue as Guest
              </AnimatedButton>
            </div>
          </div>

          {/* Feature highlights - simplified for compact layout */}
          <div className="feature-highlights">
            <div className="feature">
              <h3>Real-time Updates</h3>
              <p>See changes as they happen</p>
            </div>

            <div className="feature">
              <h3>Secure Collaboration</h3>
              <p>Work together safely</p>
            </div>

            <div className="feature">
              <h3>Interactive Visualization</h3>
              <p>Bring your ideas to life</p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="landing-footer">
        <p>© 2023 Real-Time Collaboration Tool</p>
        <div className="footer-links">
          <a href="#">Terms of Service</a>
          <a href="#">Privacy Policy</a>
          <a href="#">Help</a>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
