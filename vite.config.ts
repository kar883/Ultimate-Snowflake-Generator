
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  
  server: {
    // Enable HTTPS for local development (required for Local Font Access API)
    // https: false, // Removed to resolve TS error. Default is HTTP.
    
    headers: {
      // Enable Permissions Policy for local-fonts
      'Permissions-Policy': 'local-fonts=(self)',
      
      // Also enable other useful permissions
      'Feature-Policy': 'local-fonts "self"',
    },
  },
  
  preview: {
    headers: {
      'Permissions-Policy': 'local-fonts=(self)',
      'Feature-Policy': 'local-fonts "self"',
    },
  },
  
  // Optimize build
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'three': ['three'],
          'opentype': ['opentype.js'],
        },
      },
    },
  },
});
