
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  
  server: {
    // Enable HTTPS for local development (required for Local Font Access API)
    // https: false, // Removed to resolve TS error. Default is HTTP.
    
    headers: {
      // Enable Permissions Policy for local-fonts (no quotes around self)
      'Permissions-Policy': 'local-fonts=(self)'
    },
    
    // Exclude problematic directories from scanning
    fs: {
      // Only allow access to specific directories
      allow: ['..', 'public', 'src'],
      deny: ['cavalier_contours', 'dist-electron']
    }
  },
  
  preview: {
    headers: {
      'Permissions-Policy': 'local-fonts=(self)'
    },
  },
  
  // Optimize build
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'three': ['three'],
          'three-examples': ['three/examples/jsm/exporters/STLExporter', 'three/examples/jsm/utils/BufferGeometryUtils'],
          'opentype': ['opentype.js'],
          'ai': ['@google/genai'],
          'zip': ['jszip'],
        },
      },
    },
    // Increase chunk size warning limit to reduce noise
    chunkSizeWarningLimit: 1000,
  },
});
