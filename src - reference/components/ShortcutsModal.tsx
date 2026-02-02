
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ShortcutConfig, ShortcutDef } from '../types';
import { formatShortcut } from './Tooltip';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ShortcutConfig;
  onSave: (newConfig: ShortcutConfig) => void;
  onReset: () => void;
}

const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose, config, onSave, onReset }) => {
  const [tempConfig, setTempConfig] = useState<ShortcutConfig>(config);
  const [listeningFor, setListeningFor] = useState<keyof ShortcutConfig | null>(null);

  useEffect(() => {
    if (isOpen) {
        setTempConfig(config);
        setListeningFor(null);
    }
  }, [isOpen, config]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (!listeningFor) return;
        
        e.preventDefault();
        e.stopPropagation();

        // Ignore modifier-only presses
        if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

        const newDef: ShortcutDef = {
            key: e.key,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            altKey: e.altKey,
            metaKey: e.metaKey,
        };

        setTempConfig(prev => ({ ...prev, [listeningFor]: newDef }));
        setListeningFor(null);
    };

    if (listeningFor) {
        window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [listeningFor]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 rounded-2xl border border-white/10 shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col m-4">
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-white/5 shrink-0">
            <h2 className="text-lg font-black text-white uppercase tracking-tight">Keyboard Shortcuts</h2>
            <button onClick={onClose} className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>

        {/* Scrollable List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-2 custom-scrollbar">
            {(Object.keys(tempConfig) as Array<keyof ShortcutConfig>).map((action) => (
                <div key={action} className="flex items-center justify-between p-2 bg-slate-800/50 rounded-lg border border-white/5 hover:border-white/10 transition-colors">
                    <span className="text-xs font-bold text-slate-300 capitalize">{action.replace(/([A-Z])/g, ' $1').trim()}</span>
                    <button 
                        onClick={() => setListeningFor(action)}
                        className={`min-w-[80px] h-7 px-2 rounded-md text-[10px] font-mono font-bold transition-all border ${
                            listeningFor === action 
                                ? 'bg-sky-500 text-white border-sky-400 animate-pulse' 
                                : 'bg-slate-900 text-sky-400 border-white/10 hover:border-sky-500/50'
                        }`}
                    >
                        {listeningFor === action ? 'Press keys...' : formatShortcut(tempConfig[action])}
                    </button>
                </div>
            ))}
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-5 border-t border-white/5 shrink-0 bg-slate-900/50 rounded-b-2xl">
            <button onClick={onReset} className="px-3 py-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 text-[10px] font-black uppercase transition-all">
                Reset Defaults
            </button>
            <div className="flex-1"></div>
            <button onClick={onClose} className="px-3 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 text-[10px] font-black uppercase transition-all">
                Cancel
            </button>
            <button onClick={() => { onSave(tempConfig); onClose(); }} className="px-4 py-2 rounded-lg bg-sky-600 text-white hover:bg-sky-500 shadow-lg shadow-sky-500/20 text-[10px] font-black uppercase transition-all">
                Save Changes
            </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ShortcutsModal;
