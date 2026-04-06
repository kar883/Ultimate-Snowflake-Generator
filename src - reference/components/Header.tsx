
import React, { useState, useEffect } from 'react';
import ShortcutsModal from './ShortcutsModal';
import { ShortcutConfig } from '../types';

interface HeaderProps {
  projectName?: string;
  onProjectNameChange?: (name: string) => void;
  onInstall?: () => void;
  canInstall?: boolean;
  onSaveConfig?: () => void;
  onLoadConfig?: () => void;
  shortcuts?: ShortcutConfig;
  onUpdateShortcuts?: (config: ShortcutConfig) => void;
  onResetShortcuts?: () => void;
}

const Header: React.FC<HeaderProps> = ({ 
  projectName = "MySnowflake", 
  onProjectNameChange, 
  onInstall, 
  canInstall, 
  onSaveConfig, 
  onLoadConfig,
  shortcuts,
  onUpdateShortcuts,
  onResetShortcuts
}) => {
  const [localName, setLocalName] = useState(projectName);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    setLocalName(projectName);
  }, [projectName]);

  const handleCommit = () => {
    if (onProjectNameChange && localName !== projectName) {
      onProjectNameChange(localName);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleCommit();
  };

  const handleBlur = () => {
    handleCommit();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalName(e.target.value);
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between">
        {/* Left Side: Title and Info */}
        <div className="flex items-center space-x-4">
          <div className="w-10 h-10 bg-transparent flex items-center justify-center text-3xl text-white">
            ❄️
          </div>
          <div className="flex flex-col justify-center">
            <h1 className="text-lg font-black bg-clip-text text-transparent bg-gradient-to-r from-white to-sky-200 tracking-tight leading-none mb-0.5">
              Ultimate Snowflake Generator
            </h1>
            <div className="flex items-center space-x-2">
              <span className="text-[9px] font-bold text-slate-400 tracking-widest uppercase">
                V1.0 • Created by: Kyle Russell
              </span>
            </div>
          </div>
        </div>
        
        {/* Right Side: Inline Controls */}
        <div className="flex items-center gap-2">
          {/* Settings Button */}
          <button 
            onClick={() => setShowSettings(true)}
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-white/5 transition-all"
            title="Settings & Shortcuts"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>

          {/* Project Name Input */}
          <div className="relative group w-48 h-9">
            <input
            type="text"
            value={localName}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            placeholder="PROJECT NAME"
            className="h-full bg-slate-900 border border-white/10 rounded-lg px-3 text-xs font-bold text-right text-white placeholder-slate-600 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none w-full transition-all"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[9px] font-black text-slate-600 uppercase pointer-events-none">
            Project
            </span>
          </div>

          <div className="w-px h-5 bg-white/10 mx-1"></div>

          {/* Buttons Group */}
          {canInstall && (
            <button 
            onClick={onInstall} 
            className="h-9 px-4 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition-all shadow-lg"
            >
            Install
            </button>
          )}
          <button 
            onClick={onSaveConfig} 
            className="h-9 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-[10px] font-black uppercase tracking-wider border border-white/5 transition-all"
          >
            Save
          </button>
          <button 
            onClick={onLoadConfig} 
            className="h-9 px-4 bg-slate-800 hover:bg-slate-700 text-sky-400 hover:text-sky-300 rounded-lg text-[10px] font-black uppercase tracking-wider border border-white/5 transition-all"
          >
            Load
          </button>
        </div>
      </div>
      
      {shortcuts && onUpdateShortcuts && onResetShortcuts && (
          <ShortcutsModal 
            isOpen={showSettings} 
            onClose={() => setShowSettings(false)} 
            config={shortcuts}
            onSave={onUpdateShortcuts}
            onReset={onResetShortcuts}
          />
      )}
    </div>
  );
};

export default Header;
