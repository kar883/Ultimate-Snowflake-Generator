
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ShortcutConfig, ShortcutDef } from '../types';
import { formatShortcut } from './Tooltip';
import { useTranslation } from '../translations';

// ─────────────────────────────────────────────────────────────────────────────
// API KEY HELPERS  (exported so App.tsx can import them)
// ─────────────────────────────────────────────────────────────────────────────
const API_KEY_STORAGE = 'snowflake_gemini_api_key';

export const getApiKey = (): string | null => {
  // Vite env var first, then localStorage fallback
  const envKey = (import.meta as any).env?.VITE_GEMINI_API_KEY as string | undefined;
  if (envKey) return envKey;
  try { return localStorage.getItem(API_KEY_STORAGE) || null; } catch { return null; }
};

export const saveApiKey = (key: string) => {
  try { localStorage.setItem(API_KEY_STORAGE, key.trim()); } catch {}
};

export const clearSavedApiKey = () => {
  try { localStorage.removeItem(API_KEY_STORAGE); } catch {}
};

// ─────────────────────────────────────────────────────────────────────────────
// AI SCOPE CONFIG  (exported so App.tsx can import + use)
// ─────────────────────────────────────────────────────────────────────────────
export interface AiScopeConfig {
  // Tab master switches
  globalTabEnabled: boolean;
  textTabEnabled: boolean;
  hubsTabEnabled: boolean;
  abstractShapesTabEnabled: boolean;
  abstractFractalsTabEnabled: boolean;
  // Global
  color: boolean;
  extrusionDepth: boolean;
  globalStrokeWeight: boolean;
  bevelSettings: boolean;
  // Text
  textContent: boolean;
  fontFamily: boolean;
  arms: boolean;
  innerRadius: boolean;
  letterSpacing: boolean;
  boldness: boolean;
  mirrorEffect: boolean;
  rotationOffset: boolean;
  underline: boolean;
  secondaryGroup: boolean;
  // Hubs
  hubEnabled: boolean;
  hubShape: boolean;
  hubRadius: boolean;
  hubHollow: boolean;
  hubOscillation: boolean;
  // Abstract Shapes
  abstractType: boolean;
  abstractInnerRadius: boolean;
  abstractOuterRadius: boolean;
  abstractBoldness: boolean;
  abstractArms: boolean;
  // Shape type toggles
  abstractAllowLine: boolean;
  abstractAllowSine: boolean;
  abstractAllowZigzag: boolean;
  // Abstract Fractals
  fractalTrunkLength: boolean;
  fractalBranchesPerNode: boolean;
  fractalRecursionDepth: boolean;
  fractalMinBranchLength: boolean;
  fractalBranchPattern: boolean;
  fractalBranchAngle: boolean;
  fractalInitialLength: boolean;
  fractalLengthDecay: boolean;
  fractalAngleVariation: boolean;
  fractalLengthVariation: boolean;
  fractalThicknessDecay: boolean;
  fractalRoundedTips: boolean;
  fractalRandomSeed: boolean;
  // Text candidate words (comma-delimited)
  textPrimaryWords: string[];
  textPrimaryWordsEnabled: Record<string, boolean>;
  textSecondaryWords: string[];
  textSecondaryWordsEnabled: Record<string, boolean>;
}

export const DEFAULT_AI_SCOPE: AiScopeConfig = {
  globalTabEnabled: true,
  textTabEnabled: true,
  hubsTabEnabled: true,
  abstractShapesTabEnabled: true,
  abstractFractalsTabEnabled: true,
  color: true,
  extrusionDepth: false,
  globalStrokeWeight: true,
  bevelSettings: false,
  textContent: true,
  fontFamily: true,
  arms: true,
  innerRadius: true,
  letterSpacing: true,
  boldness: true,
  mirrorEffect: true,
  rotationOffset: true,
  underline: true,
  secondaryGroup: true,
  hubEnabled: true,
  hubShape: true,
  hubRadius: true,
  hubHollow: true,
  hubOscillation: true,
  abstractType: true,
  abstractInnerRadius: true,
  abstractOuterRadius: true,
  abstractBoldness: true,
  abstractArms: true,
  abstractAllowLine: true,
  abstractAllowSine: true,
  abstractAllowZigzag: true,
  fractalTrunkLength: true,
  fractalBranchesPerNode: true,
  fractalRecursionDepth: true,
  fractalMinBranchLength: true,
  fractalBranchPattern: true,
  fractalBranchAngle: true,
  fractalInitialLength: true,
  fractalLengthDecay: true,
  fractalAngleVariation: true,
  fractalLengthVariation: true,
  fractalThicknessDecay: true,
  fractalRoundedTips: true,
  fractalRandomSeed: true,
  textPrimaryWords: [
    'Snow', 'Snowflake', 'Icicle', 'Snowman', 'Mittens', 'Scarf', 'Sledding',
    'Skates', 'Blizzard', 'Frosty', 'Frost', 'Aurora', 'Evergreen', 'Snowball',
    'Crystal', 'Winter', 'Skiing', 'Polar', 'Flurry', 'Shovel', 'Chill', 'Drift', 'Frozen'
  ],
  textPrimaryWordsEnabled: {
    'Snow': true, 'Snowflake': true, 'Icicle': true, 'Snowman': true,
    'Mittens': true, 'Scarf': true, 'Sledding': true, 'Skates': true,
    'Blizzard': true, 'Frosty': true, 'Frost': true, 'Aurora': true,
    'Evergreen': true, 'Snowball': true, 'Crystal': true, 'Winter': true,
    'Skiing': true, 'Polar': true, 'Flurry': true, 'Shovel': true,
    'Chill': true, 'Drift': true, 'Frozen': true
  },
  textSecondaryWords: [
    'aurora', 'twilight', 'starlight', 'moonlight', 'silence', 'stillness',
    'purity', 'wonder', 'magic', 'symmetry', 'geometry', 'kaleidoscope',
    'faceted', 'intricate', 'delicate', 'feathered', 'branching', 'spiraling',
    'dancing', 'drifting', 'luminous', 'serene', 'tranquil', 'whisper'
  ],
  textSecondaryWordsEnabled: {
    'aurora': true, 'twilight': true, 'starlight': true, 'moonlight': true,
    'silence': true, 'stillness': true, 'purity': true, 'wonder': true,
    'magic': true, 'symmetry': true, 'geometry': true, 'kaleidoscope': true,
    'faceted': true, 'intricate': true, 'delicate': true, 'feathered': true,
    'branching': true, 'spiraling': true, 'dancing': true, 'drifting': true,
    'luminous': true, 'serene': true, 'tranquil': true, 'whisper': true
  },
};

