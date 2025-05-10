# Real-Time Collaboration Tool with Animations

This project is a real-time collaboration tool featuring a dynamic user interface inspired by animation libraries like GreenSock (GSAP) and 3D graphics with Three.js. It's built using React, TypeScript, and Vite.

## Key Technologies

- **Frontend:** React, TypeScript, Vite
- **Animation:** GreenSock (GSAP)
- **3D Graphics:** Three.js
- **Real-time Backend (Planned):** Node.js, Express.js, WebSockets (e.g., Socket.io)

## Getting Started

Currently, the project includes a basic setup with a 3D animated cube to demonstrate GSAP and Three.js integration.

### Prerequisites

- Node.js and npm (or yarn)

### Installation

1. Clone the repository (if applicable).
2. Navigate to the project directory:
   ```bash
   cd your-project-directory
   ```
3. Install dependencies:
   ```bash
   npm install
   ```

### Running the Development Server

To start the Vite development server:

```bash
npm run dev
```

This will typically open the application in your browser at `http://localhost:5173`.

## Project Structure (Initial Frontend)

- `public/`: Static assets.
- `src/`:
  - `assets/`: Images, fonts, etc.
  - `components/`: (Planned) Reusable UI components.
  - `App.tsx`: Main application component, currently showcasing Three.js and GSAP.
  - `main.tsx`: Entry point of the React application.
  - `index.css`: Global styles.
  - `App.css`: Styles for the App component.
- `index.html`: Main HTML file.
- `package.json`: Project dependencies and scripts.
- `tsconfig.json`, `tsconfig.node.json`: TypeScript configurations.
- `vite.config.ts`: Vite configuration.

## Next Steps

- Develop the core real-time collaboration features.
- Design and implement the UI/UX with advanced animations and 3D elements.
- Set up the Node.js/Express.js backend with WebSocket communication.
- Implement user authentication and data persistence.

---

(Original Vite README content below for reference, can be removed or adapted as needed)

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default tseslint.config({
  extends: [
    // Remove ...tseslint.configs.recommended and replace with this
    ...tseslint.configs.recommendedTypeChecked,
    // Alternatively, use this for stricter rules
    ...tseslint.configs.strictTypeChecked,
    // Optionally, add this for stylistic rules
    ...tseslint.configs.stylisticTypeChecked,
  ],
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
})
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default tseslint.config({
  plugins: {
    // Add the react-x and react-dom plugins
    'react-x': reactX,
    'react-dom': reactDom,
  },
  rules: {
    // other rules...
    // Enable its recommended typescript rules
    ...reactX.configs['recommended-typescript'].rules,
    ...reactDom.configs.recommended.rules,
  },
})
```
