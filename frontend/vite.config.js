import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
  '/add-appointment': 'http://localhost:3000',
  '/calendar-data': 'http://localhost:3000',
  '/entries': 'http://localhost:3000',
  '/add-entry': 'http://localhost:3000',
  '/edit-entry': 'http://localhost:3000',
  '/delete-entry': 'http://localhost:3000',
  '/api': 'http://localhost:3000'
}

  }
});
