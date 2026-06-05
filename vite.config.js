import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Simplificada - sin proxy de API (la API se llama desde Electron principal)
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          charts: ['recharts'],
          tesseract: ['tesseract.js']
        }
      }
    }
  }
})
