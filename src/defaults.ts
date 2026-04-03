import { SnowflakeConfig, TextGroupConfig, HubConfig, AbstractConfig, LayerConfig } from './types';
import { CURSIVE_FONTS } from './constants';

// Default Text Group Configuration
export const createDefaultTextGroup = (text: string, rotation: number, fontSize: number, textX: number): TextGroupConfig => ({
  enabled: true,
  text,
  fontFamily: CURSIVE_FONTS[0].family,
  arms: 6,
  textX,
  letterSpacing: 0,
  thickness: 1,
  fontSize,
  mirrorEnabled: false,
  mirrorOffset: 0,
  rotationOffset: rotation,
  charOffsets: [],
  underline: { enabled: false, thickness: 1.5, startXOffset: 0, length: 50, yOffset: -5, capType: 'none', capWidth: 10 }
});

// Default Hub Configuration
export const createDefaultHub = (id: string): HubConfig => ({
  id,
  enabled: false,
  shape: 'circle',
  sides: 6,
  outerRadius: 25,
  hollow: false,
  wallThickness: 2,
  starRatio: 0.5,
  rotationOffset: 0,
  oscillationEnabled: false,
  oscillationAmplitude: 2,
  oscillationFrequency: 3
});

// Default Abstract Configuration
export const createDefaultAbstract = (id: string, type: 'line' | 'sine' | 'zigzag'): AbstractConfig => ({
  id,
  enabled: false,
  type,
  arms: 6,
  rotationOffset: 0,
  innerRadius: 5,
  outerRadius: 15,
  amplitude: 2,
  frequency: 2,
  thickness: 1,
  mirrorEnabled: false,
  mirrorOffset: 0,
  trunkLength: 10,
  branchesPerNode: 2,
  recursionDepth: 3,
  minBranchLength: 2,
  branchPattern: 'symmetric',
  branchAngle: 30,
  initialLength: 10,
  lengthDecay: 0.7,
  randomSeed: 12345,
  angleVariation: 10,
  lengthVariation: 0.2,
  thicknessDecay: 0.8,
  roundedTips: true
});

// Default Layer Configuration
export const createDefaultLayer = (id: string, name: string, rx = 0, ry = 0, isEnabled = false): LayerConfig => ({
  id,
  name,
  enabled: isEnabled,
  rotation3D: { x: rx, y: ry, z: 0 },
  primary: createDefaultTextGroup("Snow", 0, 36.7, 20),
  secondary: createDefaultTextGroup("", 30, 20, 10),
  secondaryEnabled: true,
  abstracts: [],
  hubs: [],
  slotType: 'none',
  slotLengthAdjustment: 0,
  slotWidthOffset: 0,
  images: []
});

// Default Global Configuration - matches original App.tsx initialState
export const createDefaultGlobalConfig = (): Omit<SnowflakeConfig, 'projectName' | 'layers' | 'activeLayerIndex'> => ({
  color: "#38bdf8",
  extrusionDepth: 3.0, // Match defaultDepth from App.tsx
  bevelEnabled: true, // Default ON
  bevelType: 'fillet',
  bevelAmount: 0.4,
  bevelSegments: 5,
  slotEnabled: false,
  slotLength: 95,
  slotWidth: 4.0,
  slotMode: '2-plane',
  quality: 'low',
  syncAllLayers: true, // Default ON
  globalStrokeWeight: 0,
  freeFloatingCheck: true
});

// Complete Default Configuration
export const createDefaultConfig = (): SnowflakeConfig => ({
  projectName: "MySnowflake",
  layers: [
    createDefaultLayer('layer-1', 'Base Plane', 0, 0, true),
    createDefaultLayer('layer-2', 'Cross Plane', 120, 0, false),
    createDefaultLayer('layer-4', 'Tilt Plane', 240, 0, false),
  ],
  activeLayerIndex: 0,
  ...createDefaultGlobalConfig()
});

// Function to reset only settings (preserve project structure and basic layer setup)
export const resetSettingsToDefaults = (currentConfig: SnowflakeConfig): SnowflakeConfig => {
  const defaultGlobal = createDefaultGlobalConfig();
  
  // Reset global settings
  const resetConfig: SnowflakeConfig = {
    ...currentConfig,
    ...defaultGlobal
  };

  // Reset each layer's settings but preserve basic structure
  resetConfig.layers = currentConfig.layers.map((layer, index) => {
    const defaultLayer = createDefaultLayer(layer.id, layer.name, layer.rotation3D.x, layer.rotation3D.y, layer.enabled);
    
    return {
      ...defaultLayer,
      // Preserve layer structure but reset settings
      id: layer.id,
      name: layer.name,
      enabled: layer.enabled,
      rotation3D: layer.rotation3D,
      slotType: layer.slotType,
      slotLengthAdjustment: layer.slotLengthAdjustment,
      slotWidthOffset: layer.slotWidthOffset,
      images: layer.images, // Preserve images as they're user-added content
      
      // Reset all settings to defaults
      primary: defaultLayer.primary,
      secondary: defaultLayer.secondary,
      secondaryEnabled: defaultLayer.secondaryEnabled,
      abstracts: [], // Clear abstracts
      hubs: [] // Clear hubs
    };
  });

  return resetConfig;
};
