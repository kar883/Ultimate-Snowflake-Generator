import React, { useEffect, useState } from 'react';
import buyMeACoffeeQrImage from '../assets/buymeacoffee-qr.png';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  version: string;
  requestUpdateCheckSignal?: number;
}

const REPO_URL = 'https://github.com/kar883/Ultimate-Snowflake-Generator';
const BUY_ME_A_COFFEE_URL = 'https://www.buymeacoffee.com/kylerussell';
const BUY_ME_A_COFFEE_BUTTON_IMG = 'https://img.buymeacoffee.com/button-api/?text=Buy me a coffee&emoji=&slug=kylerussell&button_colour=FFDD00&font_colour=000000&font_family=Cookie&outline_colour=000000&coffee_colour=ffffff';
const BUY_ME_A_COFFEE_LOGO_IMG = 'https://cdn.buymeacoffee.com/buttons/bmc-new-btn-logo.svg';

const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose, version, requestUpdateCheckSignal = 0 }) => {
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);

  const electronAPI = (window as any).electronAPI;
  const isDesktopBuild = !!electronAPI?.checkForUpdates;

  const handleOpenRepo = () => {
    if (electronAPI?.openExternal) {
      electronAPI.openExternal(REPO_URL);
      return;
    }
    window.open(REPO_URL, '_blank', 'noopener,noreferrer');
  };

  const handleOpenBuyMeACoffee = () => {
    if (electronAPI?.openExternal) {
      electronAPI.openExternal(BUY_ME_A_COFFEE_URL);
      return;
    }
    window.open(BUY_ME_A_COFFEE_URL, '_blank', 'noopener,noreferrer');
  };

  const handleCheckForUpdates = async () => {
    // If not Electron, show message
    if (!isDesktopBuild) {
      setUpdateStatus('Update check is only available in the desktop app build.');
      return;
    }
    // If Electron but no preload, show fallback
    if (!electronAPI?.checkForUpdates) {
      setUpdateStatus('Update check is not available (preload script missing). Please reinstall or contact support.');
      return;
    }
    try {
      setIsCheckingUpdates(true);
      setUpdateStatus('Checking for updates...');
      const result = await electronAPI.checkForUpdates();
      if (!result?.ok) {
        setUpdateStatus(result?.error || 'Unable to check for updates right now.');
        return;
      }
      if (result.hasUpdate && result.latestVersion) {
        setUpdateStatus(`Update available: v${result.latestVersion}`);
      } else {
        const running = result.currentVersion || version;
        setUpdateStatus(`You are up to date (v${running}).`);
      }
    } catch (error) {
      setUpdateStatus(error instanceof Error ? error.message : 'Unable to check for updates right now.');
    } finally {
      setIsCheckingUpdates(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    if (!requestUpdateCheckSignal) return;
    handleCheckForUpdates();
  }, [requestUpdateCheckSignal, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 rounded-2xl border border-white/10 shadow-2xl w-[600px] max-w-[96vw] max-h-[88vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex justify-between items-center px-5 pt-5 pb-3 border-b border-white/5 shrink-0">
          <h2 className="text-base font-black text-white uppercase tracking-tight">About Ultimate Snowflake Generator</h2>
          <button 
            onClick={onClose} 
            className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4 min-h-0">
          {/* App Info */}
          <div className="p-4 bg-slate-800/40 rounded-xl border border-white/5">
            <h3 className="text-sm font-black text-white mb-3">Ultimate Snowflake Generator</h3>
            <p className="text-[11px] text-slate-300 mb-4 leading-relaxed">
              Version {version} • Created by Kyle Russell
            </p>
            <p className="text-[11px] text-slate-400 mb-4 leading-relaxed">
              A beautiful 3D snowflake design generator for art and 3D printing. 
              Create stunning snowflake patterns with custom text, shapes, and fractal designs.
            </p>
            
            {/* GitHub Link */}
            <div className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-lg border border-white/10">
              <svg className="w-5 h-5 text-slate-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 .5C5.649.5.5 5.649.5 12c0 5.084 3.292 9.399 7.865 10.922.575.104.785-.25.785-.554 0-.273-.01-.997-.015-1.957-3.2.695-3.877-1.542-3.877-1.542-.523-1.327-1.278-1.68-1.278-1.68-1.045-.714.079-.699.079-.699 1.156.081 1.764 1.188 1.764 1.188 1.027 1.759 2.695 1.251 3.352.956.104-.744.402-1.251.731-1.539-2.555-.291-5.242-1.277-5.242-5.684 0-1.256.45-2.283 1.188-3.087-.119-.291-.515-1.463.112-3.05 0 0 .969-.31 3.175 1.179A11.06 11.06 0 0 1 12 6.095c.977.004 1.962.132 2.882.388 2.205-1.489 3.173-1.179 3.173-1.179.628 1.587.233 2.759.114 3.05.739.804 1.186 1.831 1.186 3.087 0 4.418-2.691 5.389-5.254 5.675.413.355.781 1.059.781 2.135 0 1.541-.014 2.784-.014 3.164 0 .307.208.664.79.553C20.211 21.396 23.5 17.082 23.5 12 23.5 5.649 18.351.5 12 .5Z"/>
              </svg>
              <div>
                <button
                  type="button"
                  onClick={handleOpenRepo}
                  className="text-[11px] font-black text-sky-400 hover:text-sky-300 transition-colors underline"
                >
                  View on GitHub
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleCheckForUpdates}
                disabled={isCheckingUpdates || !isDesktopBuild}
                className="inline-flex items-center justify-center rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-[11px] font-black text-sky-300 hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-70 transition-colors"
                title={!isDesktopBuild ? 'Update check only available in desktop app.' : undefined}
              >
                {isCheckingUpdates ? 'Checking Updates...' : 'Check for Updates'}
              </button>
              {updateStatus && (
                <p className="text-[11px] text-slate-300">{updateStatus}</p>
              )}
            </div>
          </div>

          {/* Buy Me a Coffee */}
          <div className="p-4 bg-slate-800/40 rounded-xl border border-white/5">
            <h4 className="text-xs font-black text-white mb-3">Buy Me a Coffee</h4>
            <div className="flex items-start gap-3 p-3 bg-slate-900/50 rounded-lg border border-white/10">
              <img
                src={BUY_ME_A_COFFEE_LOGO_IMG}
                alt="Buy Me a Coffee logo"
                className="w-8 h-8 flex-shrink-0"
              />
              <div className="space-y-2">
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  If you enjoy Ultimate Snowflake Generator and want to support future updates, you can buy me a coffee.
                </p>
                <div className="flex items-start gap-3 flex-wrap">
                  <a
                    href={BUY_ME_A_COFFEE_URL}
                    onClick={(e) => {
                      e.preventDefault();
                      handleOpenBuyMeACoffee();
                    }}
                    className="shrink-0"
                  >
                    <img
                      src={BUY_ME_A_COFFEE_BUTTON_IMG}
                      alt="Buy me a coffee"
                      className="h-10 w-auto"
                    />
                  </a>
                  <button
                    type="button"
                    onClick={handleOpenBuyMeACoffee}
                    className="inline-flex"
                    title="Open Buy Me a Coffee page"
                  >
                    <img
                      src={buyMeACoffeeQrImage}
                      alt="Buy Me a Coffee QR code for kylerussell"
                      className="w-32 max-w-full rounded-lg border border-white/15 bg-white"
                    />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* License */}
          <div className="p-4 bg-slate-800/40 rounded-xl border border-white/5">
            <h4 className="text-xs font-black text-white mb-3">License</h4>
            <p className="text-[11px] text-slate-300">
              CC BY-NC 4.0 • Attribution required. Non-commercial use only.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AboutModal;
