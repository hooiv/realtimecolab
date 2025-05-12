# Real-Time Collaboration Platform

A modern, interactive real-time collaboration platform built with React, TypeScript, and Socket.IO, featuring smooth animations powered by anime.js.

## Key Technologies

- **Frontend:** React, TypeScript, Vite
- **Animation:** anime.js v4
- **Real-time Communication:** Socket.IO
- **State Management:** React Context API

## 🚀 Features

- **Real-time Collaboration**: Work together with others in real-time
- **Smooth Animations**: Beautiful UI transitions and effects using anime.js
- **Responsive Design**: Works on desktop and mobile devices
- **User Authentication**: Secure login and user management
- **Modern UI**: Clean, intuitive interface with interactive elements

## 📋 Prerequisites

Before you begin, ensure you have the following installed:
- [Node.js](https://nodejs.org/) (v14.x or higher)
- [npm](https://www.npmjs.com/) (v6.x or higher)

## 🛠️ Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/hooiv/realtimecolab.git
   cd realtimecolab
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open your browser and navigate to:
   ```
   http://localhost:5173
   ```

## 🏗️ Project Structure

```
src/
├── components/        # Reusable UI components
│   ├── AnimatedButton.tsx
│   ├── AnimatedNotification.tsx
│   ├── LoadingAnimation.tsx
│   ├── MorphingAnimation.tsx
│   ├── TextAnimation.tsx
│   └── WaveAnimation.tsx
├── hooks/             # Custom React hooks
│   ├── useAnime.ts
│   ├── usePageTransition.ts
│   └── useScrollAnimation.ts
├── utils/             # Utility functions
│   └── animeUtils.ts
├── context/           # React context providers
│   └── AuthContext.tsx
├── App.tsx            # Main application component
└── main.tsx           # Entry point of the React application
```

## 🧩 Key Components

### Animation Components

The project uses anime.js v4 for smooth animations:

- **TextAnimation**: Animated text reveals with character-by-character animation
- **MorphingAnimation**: SVG shape morphing animations
- **LoadingAnimation**: Various loading indicators
- **AnimatedButton**: Interactive button with animation effects
- **WaveAnimation**: Animated wave effects
- **AnimatedNotification**: Toast notifications with entrance/exit animations

### Custom Hooks

- **useAnime**: React hook for easily using anime.js in components
- **usePageTransition**: Manages page transition animations
- **useScrollAnimation**: Triggers animations on scroll

## 🔄 Animation Usage

This project uses anime.js v4 with named exports. Example usage:

```typescript
import { animate, stagger } from 'animejs';

// Animate elements
animate('.element', {
  translateY: [100, 0],
  opacity: [0, 1],
  delay: stagger(100),
  duration: 1000,
  easing: 'easeOutExpo'
});
```

## 🧪 Testing

Run tests with:

```bash
npm test
```

## 📦 Building for Production

Build the project for production:

```bash
npm run build
```

The built files will be in the `dist/` directory.

## 🔧 Next Steps

- Enhance real-time collaboration features
- Add more interactive animation components
- Implement data persistence
- Add user profile customization
- Develop mobile app version

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

