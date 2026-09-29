import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Vitest config: run component tests against the demo (mock) API so the
  // in-browser mock contract stays covered without a backend or database.
  test: {
    environment: "jsdom",
    env: { VITE_USE_MOCK: "true" },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
