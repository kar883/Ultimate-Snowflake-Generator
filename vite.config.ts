import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
  ],
  
  worker: {
    format: 'es',
    plugins: () => [react()]
  },
  
  optimizeDeps: {
    exclude: ['pyodide', 'manifold-3d'] // Don't try to bundle Pyodide or manifold-3d - they load WASM
  },
  
  build: {
    target: 'esnext', // Pyodide requires modern JavaScript
    rollupOptions: {
      output: {
        manualChunks: {
          // Keep worker separate
          'worker': ['./src/csg.worker.ts']
        }
      }
    }
  },
  
  server: {
    headers: {
      // Comment out COEP headers for development to allow CDN resources
      // 'Cross-Origin-Opener-Policy': 'same-origin',
      // 'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'cross-origin'
    },
    fs: {
      // Allow serving files from node_modules/manifold-3d
      allow: ['..']
    }
  },
  
  assetsInclude: ['**/*.wasm'],
  
  define: {
    global: 'globalThis'
  }
})
