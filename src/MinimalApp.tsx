import React from 'react';

console.log('🧪 Testing minimal App component...');

const MinimalApp = () => {
  console.log('🎨 MinimalApp rendering...');
  
  return React.createElement('div', {
    style: {
      padding: '40px',
      background: 'linear-gradient(135deg, #ff6b6b 0%, #f59e0b 100%)',
      borderRadius: '12px',
      color: 'white',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '24px',
      textAlign: 'center'
    },
    children: [
      React.createElement('h1', {
        style: { color: '#1f2937', marginBottom: '20px' },
        children: '🧪 Minimal App Component'
      }),
      React.createElement('p', {
        style: { marginBottom: '20px', lineHeight: '1.5' },
        children: 'If you see this, the minimal App component works!'
      }),
      React.createElement('p', {
        style: { marginBottom: '20px' },
        children: 'The original App.tsx has issues that need to be debugged.'
      })
    ]
  });
};

export default MinimalApp;
