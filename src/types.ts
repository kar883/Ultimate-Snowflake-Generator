
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

// ─────────────────────────────────────────────────────────────────────────────
// SVG Image Import
// ─────────────────────────────────────────────────────────────────────────────
export interface ImageConfig {
  id: string;
  /** Display name (usually the filename without extension) */
  name: string;
  enabled: boolean;
  /** Raw SVG path `d` strings extracted from the imported file */
  svgPaths: string[];
  /** Approximate viewBox of the original SVG, used for normalisation */
  svgWidth: number;
  svgHeight: number;
  // ── Arm layout ──────────────────────────────────────────────────────────
  arms: number;
  rotationOffset: number;
  mirrorEnabled: boolean;
  mirrorOffset: number;
  // ── SVG Transform ───────────────────────────────────────────────────────
  /** Flip the SVG horizontally (left/right) */
  flipEnabled: boolean;
  /** Rotate the SVG itself around its center (degrees) */
  svgRotation: number;
  // ── Placement ───────────────────────────────────────────────────────────
  /** Uniform scale – 1.0 means 1 SVG unit = 1 mm */
  scale: number;
  /** Distance from the snowflake centre to the left edge of the shape (mm) */
  innerRadius: number;
  /** Vertical offset from the arm centreline (mm) */
  yOffset: number;
  /** Line thickness/boldness for the SVG paths (mm) */
  thickness: number;
}

export const createDefaultImage = (
  id: string,
  name: string,
  svgPaths: string[],
  svgWidth: number,
  svgHeight: number
): ImageConfig => ({
  id,
  name,
  enabled: true,
  svgPaths,
  svgWidth,
  svgHeight,
  arms: 6,
  rotationOffset: 0,
  mirrorEnabled: true,
  mirrorOffset: 0,
  flipEnabled: false,
  svgRotation: 0,
  scale: 1.0,
  innerRadius: 10,
  yOffset: 0,
  thickness: 0,
});

export interface LayerConfig {
  id: string;
  name: string;
  enabled: boolean;
  rotation3D: { x: number; y: number; z: number };
  primary: TextGroupConfig;
  secondary: TextGroupConfig;
  secondaryEnabled: boolean;
  abstracts: AbstractConfig[];
  hubs: HubConfig[];
  slotType: 'none' | 'half-back' | 'half-front' | 'third-back' | 'third-middle' | 'third-front' | 'custom';
  slotLengthAdjustment?: number;
  slotWidthOffset?: number;
  slotCrossTipInLengthAdjustment?: number;
  slotTiltExtensionLengthAdjustment?: number;
  images: ImageConfig[];
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
  slotMode: '2-plane' | '3-plane';
  quality: DesignQuality;
  syncAllLayers: boolean;
  globalStrokeWeight: number;
  freeFloatingCheck: boolean;
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
  resetApp: ShortcutDef;
}
