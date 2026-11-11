
import React, { useState, useEffect } from 'react';
import ShortcutsModal from './ShortcutsModal';
import { AppearanceSettings, ShortcutConfig } from '../types';

export interface ExamplePreset {
  id: string;
  label: string;
  group?: string | null;
  onSelect: () => void;
}

interface HeaderProps {
  projectName?: string;
  onProjectNameChange?: (name: string) => void;
  onInstall?: () => void;
  canInstall?: boolean;
  onSaveConfig?: () => void;
  onLoadConfig?: () => void;
  onResetApp?: () => void;
  onAbout?: () => void;  // Add About handler
  shortcuts?: ShortcutConfig;
  onUpdateShortcuts?: (config: ShortcutConfig) => void;
  onResetShortcuts?: () => void;
  onSaveAsDefault?: () => void;
  onRestoreFactoryDefaults?: () => void;
  appVersion?: string;
  // Language and tooltips settings
  language?: string;
  onLanguageChange?: (lang: string) => void;
  showTooltips?: boolean;
  onTooltipsChange?: (show: boolean) => void;
  appearance?: AppearanceSettings;
  onAppearanceChange?: (changes: Partial<AppearanceSettings>) => void;
  onResetAppearance?: () => void;
  modelColor?: string;
  onModelColorChange?: (color: string) => void;
  measurementColor?: string;
  onMeasurementColorChange?: (color: string) => void;
  tutorialEnabled?: boolean;
  onTutorialEnabledChange?: (enabled: boolean) => void;
  onShowTutorial?: () => void;
  tutorialAdvanced?: boolean;
  onTutorialAdvancedChange?: (advanced: boolean) => void;
  examplePresets?: ExamplePreset[];
}

const Header: React.FC<HeaderProps> = ({
  projectName = "MySnowflake",
  onProjectNameChange,
  onInstall,
  canInstall,
  onSaveConfig,
  onLoadConfig,
  onResetApp,
  onAbout,  // Add About handler
  shortcuts,
  onUpdateShortcuts,
  onResetShortcuts,
  onSaveAsDefault,
  onRestoreFactoryDefaults,
  appVersion = '1.1.4',
  language = 'en',
  onLanguageChange,
  showTooltips,
  onTooltipsChange,
  appearance,
  onAppearanceChange,
  onResetAppearance,
  modelColor,
  onModelColorChange,
  measurementColor,
  onMeasurementColorChange,
  tutorialEnabled,
  onTutorialEnabledChange,
  onShowTutorial,
  tutorialAdvanced,
  onTutorialAdvancedChange,
  examplePresets = []
}) => {
  const [localName, setLocalName] = useState(projectName);
  const [showSettings, setShowSettings] = useState(false);
  const [showExamples, setShowExamples] = useState(false);

  useEffect(() => {
    setLocalName(projectName);
  }, [projectName]);

  const handleCommit = () => {
    if (onProjectNameChange && localName !== projectName) {
      onProjectNameChange(localName);
    }
  };

  const handleAbout = () => {
    onAbout?.();
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
              <button
                type="button"
                onClick={handleAbout}
                className="text-[9px] font-bold text-slate-400 hover:text-sky-300 tracking-widest uppercase transition-colors"
                title="About Ultimate Snowflake Generator"
              >
                V{appVersion}
              </button>
              <span className="text-[9px] font-bold text-slate-500 tracking-widest uppercase">•</span>
              <button
                type="button"
                onClick={handleAbout}
                className="text-[9px] font-bold text-slate-400 hover:text-sky-300 tracking-widest uppercase transition-colors"
                title="About Ultimate Snowflake Generator"
              >
                Created by Kyle Russell
              </button>
            </div>
          </div>
        </div>

        {/* Right Side: Inline Controls */}
        <div className="flex items-center gap-2">
          {/* Reset Button */}
          <button
            onClick={onResetApp}
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-orange-600/20 hover:bg-orange-600/30 text-orange-400 hover:text-orange-300 border border-orange-500/20 transition-all"
            title="Reset All Settings to Defaults"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>

          {/* Settings Button */}
          <button
            data-tutorial="settings"
            onClick={() => setShowSettings(true)}
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-white/5 transition-all"
            title="Settings & Shortcuts"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          </button>

          {/* Example Presets */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowExamples((current) => !current)}
              className="h-9 px-3 flex items-center gap-1.5 rounded-lg bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 hover:text-sky-200 border border-sky-500/20 transition-all text-[10px] font-black uppercase tracking-wider"
              title="Load an example preset"
              aria-haspopup="menu"
              aria-expanded={showExamples}
            >
              Examples
              <svg className={`w-3.5 h-3.5 transition-transform ${showExamples ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {showExamples && (
              <div role="menu" className="absolute right-0 top-11 z-[70] min-w-56 rounded-lg border border-white/10 bg-slate-900 p-1.5 shadow-2xl">
                {examplePresets.length > 0 ? examplePresets.map((preset, i) => (
                  <React.Fragment key={preset.id}>
                    {preset.group && preset.group !== examplePresets[i - 1]?.group && (
                      <div className="px-3 pt-2 pb-1 text-[9px] font-black uppercase tracking-wider text-slate-500">
                        {preset.group}
                      </div>
                    )}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      preset.onSelect();
                      setShowExamples(false);
                    }}
                    className="w-full rounded-md px-3 py-2 text-left text-[10px] font-bold text-slate-300 hover:bg-sky-500/20 hover:text-white transition-colors"
                  >
                    {preset.label}
                  </button>
                  </React.Fragment>
                )) : (
                  <div className="px-3 py-2 text-[10px] font-semibold text-slate-500 whitespace-nowrap">
                    No example presets available yet
                  </div>
                )}
              </div>
            )}
          </div>

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
            data-tutorial="save"
            onClick={onSaveConfig}
            className="h-9 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-[10px] font-black uppercase tracking-wider border border-white/5 transition-all"
          >
            Save
          </button>
          <button
            data-tutorial="load"
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
            onAbout={() => {
              setShowSettings(false);
              onAbout?.();
            }}
            config={shortcuts}
            onSave={onUpdateShortcuts}
            onReset={onResetShortcuts}
            language={language}
            onLanguageChange={onLanguageChange}
            showTooltips={showTooltips}
            onTooltipsChange={onTooltipsChange}
            onSaveAsDefault={onSaveAsDefault}
            onRestoreFactoryDefaults={onRestoreFactoryDefaults}
            appearance={appearance}
            onAppearanceChange={onAppearanceChange}
            onResetAppearance={onResetAppearance}
            modelColor={modelColor}
            onModelColorChange={onModelColorChange}
            measurementColor={measurementColor}
            onMeasurementColorChange={onMeasurementColorChange}
            tutorialEnabled={tutorialEnabled}
            onTutorialEnabledChange={onTutorialEnabledChange}
            onShowTutorial={() => {
              setShowSettings(false);
              onShowTutorial?.();
            }}
            tutorialAdvanced={tutorialAdvanced}
            onTutorialAdvancedChange={onTutorialAdvancedChange}
          />
      )}

    </div>
  );
};

export default Header;
