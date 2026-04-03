import React, { useState, useEffect, useRef } from 'react';
import { useFontPreloader } from '../utils/fontPreloader';

const FontPreloadIndicator: React.FC = () => {
  const { getProgress } = useFontPreloader();
  const [progress, setProgress] = useState({ isPreloading: false, loaded: 0, total: 0 });
  const [isVisible, setIsVisible] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Add CSS animation to document
  useEffect(() => {
    const styleId = 'font-preloader-spinner-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  useEffect(() => {
    const updateProgress = () => {
      const currentProgress = getProgress();
      
      // Only update state if progress actually changed
      setProgress(prev => {
        if (prev.isPreloading !== currentProgress.isPreloading ||
            prev.loaded !== currentProgress.loaded ||
            prev.total !== currentProgress.total) {
          return currentProgress;
        }
        return prev;
      });
      
      // Show indicator only when preloading is active
      if (currentProgress.isPreloading && !isVisible) {
        setIsVisible(true);
      } else if (!currentProgress.isPreloading && isVisible) {
        // Hide after a delay when complete
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setIsVisible(false), 2000);
      }
    };

    // Update progress every 500ms during preloading
    intervalRef.current = setInterval(updateProgress, 500);
    updateProgress(); // Initial update

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [getProgress]); // Remove isVisible from dependencies

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
    </div>
  );
};

export default FontPreloadIndicator;
