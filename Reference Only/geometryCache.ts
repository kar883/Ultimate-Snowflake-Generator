import * as THREE from 'three';

export interface GeometryCache {
  text: Map<string, THREE.BufferGeometry>;
  hubs: Map<string, THREE.BufferGeometry>;
  slots: Map<string, THREE.BufferGeometry>;
  abstracts: Map<string, THREE.BufferGeometry>;
}

export const geometryCache: GeometryCache = {
  text: new Map(),
  hubs: new Map(),
  slots: new Map(),
  abstracts: new Map(),
};

// Model-level caches for complete 2D and 3D models
export const modelCache3D = new Map<string, THREE.Group>();
export const modelCache2D = new Map<string, string>(); // SVG string cache

// Cache for pre-computed slot-cut geometries per layer
export const slotCutCache = new Map<string, THREE.BufferGeometry>();

// Simple hash function for config objects
export function hashConfig(config: any): string {
  // Create a deterministic string representation of the config
  // CRITICAL FIX: Exclude 'enabled' property from layers to prevent cache invalidation
  // when just toggling layer visibility
  const relevantConfig = {
    layers: config.layers.map((layer: any) => {
      const { enabled, ...layerWithoutEnabled } = layer;
      return layerWithoutEnabled;
    }),
    extrusionDepth: config.extrusionDepth,
    bevelEnabled: config.bevelEnabled,
    bevelType: config.bevelType,
    bevelAmount: config.bevelAmount,
    bevelSegments: config.bevelSegments,
    slotEnabled: config.slotEnabled,
    slotLength: config.slotLength,
    slotWidth: config.slotWidth,
    quality: config.quality,
    syncAllLayers: config.syncAllLayers,
    globalStrokeWeight: config.globalStrokeWeight
  };
  // Use a stable stringify that sorts object keys so identical configs
  // always produce the same hash regardless of property order.
  const stableStringify = (obj: any): string => {
    if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
    if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
    const keys = Object.keys(obj).sort();
    return '{' + keys.map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',') + '}';
  };
  return stableStringify(relevantConfig);
}

// Hash function for slot-cut specific parameters
export function hashSlotCut(layer: any, slotLength: number, slotWidth: number, extrusionDepth: number, bevelEnabled: boolean, bevelAmount: number, allLayers: any[], slotMode?: '2-plane' | '3-plane'): string {
  const relevantData = {
    layerId: layer.id,
    layerConfig: layer,
    slotLength,
    slotWidth,
    extrusionDepth,
    bevelEnabled,
    bevelAmount,
    slotMode,
    allLayers: Array.isArray(allLayers) ? allLayers.map(l => ({ id: l.id, enabled: l.enabled, rotation3D: l.rotation3D, slotType: l.slotType })) : []
  };
  return JSON.stringify(relevantData);
}

// Helper to generate cache key for text geometries
export function makeTextKey(layerId: string, textGroup: any, fontSize: number, extrusionDepth: number, bevelEnabled: boolean, bevelAmount: number, globalStrokeWeight: number): string {
  const underline = textGroup.underline;
  const underlineStr = underline ? `${underline.enabled}_${underline.thickness}_${underline.startXOffset}_${underline.length}_${underline.yOffset}_${underline.capType}_${underline.capWidth}` : 'none';
  return `${layerId}::text::${textGroup.text}::${textGroup.fontFamily}::${fontSize}::${extrusionDepth}::${bevelEnabled}::${bevelAmount}::${textGroup.arms}::${textGroup.mirrorEnabled}::${textGroup.mirrorOffset}::${textGroup.textX}::${textGroup.letterSpacing}::${textGroup.thickness}::${underlineStr}::${globalStrokeWeight}`;
}

// Helper to generate cache key for underline geometries
export function makeUnderlineKey(layerId: string, textGroup: any, extrusionDepth: number, bevelEnabled: boolean, bevelAmount: number): string {
  const underline = textGroup.underline;
  return `${layerId}::underline::${underline.thickness}_${underline.startXOffset}_${underline.length}_${underline.yOffset}_${underline.capType}_${underline.capWidth}::${extrusionDepth}::${bevelEnabled}::${bevelAmount}`;
}

// Helper to generate cache key for hub geometries
export function makeHubKey(layerId: string, hub: any, extrusionDepth: number, bevelEnabled: boolean, bevelAmount: number, globalStrokeWeight: number): string {
  return `${layerId}::hub::${hub.enabled}::${hub.outerRadius}::${hub.wallThickness}::${hub.starRatio}::${hub.oscillationAmplitude}::${hub.sides}::${hub.shape}::${hub.oscillationEnabled}::${hub.oscillationFrequency}::${hub.hollow}::${hub.rotationOffset}::${extrusionDepth}::${bevelEnabled}::${bevelAmount}::${globalStrokeWeight}`;
}

// Helper to generate cache key for abstract geometries
export function makeAbstractKey(layerId: string, abstract: any, extrusionDepth: number, bevelEnabled: boolean, bevelAmount: number, globalStrokeWeight: number): string {
  return `${layerId}::abstract::${abstract.enabled}::${abstract.type}::${abstract.size}::${abstract.recursionDepth}::${abstract.lengthDecay}::${abstract.trunkLength}::${abstract.initialLength}::${abstract.randomSeed}::${extrusionDepth}::${bevelEnabled}::${bevelAmount}::${globalStrokeWeight}`;
}

// Helper to generate cache key for slot geometries (already have makeCacheKey in slotGeometryCache.ts, but for consistency)
export function makeSlotKey(layerId: string, slotLength: number, slotWidth: number, extrusionDepth: number, bevelEnabled: boolean, bevelAmount: number): string {
  return `${layerId}::slots::len=${slotLength.toFixed(3)}::w=${slotWidth.toFixed(3)}::d=${extrusionDepth.toFixed(3)}::bevel=${bevelEnabled ? '1' : '0'}::b=${bevelAmount.toFixed(3)}`;
}

// Function to get or create geometry from cache
export function getOrCreateGeometry(cacheMap: Map<string, THREE.BufferGeometry>, key: string, creator: () => THREE.BufferGeometry): THREE.BufferGeometry {
  if (cacheMap.has(key)) {
    return cacheMap.get(key)!.clone(); // Clone to allow safe disposal
  }
  const geo = creator();
  cacheMap.set(key, geo.clone()); // Store clone
  return geo;
}

// Function to clear all caches
export function clearGeometryCache() {
  for (const map of Object.values(geometryCache)) {
    for (const geo of map.values()) {
      geo.dispose();
    }
    map.clear();
  }
  // Clear model caches
  for (const group of modelCache3D.values()) {
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
  }
  modelCache3D.clear();
  modelCache2D.clear();
  // Clear slot cut cache
  for (const geo of slotCutCache.values()) {
    geo.dispose();
  }
  slotCutCache.clear();
}