const AI_SCOPE_STORAGE = 'snowflake_ai_scope';

export const loadAiScope = (): AiScopeConfig => {
  try {
    const raw = localStorage.getItem(AI_SCOPE_STORAGE);
    if (raw) return { ...DEFAULT_AI_SCOPE, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_AI_SCOPE };
};

const persistAiScope = (scope: AiScopeConfig) => {
  try { localStorage.setItem(AI_SCOPE_STORAGE, JSON.stringify(scope)); } catch {}
};

// ─────────────────────────────────────────────────────────────────────────────
// SHARED SMALL COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

// Original toggle (kept for language/tooltip section)
const Toggle: React.FC<{
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  activeColor?: string;
  className?: string;
}> = ({ label, checked, onChange, activeColor = "text-sky-400", className = "" }) => (
  <label className={`flex items-center gap-2 cursor-pointer group ${className}`}>
    <div className={`w-6 h-3 rounded-full border transition-colors relative ${checked ? 'bg-sky-600/20 border-sky-500/50' : 'bg-slate-800 border-white/10'}`}>
      <div className={`absolute top-0.5 left-0.5 w-1.5 h-1.5 rounded-full transition-all ${checked ? 'bg-sky-400 translate-x-3' : 'bg-slate-500 translate-x-0'}`} />
    </div>
    {label && (
      <span className={`text-[10px] font-bold uppercase transition-colors ${checked ? activeColor : 'text-slate-500 group-hover:text-slate-400'}`}>
        {label}
      </span>
    )}
    <input type="checkbox" className="hidden" checked={checked} onChange={e => onChange(e.target.checked)} />
  </label>
);

// Tri-state section header checkbox: true=all on, false=all off, null=mixed
const SectionCheck: React.FC<{
  label: string;
  sublabel: string;
  state: boolean | null;   // true | false | null(mixed)
  onChange: (v: boolean) => void;
}> = ({ label, sublabel, state, onChange }) => {
  const pill =
    state === true  ? { bg: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400', txt: 'All On' } :
    state === false ? { bg: 'bg-rose-500/10 border-rose-500/25 text-rose-400',           txt: 'Off'   } :
                      { bg: 'bg-amber-500/10 border-amber-500/25 text-amber-400',         txt: 'Mixed' };

  return (
    <div
      onClick={() => onChange(state !== true)}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-800/60 border border-white/8 mt-3 mb-1 cursor-pointer hover:bg-slate-800 transition-colors select-none"
    >
      {/* Checkbox indicator */}
      <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-all
        ${state === true  ? 'bg-sky-500 border border-sky-400' :
          state === null  ? 'bg-sky-500/20 border border-sky-400/50' :
                            'bg-slate-700 border border-white/15'}`}>
        {state === true && (
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
            <path d="M1.5 4.5L3.5 6.5L7.5 2.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
        {state === null && <div className="w-2 h-0.5 bg-sky-400 rounded-full" />}
      </div>

      <div className="flex-1 min-w-0">
        <span className="text-[11px] font-black uppercase tracking-wide text-slate-200">{label}</span>
        <span className="text-[10px] text-slate-500 ml-2">{sublabel}</span>
      </div>

      <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${pill.bg} ${pill.txt}`}>
        {pill.txt}
      </span>
    </div>
  );
};

// Individual variable row
const VarRow: React.FC<{
  label: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}> = ({ label, desc, checked, onChange, disabled }) => (
  <div
    onClick={() => !disabled && onChange(!checked)}
    className={`flex items-center gap-2.5 px-3 py-1.5 rounded-md transition-colors select-none
      ${disabled ? 'opacity-35 cursor-not-allowed' : 'cursor-pointer hover:bg-white/4'}`}
  >
    <div className={`w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0 transition-all
      ${checked ? 'bg-sky-500/25 border border-sky-400/60' : 'border border-white/15 bg-slate-800/60'}`}>
      {checked && (
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
          <path d="M1.5 4L3 5.5L6.5 2" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </div>
    <span className={`text-[11px] font-semibold transition-colors ${checked ? 'text-slate-300' : 'text-slate-500'}`}>
      {label}
    </span>
    {desc && <span className="text-[10px] text-slate-600 ml-1">{desc}</span>}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// PROPS
// ─────────────────────────────────────────────────────────────────────────────
interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ShortcutConfig;
  onSave: (newConfig: ShortcutConfig) => void;
  onReset: () => void;
  language?: string;
  onLanguageChange?: (lang: string) => void;
  showTooltips?: boolean;
  onTooltipsChange?: (show: boolean) => void;
  onSaveAsDefault?: () => void;
  onRestoreFactoryDefaults?: () => void;
  onResetEstimateCalibration?: () => void;
  estimateCalibrationReadout?: Array<{ bucket: string; samples: number; lastUpdatedAt: number | null }>;
  estimateCalibrationLastUpdatedLabel?: string | null;
  activeTab?: 'shortcuts' | 'apikey' | 'aiscope' | 'settings';
  message?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// TRANSLATE SHORTCUT ACTION NAMES
// ─────────────────────────────────────────────────────────────────────────────
const translateShortcutAction = (action: keyof ShortcutConfig, t: (key: string) => string): string => {
  const actionTranslations: Record<keyof ShortcutConfig, string> = {
    switchToGlobalTab:    t('switchToGlobalTab')    || 'Switch to Global Tab',
    switchToTextTab:      t('switchToTextTab')      || 'Switch to Text Tab',
    switchToLetterCtrlTab:t('switchToLetterCtrlTab')|| 'Switch to Letter Control Tab',
    switchToHubsTab:      t('switchToHubsTab')      || 'Switch to Hubs Tab',
    switchToAbstractTab:  t('switchToAbstractTab')  || 'Switch to Abstract Tab',
    switchToPlanesTab:    t('switchToPlanesTab')    || 'Switch to Planes Tab',
    toggleView:           t('toggleView')           || 'Toggle View',
    forceRegenerate:      t('forceRegenerate')      || 'Force Regenerate',
    exportCombinedSTL:    t('exportCombinedSTL')    || 'Export Combined STL',
    exportBasePlaneSTL:   t('exportBasePlaneSTL')   || 'Export Base Plane STL',
    exportCrossPlaneSTL:  t('exportCrossPlaneSTL')  || 'Export Cross Plane STL',
    exportTiltPlaneSTL:   t('exportTiltPlaneSTL')   || 'Export Tilt Plane STL',
    saveProject:          t('saveProject')          || 'Save Project',
    loadProject:          t('loadProject')          || 'Load Project',
    undo:                 t('undo')                 || 'Undo',
    redo:                 t('redo')                 || 'Redo',
    resetApp:             t('resetApp')             || 'Reset App',
  };
  return actionTranslations[action] || action.replace(/([A-Z])/g, ' $1').trim();
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN MODAL
// ─────────────────────────────────────────────────────────────────────────────
const ShortcutsModal: React.FC<ShortcutsModalProps> = ({
  isOpen, onClose, config, onSave, onReset,
  language = 'en', onLanguageChange, showTooltips, onTooltipsChange,
  onSaveAsDefault, onRestoreFactoryDefaults, onResetEstimateCalibration, estimateCalibrationReadout, estimateCalibrationLastUpdatedLabel,
  activeTab: initialTab = 'shortcuts', message
}) => {
  const { t } = useTranslation(language);

  type TabId = 'shortcuts' | 'apikey' | 'aiscope' | 'settings';
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  // ── Shortcuts state ──────────────────────────────────────────────────────
  const [tempConfig, setTempConfig] = useState<ShortcutConfig>(config);
  const [listeningFor, setListeningFor] = useState<keyof ShortcutConfig | null>(null);

  // ── API Key state ────────────────────────────────────────────────────────
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [apiKeyError, setApiKeyError] = useState('');
  const [hasStoredKey, setHasStoredKey] = useState(false);

  // ── AI Scope state ───────────────────────────────────────────────────────
  const [scope, setScope] = useState<AiScopeConfig>(loadAiScope);
  const [textInputPrimary, setTextInputPrimary] = useState('');
  const [textInputSecondary, setTextInputSecondary] = useState('');

  // Sync on open
  useEffect(() => {
    if (!isOpen) return;
    setTempConfig(config);
    setListeningFor(null);
    setActiveTab(initialTab);

    const stored = localStorage.getItem(API_KEY_STORAGE) || '';
    setApiKeyInput(stored);
    setHasStoredKey(!!stored);
    setApiKeySaved(false);
    setApiKeyError('');

    const currentScope = loadAiScope();
    setScope(currentScope);
    setTextInputPrimary(currentScope.textPrimaryWords.join(', '));
    setTextInputSecondary(currentScope.textSecondaryWords.join(', '));
  }, [isOpen, config, initialTab]);

  // Keyboard listener for shortcut recording
  useEffect(() => {
    if (!listeningFor) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
      const newDef: ShortcutDef = {
        key: e.key, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey,
        altKey: e.altKey, metaKey: e.metaKey,
      };
      setTempConfig(prev => ({ ...prev, [listeningFor]: newDef }));
      setListeningFor(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [listeningFor]);

  // ── API Key helpers ───────────────────────────────────────────────────────
  const handleSaveApiKey = () => {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) { setApiKeyError('Please enter an API key.'); return; }
    saveApiKey(trimmed);
    setHasStoredKey(true);
    setApiKeySaved(true);
    setApiKeyError('');
    setTimeout(() => setApiKeySaved(false), 2500);
  };
  const handleClearApiKey = () => {
    clearSavedApiKey();
    setApiKeyInput('');
    setHasStoredKey(false);
    setApiKeySaved(false);
  };
  const envKeyExists = !!(import.meta as any).env?.VITE_GEMINI_API_KEY;

  // ── AI Scope helpers ──────────────────────────────────────────────────────
  const updateScope = (patch: Partial<AiScopeConfig>) => {
    setScope(prev => {
      const next = { ...prev, ...patch };
      persistAiScope(next);
      return next;
    });
  };

  const setTextCandidates = (target: 'primary' | 'secondary', input: string) => {
    // Split by comma, trim, filter empty
    const words = input.split(',').map(w => w.trim()).filter(w => w.length > 0);
    const unique = Array.from(new Set(words)).slice(0, 100);
    
    // Create enabled map: all new words start as enabled
    const enabledMap: Record<string, boolean> = {};
    unique.forEach(word => {
      enabledMap[word] = true;
    });

    if (target === 'primary') {
      updateScope({ 
        textPrimaryWords: unique,
        textPrimaryWordsEnabled: enabledMap
      });
    } else {
      updateScope({ 
        textSecondaryWords: unique,
        textSecondaryWordsEnabled: enabledMap
      });
    }
  };

  const toggleTextWordEnabled = (target: 'primary' | 'secondary', word: string) => {
    if (target === 'primary') {
      const updated = {
        ...scope.textPrimaryWordsEnabled,
        [word]: !scope.textPrimaryWordsEnabled[word]
      };
      updateScope({ textPrimaryWordsEnabled: updated });
    } else {
      const updated = {
        ...scope.textSecondaryWordsEnabled,
        [word]: !scope.textSecondaryWordsEnabled[word]
      };
      updateScope({ textSecondaryWordsEnabled: updated });
    }
  };

  type GroupKey = 'global' | 'text' | 'hubs' | 'abstractShapes' | 'abstractFractals';
  const groupChildren: Record<GroupKey, (keyof AiScopeConfig)[]> = {
    global:   ['color','extrusionDepth','globalStrokeWeight','bevelSettings'],
    text:     ['textContent','fontFamily','arms','innerRadius','letterSpacing','boldness','mirrorEffect','rotationOffset','underline','secondaryGroup'],
    hubs:     ['hubEnabled','hubShape','hubRadius','hubHollow','hubOscillation'],
    abstractShapes: ['abstractType','abstractInnerRadius','abstractOuterRadius','abstractBoldness','abstractArms','abstractAllowLine','abstractAllowSine','abstractAllowZigzag'],
    abstractFractals: [
      'fractalTrunkLength',
      'fractalBranchesPerNode',
      'fractalRecursionDepth',
      'fractalMinBranchLength',
      'fractalBranchPattern',
      'fractalBranchAngle',
      'fractalInitialLength',
      'fractalLengthDecay',
      'fractalAngleVariation',
      'fractalLengthVariation',
      'fractalThicknessDecay',
      'fractalRoundedTips',
      'fractalRandomSeed',
    ],
  };

  const groupEnabledKey: Record<GroupKey, keyof AiScopeConfig> = {
    global: 'globalTabEnabled', text: 'textTabEnabled',
    hubs: 'hubsTabEnabled', abstractShapes: 'abstractShapesTabEnabled', abstractFractals: 'abstractFractalsTabEnabled',
  };

  const getGroupState = (g: GroupKey): boolean | null => {
    if (!scope[groupEnabledKey[g]]) return false;
    const kids = groupChildren[g];
    if (kids.every(k => scope[k])) return true;
    if (kids.every(k => !scope[k])) return null;
    return null; // mixed — show dash
  };

  const setGroupEnabled = (g: GroupKey, on: boolean) => {
    const childPatch = Object.fromEntries(groupChildren[g].map(k => [k, on]));
    updateScope({ [groupEnabledKey[g]]: on, ...childPatch } as Partial<AiScopeConfig>);
  };

  const varMeta: Partial<Record<keyof AiScopeConfig, { label: string; desc?: string }>> = {
    color:               { label: 'Model Color' },
    extrusionDepth:      { label: 'Extrusion Depth',        desc: 'mm' },
    globalStrokeWeight:  { label: 'Global Boldness',        desc: 'stroke weight' },
    bevelSettings:       { label: 'Bevel / Edge Profile',   desc: 'type, amount, segments' },
    textContent:         { label: 'Phrase / Word' },
    fontFamily:          { label: 'Font Family' },
    arms:                { label: 'Arms / Symmetry' },
    innerRadius:         { label: 'Inner Radius' },
    letterSpacing:       { label: 'Letter Spacing' },
    boldness:            { label: 'Per-Text Boldness' },
    mirrorEffect:        { label: 'Mirror Effect' },
    rotationOffset:      { label: 'Rotation Offset' },
    underline:           { label: 'Underline' },
    secondaryGroup:      { label: 'Secondary Text Group' },
    hubEnabled:          { label: 'Add / Enable Hub' },
    hubShape:            { label: 'Hub Shape',              desc: 'circle / polygon / star' },
    hubRadius:           { label: 'Hub Radius' },
    hubHollow:           { label: 'Hollow Toggle' },
    hubOscillation:      { label: 'Oscillation' },
    abstractType:        { label: 'Shape Type',             desc: 'sine / zigzag / fractal' },
    abstractInnerRadius: { label: 'Inner Radius' },
    abstractOuterRadius: { label: 'Outer Radius' },
    abstractBoldness:    { label: 'Boldness / Thickness' },
    abstractArms:        { label: 'Arms' },
    abstractAllowLine:   { label: 'Allow: Line' },
    abstractAllowSine:   { label: 'Allow: Sine' },
    abstractAllowZigzag: { label: 'Allow: Zigzag' },
    // Fractal-specific settings
    fractalTrunkLength:    { label: 'Trunk Length',         desc: 'initial trunk (mm)' },
    fractalBranchesPerNode:{ label: 'Branches Per Node',    desc: '1-12' },
    fractalRecursionDepth: { label: 'Recursion Depth',      desc: '1-6 generations' },
    fractalMinBranchLength:{ label: 'Min Branch Length',    desc: 'termination (mm)' },
    fractalBranchPattern:  { label: 'Branch Pattern',       desc: 'symmetric / alternating / random' },
    fractalBranchAngle:    { label: 'Branch Angle',         desc: '0-180°' },
    fractalInitialLength:  { label: 'Initial Length',       desc: 'first segment (mm)' },
    fractalLengthDecay:    { label: 'Length Decay',         desc: 'multiplier per level' },
    fractalAngleVariation: { label: 'Angle Variation',      desc: 'random variation°' },
    fractalLengthVariation:{ label: 'Length Variation',     desc: 'random variation mm' },
    fractalThicknessDecay: { label: 'Thickness Decay',      desc: 'multiplier per level' },
    fractalRoundedTips:    { label: 'Rounded Tips' },
    fractalRandomSeed:     { label: 'Random Seed',          desc: 'for reproducibility' },
  };

  if (!isOpen) return null;

  const tabBtn = (id: TabId, emoji: string, label: string) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-[10px] font-black uppercase tracking-wider transition-all
        ${activeTab === id
          ? 'bg-sky-600/20 text-sky-400 border border-sky-500/30'
          : 'text-slate-500 hover:text-slate-300 border border-transparent'}`}
    >
      <span>{emoji}</span><span>{label}</span>
    </button>
  );

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 rounded-2xl border border-white/10 shadow-2xl w-[600px] max-w-[96vw] max-h-[88vh] flex flex-col">

        {/* ── Modal header ─────────────────────────────────────────────── */}
        <div className="flex justify-between items-center px-5 pt-5 pb-3 border-b border-white/5 shrink-0">
          <h2 className="text-base font-black text-white uppercase tracking-tight">{t('settings')}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* ── Tab bar ──────────────────────────────────────────────────── */}
        <div className="flex gap-1 px-5 pt-3 pb-0 shrink-0">
          {tabBtn('shortcuts', '⌨', t('Shortcuts'))}
          {tabBtn('apikey',    '🔑', t('API Key'))}
          {tabBtn('aiscope',   '🎲', t('AI Controls'))}
          {tabBtn('settings',  '⚙', t('settings'))}
        </div>

        {/* ── Scrollable content ───────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4 min-h-0">

          {/* ════════════════════════════════ SHORTCUTS TAB */}
          {activeTab === 'shortcuts' && (
            <div className="space-y-4">
              {/* Language + Tooltips */}
              <div className="p-3 bg-slate-800/40 rounded-xl border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">{t('Language')}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">{t('Tooltips')}</span>
                    {onTooltipsChange && (
                      <Toggle label={showTooltips ? t('ON') : t('OFF')} checked={!!showTooltips} onChange={onTooltipsChange} />
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 grid grid-cols-3 gap-1 bg-slate-900 p-1 rounded-lg">
                    {[
                      { code: 'en', name: 'English' }, { code: 'es', name: 'Español' },
                      { code: 'fr', name: 'Français' }, { code: 'de', name: 'Deutsch' },
                      { code: 'zh', name: '中文' }, { code: 'ja', name: '日本語' },
                    ].map(lang => (
                      <button key={lang.code} onClick={() => onLanguageChange?.(lang.code)}
                        className={`py-1.5 text-[10px] font-black uppercase rounded transition-all ${language === lang.code ? 'bg-sky-500 text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                        {t(lang.name)}
                      </button>
                    ))}
                  </div>
                  {language !== 'en' && (
                    <button onClick={() => onLanguageChange?.('en')} className="text-[10px] text-slate-500 hover:text-rose-400 transition-colors">
                      {t('reset')}
                    </button>
                  )}
                </div>
              </div>

              {/* Shortcuts list */}
              <div>
                <p className="text-[10px] font-black uppercase text-slate-500 tracking-wider mb-2">{t('Keyboard Shortcuts')}</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {(Object.keys(tempConfig) as Array<keyof ShortcutConfig>).map(action => (
                    <div key={action}
                      className="flex items-center justify-between p-2 bg-slate-800/50 rounded-lg border border-white/5 hover:border-white/10 transition-colors gap-2">
                      <span className="text-[11px] font-semibold text-slate-300 truncate flex-1">
                        {translateShortcutAction(action, t)}
                      </span>
                      <button
                        onClick={() => setListeningFor(action)}
                        className={`min-w-[90px] h-6 px-2 rounded text-[10px] font-mono font-bold transition-all border flex-shrink-0
                          ${listeningFor === action
                            ? 'bg-sky-500 text-white border-sky-400 animate-pulse'
                            : 'bg-slate-900 text-sky-400 border-white/10 hover:border-sky-500/50'}`}>
                        {listeningFor === action ? '⏺ Press keys…' : formatShortcut(tempConfig[action])}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={onReset}
                  className="px-3 py-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 text-[10px] font-black uppercase transition-all">
                  {t('Reset Defaults')}
                </button>
                <div className="flex-1" />
                <button onClick={onClose}
                  className="px-3 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 text-[10px] font-black uppercase transition-all">
                  {t('cancel')}
                </button>
                <button onClick={() => { onSave(tempConfig); onClose(); }}
                  className="px-4 py-2 rounded-lg bg-sky-600 text-white hover:bg-sky-500 shadow-lg text-[10px] font-black uppercase transition-all">
                  {t('Save Changes')}
                </button>
              </div>
            </div>
          )}

          {/* ════════════════════════════════ API KEY TAB */}
          {activeTab === 'apikey' && (
            <div className="space-y-4">
              {/* Warning message */}
              {message && (
                <div className="flex items-start gap-3 p-3 rounded-xl bg-rose-500/8 border border-rose-500/30">
                  <span className="text-lg mt-0.5">⚠️</span>
                  <div>
                    <p className="text-[11px] font-bold text-rose-400">{message}</p>
                  </div>
                </div>
              )}

              {/* Env-var notice */}
              {envKeyExists && (
                <div className="flex items-start gap-3 p-3 rounded-xl bg-emerald-500/8 border border-emerald-500/20">
                  <span className="text-lg mt-0.5">✅</span>
                  <div>
                    <p className="text-[11px] font-bold text-emerald-400">Environment variable detected</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      <code className="bg-white/6 px-1 py-0.5 rounded text-[9px]">VITE_GEMINI_API_KEY</code> is set — it takes priority over any saved key below.
                    </p>
                  </div>
                </div>
              )}

              {/* Instructions */}
              <div className="p-3 bg-slate-800/40 rounded-xl border border-white/5">
                <p className="text-[10px] font-black uppercase text-slate-500 tracking-wider mb-3">How to get a free Gemini API Key</p>
                <ol className="space-y-2">
                  {[
                    { n:'1', text:'Visit ', link:'https://aistudio.google.com/apikey', linkText:'Google AI Studio ↗' },
                    { n:'2', text:'Sign in with your Google account' },
                    { n:'3', text:'Click "Create API key" and copy it' },
                    { n:'4', text:'Paste it below — stored locally in your browser only' },
                  ].map(({ n, text, link, linkText }) => (
                    <li key={n} className="flex items-start gap-2.5">
                      <span className="w-4.5 h-4.5 rounded-full bg-violet-500/15 border border-violet-500/25 text-[9px] font-black text-violet-400 flex items-center justify-center flex-shrink-0 mt-0.5" style={{width:18,height:18}}>
                        {n}
                      </span>
                      <span className="text-[11px] text-slate-400 leading-relaxed">
                        {text}
                        {link && (
                          <a href={link} target="_blank" rel="noopener noreferrer"
                            className="text-sky-400 font-bold hover:text-sky-300 transition-colors border-b border-sky-400/30 hover:border-sky-300">
                            {linkText}
                          </a>
                        )}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Key input */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider block">Your API Key</label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKeyInput}
                    onChange={e => { setApiKeyInput(e.target.value); setApiKeyError(''); setApiKeySaved(false); }}
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveApiKey(); }}
                    placeholder="AIza…"
                    className={`w-full h-10 bg-slate-800 rounded-lg pl-3 pr-10 text-[12px] font-mono text-white placeholder-slate-600 outline-none transition-all border
                      ${apiKeyError   ? 'border-rose-500/50'    :
                        apiKeySaved   ? 'border-emerald-500/50' :
                                        'border-white/10 focus:border-sky-500/50'}`}
                  />
                  <button onClick={() => setShowApiKey(v => !v)} tabIndex={-1}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-sm transition-colors">
                    {showApiKey ? '🙈' : '👁'}
                  </button>
                </div>
                {apiKeyError && <p className="text-[10px] text-rose-400 font-semibold">⚠ {apiKeyError}</p>}
                <p className="text-[10px] text-slate-600">
                  Saved to <code className="bg-white/5 px-1 rounded text-[9px]">localStorage</code> — never sent to any server.
                </p>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                {hasStoredKey && (
                  <button onClick={handleClearApiKey}
                    className="px-3 py-2 rounded-lg bg-rose-500/8 border border-rose-500/20 text-rose-400 hover:bg-rose-500/15 text-[10px] font-black uppercase tracking-wider transition-all">
                    Clear Key
                  </button>
                )}
                <button onClick={handleSaveApiKey}
                  className={`flex-1 py-2 rounded-lg text-white text-[10px] font-black uppercase tracking-wider transition-all
                    ${apiKeySaved
                      ? 'bg-emerald-600 shadow-emerald-500/20 shadow-lg'
                      : 'bg-violet-700 hover:bg-violet-600 shadow-violet-500/20 shadow-lg'}`}>
                  {apiKeySaved ? '✓ Key Saved!' : 'Save API Key'}
                </button>
              </div>
            </div>
          )}

          {/* ════════════════════════════════ AI CONTROLS TAB */}
          {activeTab === 'aiscope' && (
            <div>
              <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
                Choose which parameters the AI Randomizer can modify. Disable a section to lock it out entirely, or fine-tune individual variables below each section.
              </p>

              {/* Quick presets */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {[
                  {
                    label: 'Enable All',
                    action: () => updateScope(
                      Object.fromEntries(Object.keys(DEFAULT_AI_SCOPE).map(k => [k, true])) as unknown as AiScopeConfig
                    ),
                  },
                  {
                    label: 'Text Only',
                    action: () => updateScope({
                      ...DEFAULT_AI_SCOPE,
                      hubsTabEnabled: false, hubEnabled: false, hubShape: false, hubRadius: false, hubHollow: false, hubOscillation: false,
                      abstractShapesTabEnabled: false, abstractFractalsTabEnabled: false,
                      abstractType: false, abstractInnerRadius: false, abstractOuterRadius: false, abstractBoldness: false, abstractArms: false,
                    }),
                  },
                  {
                    label: 'Minimal',
                    action: () => updateScope({
                      ...DEFAULT_AI_SCOPE,
                      extrusionDepth: false, bevelSettings: false, mirrorEffect: false,
                      rotationOffset: false, underline: false, hubOscillation: false,
                    }),
                  },
                  {
                    label: 'Reset',
                    action: () => updateScope({ ...DEFAULT_AI_SCOPE }),
                  },
                ].map(({ label, action }) => (
                  <button key={label} onClick={action}
                    className="h-7 px-3 rounded-md border border-white/8 bg-slate-800/60 text-slate-400 hover:text-white hover:bg-slate-700 text-[9px] font-black uppercase tracking-wider transition-all">
                    {label}
                  </button>
                ))}
              </div>

              {/* GLOBAL section */}
              <SectionCheck
                label="Global Settings"
                sublabel="color, depth, boldness, bevel"
                state={getGroupState('global')}
                onChange={v => setGroupEnabled('global', v)}
              />
              {scope.globalTabEnabled && (
                <div className="mb-1">
                  {groupChildren.global.map(k => {
                    const m = varMeta[k];
                    return m ? (
                      <VarRow key={k} label={m.label} desc={m.desc} checked={scope[k] as boolean} onChange={v => updateScope({ [k]: v })} />
                    ) : null;
                  })}
                </div>
              )}

              {/* TEXT section */}
              <SectionCheck
                label="Text Settings"
                sublabel="font, spacing, arms, underline…"
                state={getGroupState('text')}
                onChange={v => setGroupEnabled('text', v)}
              />
              {scope.textTabEnabled && (
                <div className="mb-1">
                  {groupChildren.text.map((k, idx) => {
                    const m = varMeta[k];
                    return m ? (
                      <div key={k}>
                        <VarRow label={m.label} desc={m.desc} checked={scope[k] as boolean} onChange={v => updateScope({ [k]: v })} />
                        
                        {/* Show word candidates immediately after textContent checkbox */}
                        {k === 'textContent' && (
                          <div className="ml-5 mt-2 p-2 border border-white/10 rounded-lg bg-slate-950/40">
                            <div className="text-[10px] font-black uppercase text-slate-400 mb-2">Phrase Candidate Words (comma-delimited)</div>
                            
                            <div className="space-y-2">
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <label className="text-[9px] text-slate-500 block">Primary Words (max 100)</label>
                                  <button
                                    onClick={() => {
                                      setTextInputPrimary('');
                                      setTextCandidates('primary', '');
                                    }}
                                    className="text-[8px] text-slate-500 hover:text-sky-400 transition-colors"
                                  >
                                    Clear
                                  </button>
                                </div>
                                <textarea
                                  rows={3}
                                  value={textInputPrimary}
                                  onChange={e => setTextInputPrimary(e.target.value)}
                                  onBlur={() => setTextCandidates('primary', textInputPrimary)}
                                  className="w-full bg-slate-900 border border-white/10 rounded-md p-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
                                  placeholder="Enter words separated by commas, e.g.: frost, crystal, glacier, sparkle..."
                                />
                                <div className="text-[8px] text-slate-600 mt-1">{scope.textPrimaryWords.length}/100 words</div>
                                
                                {scope.textPrimaryWords.length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-1">
                                    {scope.textPrimaryWords.map(word => (
                                      <label
                                        key={word}
                                        className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-900/60 border border-white/10 cursor-pointer hover:bg-slate-800 transition-colors"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={scope.textPrimaryWordsEnabled[word] !== false}
                                          onChange={() => toggleTextWordEnabled('primary', word)}
                                          className="w-3 h-3 rounded accent-sky-500"
                                        />
                                        <span className="text-[8px] font-semibold text-slate-300">{word}</span>
                                      </label>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <label className="text-[9px] text-slate-500 block">Secondary Words (max 100)</label>
                                  <button
                                    onClick={() => {
                                      setTextInputSecondary('');
                                      setTextCandidates('secondary', '');
                                    }}
                                    className="text-[8px] text-slate-500 hover:text-sky-400 transition-colors"
                                  >
                                    Clear
                                  </button>
                                </div>
                                <textarea
                                  rows={3}
                                  value={textInputSecondary}
                                  onChange={e => setTextInputSecondary(e.target.value)}
                                  onBlur={() => setTextCandidates('secondary', textInputSecondary)}
                                  className="w-full bg-slate-900 border border-white/10 rounded-md p-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
                                  placeholder="Enter words separated by commas, e.g.: aurora, twilight, starlight, symmetry..."
                                />
                                <div className="text-[8px] text-slate-600 mt-1">{scope.textSecondaryWords.length}/100 words</div>
                                
                                {scope.textSecondaryWords.length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-1">
                                    {scope.textSecondaryWords.map(word => (
                                      <label
                                        key={word}
                                        className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-900/60 border border-white/10 cursor-pointer hover:bg-slate-800 transition-colors"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={scope.textSecondaryWordsEnabled[word] !== false}
                                          onChange={() => toggleTextWordEnabled('secondary', word)}
                                          className="w-3 h-3 rounded accent-sky-500"
                                        />
                                        <span className="text-[8px] font-semibold text-slate-300">{word}</span>
                                      </label>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : null;
                  })}
                </div>
              )}

              {/* HUBS section */}
              <SectionCheck
                label="Hubs Settings"
                sublabel="shape, radius, hollow, oscillation"
                state={getGroupState('hubs')}
                onChange={v => setGroupEnabled('hubs', v)}
              />
              {scope.hubsTabEnabled && (
                <div className="mb-1">
                  {groupChildren.hubs.map(k => {
                    const m = varMeta[k];
                    return m ? (
                      <VarRow key={k} label={m.label} desc={m.desc} checked={scope[k] as boolean} onChange={v => updateScope({ [k]: v })} />
                    ) : null;
                  })}
                </div>
              )}

              {/* ABSTRACT SHAPES section */}
              <SectionCheck
                label="Abstract - Shapes"
                sublabel="shape, radii, arms"
                state={getGroupState('abstractShapes')}
                onChange={v => setGroupEnabled('abstractShapes', v)}
              />
              {scope.abstractShapesTabEnabled && (
                <div className="mb-1">
                  {groupChildren.abstractShapes.map(k => {
                    const m = varMeta[k];
                    return m ? (
                      <VarRow key={k} label={m.label} desc={m.desc} checked={scope[k] as boolean} onChange={v => updateScope({ [k]: v })} />
                    ) : null;
                  })}
                </div>
              )}

              {/* ABSTRACT FRACTALS section */}
              <SectionCheck
                label="Abstract - Fractals"
                sublabel="fractal behavior, recursion"
                state={getGroupState('abstractFractals')}
                onChange={v => setGroupEnabled('abstractFractals', v)}
              />
              {scope.abstractFractalsTabEnabled && (
                <div className="mb-1">
                  {groupChildren.abstractFractals.map(k => {
                    const m = varMeta[k];
                    return m ? (
                      <VarRow key={k} label={m.label} desc={m.desc} checked={scope[k] as boolean} onChange={v => updateScope({ [k]: v })} />
                    ) : null;
                  })}
                </div>
              )}
            </div>
          )}

          {/* ════════════════════════════════ SETTINGS TAB */}
          {activeTab === 'settings' && (
            <div className="space-y-4">
              <div className="p-3 bg-slate-800/30 rounded-xl border border-white/5 space-y-3">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t('Defaults')}</div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {t('startupDefaultsHelp')}
                </p>
                <button
                  onClick={() => onSaveAsDefault?.()}
                  className="w-full h-9 rounded-lg bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 text-xs font-black uppercase tracking-wider hover:bg-emerald-500 hover:text-white transition-all"
                >
                  {t('saveStartupDefaults')}
                </button>
              </div>

              <div className="p-3 bg-rose-900/20 rounded-xl border border-rose-500/20 space-y-3">
                <div className="text-[10px] font-black uppercase tracking-wider text-rose-300">{t('Factory Reset')}</div>
                <p className="text-[11px] text-rose-200/80 leading-relaxed">
                  {t('factoryResetHelp')}
                </p>
                <button
                  onClick={() => onRestoreFactoryDefaults?.()}
                  className="w-full h-9 rounded-lg bg-rose-600/20 text-rose-200 border border-rose-500/40 text-xs font-black uppercase tracking-wider hover:bg-rose-500 hover:text-white transition-all"
                >
                  {t('restoreFactoryDefaults')}
                </button>
              </div>

              <div className="p-3 bg-amber-900/20 rounded-xl border border-amber-500/20 space-y-3">
                <div className="text-[10px] font-black uppercase tracking-wider text-amber-300">Estimate Learning</div>
                <p className="text-[11px] text-amber-100/80 leading-relaxed">
                  Clears adaptive export estimate calibration for size, triangles, and time. The app will relearn from your next exports.
                </p>
                <div className="rounded-lg border border-amber-500/25 bg-black/20 p-2">
                  <div className="text-[9px] font-black uppercase tracking-wider text-amber-200/90 mb-1">Current Sample Counts</div>
                  <div className="text-[9px] text-amber-100/75 mb-2">
                    Last updated: {estimateCalibrationLastUpdatedLabel || 'Never'}
                  </div>
                  {(estimateCalibrationReadout && estimateCalibrationReadout.length > 0) ? (
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                      {estimateCalibrationReadout.map((entry) => (
                        <div key={entry.bucket} className="flex items-center justify-between text-[10px]">
                          <span className="text-amber-100/85">{entry.bucket}</span>
                          <span className="text-amber-300 font-bold">{entry.samples}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[10px] text-amber-100/70">No calibration samples yet.</div>
                  )}
                </div>
                <button
                  onClick={() => onResetEstimateCalibration?.()}
                  className="w-full h-9 rounded-lg bg-amber-600/20 text-amber-100 border border-amber-500/40 text-xs font-black uppercase tracking-wider hover:bg-amber-500 hover:text-white transition-all"
                >
                  Reset Estimate Learning
                </button>
              </div>
            </div>
          )}

        </div>{/* end scrollable content */}
      </div>
    </div>,
    document.body
  );
};

export default ShortcutsModal;
