import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // http://localhost:5173/api/... -> https://retfw.smartgov.id/framework/...
      '/api': {
        target: 'https://retfw.smartgov.id',
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/api/, '/framework'),
      },
    },
  },
});
