// frontend/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { env } from 'node:process';

const ANALYZE = env.ANALYZE === '1';

export default defineConfig({
  plugins: [
    react(),
    ANALYZE &&
      visualizer({
        filename: 'dist/stats.html',
        open: false,
        gzipSize: true,
        brotliSize: true,
      }),
  ].filter(Boolean),

  resolve: {
    // single source of truth for React
    dedupe: ['react', 'react-dom'],
  },

  optimizeDeps: {
    // rebuild the pre-bundle cleanly and make sure react-hot-toast + floating-ui
    // resolve against the same pre-bundled React
    force: true,
    include: [
      'react',
      'react-dom',
      'react-hot-toast',
      '@floating-ui/react',
      '@floating-ui/react-dom',
    ],
  },

  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/graphql': 'http://localhost:3000',
    },
  },

  build: {
    chunkSizeWarningLimit: 900,
    // IMPORTANT: remove manualChunks while we stabilize the graph
    // (route-level React.lazy still gives you code-splitting)
    sourcemap: false,
  },
});
