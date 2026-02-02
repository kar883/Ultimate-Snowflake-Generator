
export interface CharOffset {
  x: number;
  y: number;
}

export interface HubConfig {
  id: string;
  enabled: boolean;
  shape: 'circle' | 'polygon' | 'star';
  sides: number;
  outerRadius: number;
  hollow: boolean;
  wallThickness: number;
  starRatio: number;
  rotationOffset: number;
  oscillationEnabled: boolean;
  oscillationAmplitude: number;
  oscillationFrequency: number;
}

export interface AbstractConfig {
  id: string;
  enabled: boolean;
  type: 'line' | 'sine' | 'zigzag' | 'fractal';
  arms: number;
  rotationOffset: number;
  innerRadius: number;
  outerRadius: number;
  amplitude: number;
  frequency: number;
  thickness: number;
  mirrorEnabled: boolean;
  mirrorOffset: number;
  
  // Fractal specific properties
  trunkLength?: number;
  branchesPerNode?: number;
  recursionDepth?: number;
  minBranchLength?: number;
  branchPattern?: 'symmetric' | 'alternating' | 'random';
  branchAngle?: number;
  initialLength?: number;
  lengthDecay?: number;
  randomSeed?: number;
  angleVariation?: number;
  lengthVariation?: number;
  thicknessDecay?: number;
  roundedTips?: boolean;
}

export interface UnderlineConfig {
  enabled: boolean;
  thickness: number;
  startXOffset: number;
  length: number;
  yOffset: number;
  capType: 'none' | 'square' | 'round' | 'chevron';
  capWidth: number;
}

export interface TextGroupConfig {
  enabled: boolean;
  text: string;
  fontFamily: string;
  arms: number;
  textX: number;
  letterSpacing: number;
  thickness: number;
  fontSize: number;
  mirrorEnabled: boolean;
  mirrorOffset: number;
  rotationOffset: number;
  charOffsets: CharOffset[];
  underline: UnderlineConfig;
}

export interface LayerConfig {
  id: string;
  name: string;
  enabled: boolean;
  rotation3D: { x: number; y: number };
  primary: TextGroupConfig;
  secondary: TextGroupConfig;
  secondaryEnabled: boolean;
  abstracts: AbstractConfig[];
  hubs: HubConfig[];
  slotType: 'none' | 'half-back' | 'half-front' | 'third-back' | 'third-middle' | 'third-front' | 'custom';
  slotLengthAdjustment?: number;
  slotWidthOffset?: number;
}

export type DesignQuality = 'low' | 'med' | 'high';

export interface SnowflakeConfig {
  projectName: string;
  layers: LayerConfig[];
  activeLayerIndex: number;
  color: string;
  extrusionDepth: number;
  bevelEnabled: boolean;
  bevelType: 'fillet' | 'chamfer';
  bevelAmount: number;
  bevelSegments: number;
  slotEnabled: boolean;
  slotLength: number;
  slotWidth: number;
  quality: DesignQuality;
  syncAllLayers: boolean;
  globalStrokeWeight: number;
}

export interface FontOption {
  name: string;
  family: string;
}

export interface ShortcutDef {
  key: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
}

export interface ShortcutConfig {
  undo: ShortcutDef;
  redo: ShortcutDef;
  toggleView: ShortcutDef;
  forceRegenerate: ShortcutDef;
  exportCombinedSTL: ShortcutDef;
  exportBasePlaneSTL: ShortcutDef;
  exportCrossPlaneSTL: ShortcutDef;
  exportTiltPlaneSTL: ShortcutDef;
  saveProject: ShortcutDef;
  loadProject: ShortcutDef;
  switchToGlobalTab: ShortcutDef;
  switchToTextTab: ShortcutDef;
  switchToLetterCtrlTab: ShortcutDef;
  switchToHubsTab: ShortcutDef;
  switchToAbstractTab: ShortcutDef;
  switchToPlanesTab: ShortcutDef;
}
