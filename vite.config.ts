import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load environment variables based on mode
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    plugins: [react()],
    define: {
      // Make environment variables available in the app
      __APP_ENV__: JSON.stringify(env.VITE_NODE_ENV),
      __APP_TITLE__: JSON.stringify(env.VITE_APP_TITLE || 'Tax Map React'),
    },
    server: {
      proxy: {
        // Use environment variables for proxy configuration
        [env.VITE_API_PROXY_URL || '/api']: {
          target: env.VITE_PROXY_TARGET || 'https://retfw.smartgov.id',
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(new RegExp(`^${env.VITE_API_PROXY_URL || '/api'}`), env.VITE_PROXY_PATH || '/framework'),
          headers: {
            Accept: '*/*',
            Origin: env.VITE_PROXY_TARGET || 'https://retfw.smartgov.id',
            Referer: `${env.VITE_PROXY_TARGET || 'https://retfw.smartgov.id'}/`,
          },
        },
      },
    },
    // Build configuration for production
    build: {
      // Generate source maps for debugging
      sourcemap: mode === 'development',
      // Optimize for production
      minify: mode === 'production' ? 'terser' : false,
      // Chunk size warning limit
      chunkSizeWarningLimit: 1000,
    },
    // Environment-specific configuration
    envPrefix: 'VITE_',
  };
});
