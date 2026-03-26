
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ShortcutConfig, ShortcutDef } from '../types';
import { formatShortcut } from './Tooltip';
import { useTranslation } from '../translations';

// Toggle component (reused from ControlPanel)
const Toggle: React.FC<{ 
  label: string; 
  checked: boolean; 
  onChange: (checked: boolean) => void; 
  activeColor?: string;
  className?: string;
}> = ({ label, checked, onChange, activeColor = "text-sky-400", className = "" }) => (
  <label className={`flex items-center gap-2 cursor-pointer group ${className}`}>
    <div className={`w-6 h-3 rounded-full border transition-colors relative ${checked ? 'bg-sky-600/20 border-sky-500/50' : 'bg-slate-800 border-white/10'}`}>
      <div className={`absolute top-0.5 left-0.5 w-1.5 h-1.5 rounded-full transition-all ${checked ? `bg-sky-400 translate-x-3` : 'bg-slate-500 translate-x-0'}`} />
    </div>
    {label && (
      <span className={`text-[10px] font-bold uppercase transition-colors ${checked ? activeColor : 'text-slate-500 group-hover:text-slate-400'}`}>
        {label}
      </span>
    )}
    <input type="checkbox" className="hidden" checked={checked} onChange={e => onChange(e.target.checked)} />
  </label>
);

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ShortcutConfig;
  onSave: (newConfig: ShortcutConfig) => void;
  onReset: () => void;
  // Language settings
  language?: string;
  onLanguageChange?: (lang: string) => void;
  // Tooltips settings
  showTooltips?: boolean;
  onTooltipsChange?: (show: boolean) => void;
}

// Helper function to translate shortcut action names
const translateShortcutAction = (action: keyof ShortcutConfig, t: (key: string) => string): string => {
  const actionTranslations: Record<keyof ShortcutConfig, string> = {
    switchToGlobalTab: t('switchToGlobalTab') || 'Switch to Global Tab',
    switchToTextTab: t('switchToTextTab') || 'Switch to Text Tab',
    switchToLetterCtrlTab: t('switchToLetterCtrlTab') || 'Switch to Letter Control Tab',
    switchToHubsTab: t('switchToHubsTab') || 'Switch to Hubs Tab',
    switchToAbstractTab: t('switchToAbstractTab') || 'Switch to Abstract Tab',
    switchToPlanesTab: t('switchToPlanesTab') || 'Switch to Planes Tab',
    toggleView: t('toggleView') || 'Toggle View',
    forceRegenerate: t('forceRegenerate') || 'Force Regenerate',
    exportCombinedSTL: t('exportCombinedSTL') || 'Export Combined STL',
    exportBasePlaneSTL: t('exportBasePlaneSTL') || 'Export Base Plane STL',
    exportCrossPlaneSTL: t('exportCrossPlaneSTL') || 'Export Cross Plane STL',
    exportTiltPlaneSTL: t('exportTiltPlaneSTL') || 'Export Tilt Plane STL',
    saveProject: t('saveProject') || 'Save Project',
    loadProject: t('loadProject') || 'Load Project',
    undo: t('undo') || 'Undo',
    redo: t('redo') || 'Redo',
  };
  return actionTranslations[action] || action.replace(/([A-Z])/g, ' $1').trim();
};

const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose, config, onSave, onReset, language = 'en', onLanguageChange, showTooltips, onTooltipsChange }) => {
  const { t } = useTranslation(language);
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
      <div className="bg-slate-900 rounded-2xl border border-white/10 shadow-2xl w-[80vw] max-w-6xl max-h-[85vh] flex flex-col m-4">
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-white/5 shrink-0">
            <h2 className="text-lg font-black text-white uppercase tracking-tight">{t('settings')}</h2>
            <button onClick={onClose} className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>

        {/* Language and Tooltips Section */}
        <div className="p-5 border-b border-white/5 bg-slate-800/30">
            <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-300">{t('Language')}</span>
                <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-slate-300">{t('Tooltips')}</span>
                    {onTooltipsChange && (
                        <Toggle 
                            label={showTooltips ? t('ON') : t('OFF')} 
                            checked={showTooltips} 
                            onChange={onTooltipsChange} 
                        />
                    )}
                </div>
            </div>
            <div className="flex items-center justify-between mb-3">
                <div className="flex-1">
                    <div className="grid grid-cols-3 gap-1 bg-slate-900 p-1 rounded-lg">
                        {[
                            { code: 'en', name: 'English' },
                            { code: 'es', name: 'Español' },
                            { code: 'fr', name: 'Français' },
                            { code: 'de', name: 'Deutsch' },
                            { code: 'zh', name: '中文' },
                            { code: 'ja', name: '日本語' }
                        ].map(lang => (
                            <button 
                                key={lang.code} 
                                onClick={() => onLanguageChange(lang.code)} 
                                className={`py-1.5 text-[10px] font-black uppercase rounded transition-all ${language === lang.code ? 'bg-sky-500 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                {t(lang.name)}
                            </button>
                        ))}
                    </div>
                </div>
                {language !== 'en' && (
                    <button onClick={() => onLanguageChange('en')} className="text-[10px] text-slate-500 hover:text-rose-400 transition-colors ml-3">{t('reset')}</button>
                )}
            </div>
        </div>

        {/* Keyboard Shortcuts Header */}
        <div className="px-5 pt-4 pb-2">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('Keyboard Shortcuts')}</h3>
        </div>

        {/* Scrollable List */}
        <div className="flex-1 overflow-y-auto p-5 pt-2 space-y-2 custom-scrollbar max-h-72">
            <div className="grid grid-cols-4 gap-1.5">
                {(Object.keys(tempConfig) as Array<keyof ShortcutConfig>).map((action) => (
                    <div key={action} className="flex items-center justify-between p-1 bg-slate-800/50 rounded-lg border border-white/5 hover:border-white/10 transition-colors">
                        <span className="text-[12px] font-bold text-slate-300 mr-0.5 truncate flex-1">{translateShortcutAction(action, t)}</span>
                        <button 
                            onClick={() => setListeningFor(action)}
                            className={`min-w-[32px] h-5 px-0.5 rounded text-[10px] font-mono font-bold transition-all border ${
                                listeningFor === action 
                                    ? 'bg-sky-500 text-white border-sky-400 animate-pulse' 
                                    : 'bg-slate-900 text-sky-400 border-white/10 hover:border-sky-500/50'
                            }`}
                        >
                            {listeningFor === action ? '...' : formatShortcut(tempConfig[action])}
                        </button>
                    </div>
                ))}
            </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-5 border-t border-white/5 shrink-0 bg-slate-900/50 rounded-b-2xl">
            <button onClick={onReset} className="px-3 py-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 text-[10px] font-black uppercase transition-all">
                {t('Reset Defaults')}
            </button>
            <div className="flex-1"></div>
            <button onClick={onClose} className="px-3 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 text-[10px] font-black uppercase transition-all">
                {t('cancel')}
            </button>
            <button onClick={() => { onSave(tempConfig); onClose(); }} className="px-4 py-2 rounded-lg bg-sky-600 text-white hover:bg-sky-500 shadow-lg shadow-sky-500/20 text-[10px] font-black uppercase transition-all">
                {t('Save Changes')}
            </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ShortcutsModal;
