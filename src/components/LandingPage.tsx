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

  // Add title and subtitle animation effects
  useEffect(() => {
    // Animate the title
    const title = document.querySelector('.static-title');
    if (title) {
      animate(title, {
        opacity: [0, 1],
        translateY: [-20, 0],
        duration: 1200,
        easing: 'easeOutExpo'
      });

      // Add a subtle hover effect to the title
      title.addEventListener('mouseenter', () => {
        animate(title, {
          scale: 1.02,
          textShadow: '0 0 15px rgba(97, 218, 251, 0.8)',
          duration: 400,
          easing: 'easeOutQuad'
        });
      });

      title.addEventListener('mouseleave', () => {
        animate(title, {
          scale: 1,
          textShadow: '0 2px 10px rgba(0, 0, 0, 0.5)',
          duration: 400,
          easing: 'easeOutQuad'
        });
      });
    }

    // Animate the subtitle
    const subtitle = document.querySelector('.subtitle');
    if (subtitle) {
      animate(subtitle, {
        opacity: [0, 1],
        translateX: [-10, 0],
        duration: 1200,
        delay: 300, // Start after title animation begins
        easing: 'easeOutExpo'
      });

      // Add a typing cursor effect
      const cursor = document.createElement('span');
      cursor.className = 'typing-cursor';
      cursor.textContent = '|';
      cursor.style.marginLeft = '2px';
      cursor.style.opacity = '0';
      subtitle.appendChild(cursor);

      // Animate the cursor
      animate(cursor, {
        opacity: [0, 1],
        duration: 300,
        delay: 1500,
        easing: 'easeOutExpo',
        complete: () => {
          // Blinking cursor animation
          animate(cursor, {
            opacity: [1, 0],
            duration: 800,
            easing: 'steps(1)',
            loop: true
          });
        }
      });
    }
  }, []);

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
        complete: () => {
          console.log('Guest login button animation complete, proceeding with login');

          // Call mockLogin to create a guest user
          mockLogin(guestUsername);

          console.log('Mock login completed, user should be authenticated now');

          // Add a small delay to ensure state updates before transition
          setTimeout(() => {
            console.log('Starting page exit animation');
            if (pageRef.current) {
              // Simple fade out animation instead of using animateExit
              animate(pageRef.current, {
                opacity: [1, 0],
                translateY: [0, -10],
                duration: 600,
                easing: 'easeOutQuad',
                complete: () => {
                  console.log('Exit animation complete, entering app');
                  onEnterApp();
                }
              });
            } else {
              console.log('pageRef not available, entering app directly');
              onEnterApp();
            }
          }, 300);
        }
      });
    } else {
      console.log('Guest button not found, proceeding with direct login');
      mockLogin(guestUsername);
      setTimeout(() => onEnterApp(), 300);
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
          {/* Animated lines */}
          <div className="animated-line line-1"></div>
          <div className="animated-line line-2"></div>
          <div className="animated-line line-3"></div>

          {/* Static title that's always visible */}
          <h1 className="static-title">Real-Time Collaboration Tool</h1>
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
