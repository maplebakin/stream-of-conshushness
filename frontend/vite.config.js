// frontend/vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,           // <— lock it in
    proxy: {
      '/api': 'http://localhost:3000',
      '/graphql': 'http://localhost:3000'
    }
  }
})
