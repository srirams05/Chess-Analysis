import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import eruda from 'eruda'; // Import eruda library

// Initialize Eruda console only in development mode
// import.meta.env.DEV is a Vite-specific variable that is true during 'npm run dev'
if (import.meta.env.DEV) {
  eruda.init(); // Initialize the Eruda console
  console.log("Eruda console initialized."); // Log confirmation
}

// The rest of the file remains the same
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);