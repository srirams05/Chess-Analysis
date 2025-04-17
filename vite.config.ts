import { defineConfig, } from 'vite'; // Import loadEnv if needed, or use process.env directly
import react from '@vitejs/plugin-react-swc';

export default defineConfig(() => { // Remove { mode }
  // Load .env files if you use them (optional)
  // process.env = {...process.env, ...loadEnv(mode, process.cwd())};

  const port = 5173; // Define your port
  const allowedHosts = [];

  // --- Dynamically Detect Host ---

  // Check for Gitpod environment variables
  if (process.env.GITPOD_WORKSPACE_URL) {
    // GITPOD_WORKSPACE_URL is like https://<workspace-id>.<cluster-id>.gitpod.io
    // We need to construct the port-specific URL: <port>-<workspace-id>.<cluster-id>.gitpod.io
    try {
        const url = new URL(process.env.GITPOD_WORKSPACE_URL);
        const gitpodHost = `${port}-${url.hostname}`;
        allowedHosts.push(gitpodHost);
        console.log(`Detected Gitpod, adding allowed host: ${gitpodHost}`);
    } catch (e) {
        console.error("Error parsing GITPOD_WORKSPACE_URL", e);
    }
  }
  // Check for Codespaces environment variables
  else if (process.env.CODESPACE_NAME && process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN) {
    // Format is typically: <codespace-name>-<port>.<codespaces-domain>
    const codespaceHost = `${process.env.CODESPACE_NAME}-${port}.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`;
    allowedHosts.push(codespaceHost);
    console.log(`Detected Codespaces, adding allowed host: ${codespaceHost}`);
  }

  // Add localhost for local development
  allowedHosts.push('localhost');

  // --- End Dynamic Host Detection ---


  // Return the configuration object
  return {
    plugins: [react()],
    server: {
      host: true, // Keep this! It's important for listening correctly.
      port: port,
      // Use the dynamically generated list
      // Only include allowedHosts if we actually added specific environment hosts
      // (though including localhost is usually fine regardless)
      ...(allowedHosts.length > 1 ? { allowedHosts: allowedHosts } : {}),

      // Or simpler, always include localhost at least:
      // allowedHosts: allowedHosts
    }
  };
});