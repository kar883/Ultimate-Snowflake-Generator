import React, { useState, useEffect } from 'react';

interface UpdateNotificationProps {
  currentVersion: string;
  onDismiss?: () => void;
}

const UpdateNotification: React.FC<UpdateNotificationProps> = ({ currentVersion, onDismiss }) => {
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  const electronAPI = (window as any).electronAPI;

  useEffect(() => {
    const checkForUpdates = async () => {
      try {
        setIsLoading(true);
        if (!electronAPI?.checkForUpdates) {
          // Web/Vite mode: no update banner; update checking is Electron-owned.
          setIsVisible(false);
          return;
        }

        const result = await electronAPI.checkForUpdates();
        if (!result?.ok) {
          throw new Error(result?.error || 'Failed to check for updates');
        }

        const latest = result.latestVersion;
        const runningVersion = result.currentVersion || currentVersion;
        
        console.log('Current version:', runningVersion, 'Latest version:', latest);
        
        if (result.hasUpdate && latest !== runningVersion) {
          setLatestVersion(latest);
          setIsVisible(true);
          console.log('New version available:', latest);
        } else {
          console.log('App is up to date');
        }
      } catch (err) {
        console.error('Failed to check for updates:', err);
        setError('Failed to check for updates');
      } finally {
        setIsLoading(false);
      }
    };

    // Check for updates after 3 seconds
    const timer = setTimeout(checkForUpdates, 3000);
    
    return () => clearTimeout(timer);
  }, [currentVersion, electronAPI]);

  const handleDownload = () => {
    const url = 'https://github.com/kar883/Ultimate-Snowflake-Generator/releases/latest';
    if (electronAPI?.openExternal) {
      electronAPI.openExternal(url);
    } else {
      window.open(url, '_blank');
    }
    handleDismiss();
  };

  const handleDismiss = () => {
    setIsVisible(false);
    onDismiss?.();
  };

  // Auto-dismiss after 30 seconds
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(handleDismiss, 30000);
      return () => clearTimeout(timer);
    }
  }, [isVisible]);

  if (!isVisible || isLoading || error) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-[9999] animate-in slide-in-from-right duration-300">
      <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white p-4 rounded-lg shadow-xl border border-white/10 max-w-sm">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <div>
            <div className="font-bold text-sm">Update Available!</div>
            <div className="text-xs opacity-90">Version {latestVersion} is now available</div>
          </div>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={handleDownload}
            className="flex-1 bg-white/20 hover:bg-white/30 border border-white/30 text-white px-3 py-2 rounded-md text-xs font-semibold transition-colors"
          >
            Download
          </button>
          <button
            onClick={handleDismiss}
            className="flex-1 bg-transparent hover:bg-white/10 border border-white/20 text-white px-3 py-2 rounded-md text-xs font-semibold transition-colors"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpdateNotification;
