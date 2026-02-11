
import React, { useState, useEffect } from 'react';

interface Font {
  family: string;
  fullName: string;
  postscriptName: string;
  style: string;
}

interface LocalFontPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFontSelected: (fontName: string, fontData: ArrayBuffer) => void;
}

const LocalFontPickerModal: React.FC<LocalFontPickerModalProps> = ({ 
  isOpen, 
  onClose, 
  onFontSelected 
}) => {
  const [fonts, setFonts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadSystemFonts();
    }
  }, [isOpen]);

  const loadSystemFonts = async () => {
    setLoading(true);
    setError('');
    
    try {
      // Check if API is available
      if (!('queryLocalFonts' in window)) {
        throw new Error('Local Font Access API not supported.\n\nRequires Chrome/Edge 103+ with HTTPS');
      }

      // Request font access with user gesture
      const availableFonts = await (window as any).queryLocalFonts();
      
      if (availableFonts.length === 0) {
        throw new Error('No fonts found or permission denied');
      }

      // Sort by family name
      availableFonts.sort((a: any, b: any) => 
        (a.family || a.fullName).localeCompare(b.family || b.fullName)
      );
      
      setFonts(availableFonts);
      
    } catch (err: any) {
      console.error('Font loading error:', err);
      
      if (err.name === 'NotAllowedError') {
        setError('❌ Permission denied. Please allow font access when prompted by your browser.');
      } else if (err.message.includes('Permissions Policy')) {
        setError('❌ Font access blocked by security policy.\n\n✅ Solutions:\n• Use HTTPS (required)\n• Use Chrome/Edge 103+\n• Or upload fonts manually');
      } else {
        setError(`❌ ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSelectFont = async (font: any) => {
    setLoading(true);
    try {
      const blob = await font.blob();
      const arrayBuffer = await blob.arrayBuffer();
      onFontSelected(font.fullName || font.family, arrayBuffer);
      onClose();
    } catch (err: any) {
      setError(`Failed to load font: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const filteredFonts = fonts.filter(f => 
    (f.fullName || f.family || '').toLowerCase().includes(search.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 rounded-2xl border border-white/10 shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col m-4">
        {/* Header */}
        <div className="p-6 border-b border-white/5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-black text-white uppercase tracking-tight">
              System Fonts
            </h2>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-white/5 rounded-lg transition-colors"
            >
              <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Search */}
          <input
            type="text"
            placeholder="Search fonts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:ring-2 ring-sky-500/50 outline-none"
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {loading && !fonts.length ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 border-4 border-sky-500 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-slate-400 text-sm">Loading system fonts...</p>
              <p className="text-slate-600 text-xs mt-2">You may be prompted to allow access</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 px-8">
              <div className="text-6xl mb-4">⚠️</div>
              <pre className="text-slate-400 text-sm whitespace-pre-wrap text-center">{error}</pre>
              <div className="flex gap-2 mt-6">
                <button
                  onClick={loadSystemFonts}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-sm font-bold transition-all"
                >
                  Try Again
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-bold transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-4 text-sm text-slate-500">
                Found {filteredFonts.length} {search ? 'matching ' : ''}fonts
              </div>
              <div className="grid grid-cols-1 gap-2">
                {filteredFonts.map((font, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSelectFont(font)}
                    disabled={loading}
                    className="p-4 bg-slate-800/40 hover:bg-slate-800 border border-white/5 hover:border-sky-500/50 rounded-xl text-left transition-all group disabled:opacity-50"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white font-bold text-sm mb-1" style={{ fontFamily: font.family }}>
                          {font.fullName || font.family}
                        </p>
                        <p className="text-slate-500 text-xs mb-2">
                          {font.style || 'Regular'} • {font.family}
                        </p>
                        <div className="text-slate-100 text-sm" style={{ fontFamily: font.family, fontSize: 16 }}>
                          {/* Render the font name as a live preview */}
                          {font.fullName || font.family}
                        </div>
                      </div>
                      <svg className="w-5 h-5 text-sky-500 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer Help */}
        <div className="p-4 border-t border-white/5 bg-slate-800/30">
          <div className="flex items-start gap-3 text-xs text-slate-400">
            <div className="text-lg">💡</div>
            <div>
              <strong className="text-slate-300">Requirements:</strong> Chrome/Edge 103+ with HTTPS (secure connection). 
              If blocked, use the "Upload Font" button instead.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Integration button component
interface SystemFontButtonProps {
  onFontLoaded: (fontName: string, fontData: ArrayBuffer) => void;
  className?: string;
  compact?: boolean;
  t?: (key: string) => string;
}

export const SystemFontButton: React.FC<SystemFontButtonProps> = ({ onFontLoaded, className, compact, t }) => {
  const [showModal, setShowModal] = useState(false);
  const hasAPI = 'queryLocalFonts' in window;

  const defaultClasses = "w-full px-4 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:opacity-50 text-white text-[11px] font-black uppercase rounded-xl transition-all shadow-lg";

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        disabled={!hasAPI}
        className={className || defaultClasses}
        title={hasAPI ? (t ? t('Browse System Fonts') : 'Browse system fonts') : (t ? t('Requires Chrome/Edge') : 'Requires Chrome/Edge 103+')}
      >
        {compact ? (
           hasAPI ? '🖥️' : '🚫'
        ) : (
           hasAPI ? '🖥️ System Fonts' : '🚫 System Fonts (Not Supported)'
        )}
      </button>

      <LocalFontPickerModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onFontSelected={onFontLoaded}
      />
    </>
  );
};

export default LocalFontPickerModal;
