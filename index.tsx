import React from 'react';
import ReactDOM from 'react-dom/client';
import './src/index.css';
import App from './src/App.tsx';

console.log('Ultimate Snowflake Generator v1.0.8 - Restored');

// Prevent stale app code from lingering via old service workers/caches.
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => {
      registration.unregister().catch(() => undefined);
    });
  }).catch(() => undefined);
}
if (typeof window !== 'undefined' && 'caches' in window) {
  caches.keys().then((keys) => {
    keys
      .filter((k) => k.startsWith('snowflake-'))
      .forEach((k) => {
        caches.delete(k).catch(() => undefined);
      });
  }).catch(() => undefined);
}

try {
  console.log('✅ App.tsx imported successfully');
  
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error("Could not find root element to mount to");
  }

  console.log('✅ Root element found, mounting React app...');
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <App />
  );
  console.log('✅ React app mounted successfully');
} catch (error) {
  console.error('❌ Error loading app:', error);
  console.error('❌ Error stack:', error.stack);
  
  // Show detailed error information
  document.body.innerHTML = `
    <div style="padding: 20px; background: #dc2626; color: white; font-family: monospace; border-radius: 8px;">
      <h1>❌ Critical Application Error</h1>
      <h2>Error Details:</h2>
        <p><strong>${error.name || 'Unknown Error'}</strong></p>
      <p><strong>Message:</strong> ${error.message || 'No error message'}</p>
      <details>
        <summary>Stack Trace</summary>
          <pre style="background: #1f2937; color: #fbbf24; padding: 10px; border-radius: 4px; overflow: auto;">${error.stack || 'No stack trace available'}</pre>
        </details>
        <h3>Troubleshooting Steps:</h3>
        <ol>
          <li>Check browser console for additional errors</li>
          <li>Try refreshing the page (Ctrl+Shift+R)</li>
          <li>Check if browser extensions are blocking scripts</li>
          <li>Verify all files are present in src/ directory</li>
          <li>Try using the Pyodide CSG system for guaranteed manifold geometry output</li>
        </ol>
      </div>
    `;
}
