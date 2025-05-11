import React from 'react';

interface LandingPageProps {
  onEnterApp: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onEnterApp }) => {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      backgroundColor: '#282c34', // Dark background
      color: 'white',
      fontFamily: 'Arial, sans-serif',
      textAlign: 'center',
      padding: '20px'
    }}>
      <h1 style={{ fontSize: '3em', marginBottom: '20px' }}>Collaborative 3D Task Environment</h1>
      <p style={{ fontSize: '1.2em', marginBottom: '40px', maxWidth: '600px' }}>
        Experience a new dimension of teamwork. Manage tasks, visualize progress, and collaborate in a shared 3D space.
      </p>
      <button
        onClick={onEnterApp}
        style={{
          padding: '15px 30px',
          fontSize: '1.2em',
          color: 'white',
          backgroundColor: '#61dafb', // React blue
          border: 'none',
          borderRadius: '5px',
          cursor: 'pointer',
          transition: 'background-color 0.3s ease'
        }}
        onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#21a1f1')}
        onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#61dafb')}
      >
        Enter 3D Workspace
      </button>
      <footer style={{ position: 'absolute', bottom: '20px', fontSize: '0.8em', color: '#aaa' }}>
        Powered by Three.js, React, and Socket.IO - Project {new Date().getFullYear()}
      </footer>
    </div>
  );
};

export default LandingPage;
