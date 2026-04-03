import React, { useState, useEffect } from 'react';
import { useFontPreloader } from '../utils/fontPreloader';

const FontPreloadIndicator: React.FC = () => {
  const { getProgress } = useFontPreloader();
  const [progress, setProgress] = useState({ isPreloading: false, loaded: 0, total: 0 });
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const updateProgress = () => {
      const currentProgress = getProgress();
      setProgress(currentProgress);
      
      // Show indicator only when preloading is active
      if (currentProgress.isPreloading && !isVisible) {
        setIsVisible(true);
      } else if (!currentProgress.isPreloading && isVisible) {
        // Hide after a delay when complete
        const timer = setTimeout(() => setIsVisible(false), 2000);
        return () => clearTimeout(timer);
      }
    };

    // Update progress every 500ms during preloading
    const interval = setInterval(updateProgress, 500);
    updateProgress(); // Initial update

    return () => clearInterval(interval);
  }, [getProgress, isVisible]);

  if (!isVisible) return null;

  const percentage = progress.total > 0 ? Math.round((progress.loaded / progress.total) * 100) : 0;

  return (
    <div style={{
      position: 'fixed',
      top: '20px',
      right: '20px',
      background: 'rgba(0, 0, 0, 0.8)',
      color: 'white',
      padding: '12px 16px',
      borderRadius: '8px',
      fontSize: '14px',
      zIndex: 1000,
      backdropFilter: 'blur(10px)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
      minWidth: '200px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{
          width: '16px',
          height: '16px',
          border: '2px solid #ffffff',
          borderTop: '2px solid transparent',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <span>Loading fonts...</span>
      </div>
      
      <div style={{ 
        marginTop: '8px', 
        fontSize: '12px', 
        opacity: 0.8 
      }}>
        {progress.loaded} / {progress.total} ({percentage}%)
      </div>

      <div style={{
        marginTop: '6px',
        height: '4px',
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        borderRadius: '2px',
        overflow: 'hidden'
      }}>
        <div style={{
          height: '100%',
          backgroundColor: '#3b82f6',
          borderRadius: '2px',
          transition: 'width 0.3s ease',
          width: `${percentage}%`
        }} />
      </div>

      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default FontPreloadIndicator;
