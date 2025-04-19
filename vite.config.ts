import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc'; // Or @vitejs/plugin-react

export default defineConfig(() => {
  const port = 5173; // Or your preferred port
  const allowedHosts = [];

  // --- Dynamically Detect Host (Keep your logic) ---
  if (process.env.GITPOD_WORKSPACE_URL) {
    try {
        const url = new URL(process.env.GITPOD_WORKSPACE_URL);
        const gitpodHost = `${port}-${url.hostname}`;
        allowedHosts.push(gitpodHost);
        console.log(`Detected Gitpod: ${gitpodHost}`);
    } catch (e) { console.error("Gitpod URL Error", e); }
  }
  else if (process.env.CODESPACE_NAME && process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN) {
    const codespaceHost = `${process.env.CODESPACE_NAME}-${port}.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`;
    allowedHosts.push(codespaceHost);
    console.log(`Detected Codespaces: ${codespaceHost}`);
  }
  allowedHosts.push('localhost'); // Always allow localhost
  // --- End Dynamic Host Detection ---

  return {
    plugins: [react()],

    // --- REMOVE the worker configuration block ---
    // worker: {
    //   format: '...',
    // },

    // --- Server configuration ---
    server: {
      host: true, // Important for containers
      port: port,
      allowedHosts: allowedHosts,
      // --- KEEP these headers for SharedArrayBuffer etc. ---
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
      // --- ------------------------------------------- ---
    },

    // --- Keep this if it was in your successful config ---
    optimizeDeps: {
      exclude: ['stockfish'] // Might prevent Vite from trying to pre-bundle
    },
  };
});