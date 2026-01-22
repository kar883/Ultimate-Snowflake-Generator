
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { SnowflakeConfig, TextGroupConfig, HubConfig, CharOffset, LayerConfig, AbstractConfig, DesignQuality, UnderlineConfig, ShortcutConfig } from './types';
import { CURSIVE_FONTS, FONT_TTF_URLS } from './constants';
import ControlPanel from './components/ControlPanel';
import SnowflakePreview from './components/SnowflakePreview';
import Snowflake3D from './components/Snowflake3D';
import Header from './components/Header';
import * as THREE_ACTUAL from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils';
import opentype from 'opentype.js';
import JSZip from 'jszip';
import { GoogleGenAI } from "@google/genai";
// @ts-ignore
import { postCSGJob } from './csgWorkerManager';
import { makeCacheKey, getOrCreateSlotGeometries } from './slotGeometryCache';

const MAX_HISTORY = 50;

const DEFAULT_SHORTCUTS: ShortcutConfig = {
    undo: { key: 'z', ctrlKey: true },
    redo: { key: 'z', ctrlKey: true, shiftKey: true },
    toggleView: { key: '1', ctrlKey: true },
    exportCombinedSTL: { key: 'e', ctrlKey: true },
    saveProject: { key: 's', ctrlKey: true },
    loadProject: { key: 'l', ctrlKey: true },
    exportBasePlaneSTL: { key: 'a', ctrlKey: true },
    exportCrossPlaneSTL: { key: 'd', ctrlKey: true },
    exportTiltPlaneSTL: { key: 's', ctrlKey: true, shiftKey: true }, 
    switchToGlobalTab: { key: '1', altKey: true },
    switchToTextTab: { key: '2', altKey: true },
    switchToLetterCtrlTab: { key: '3', altKey: true },
    switchToHubsTab: { key: '4', altKey: true },
    switchToAbstractTab: { key: '5', altKey: true },
    switchToPlanesTab: { key: '6', altKey: true },
};

const useFontCache = () => {
  const fontCache = useRef<Record<string, opentype.Font>>({});
  
  const loadFont = useCallback(async (fontName: string, url: string) => {
    if (fontCache.current[fontName]) {
      return fontCache.current[fontName];
    }
    
    return new Promise<opentype.Font>((resolve, reject) => {
      opentype.load(url, (err, font) => {
        if (err || !font) {
          reject(err || new Error('Failed to load font'));
          return;
        }
        fontCache.current[fontName] = font;
        resolve(font);
      });
    });
  }, []);
  
  return { loadFont, fontCache: fontCache.current };
};

// Geometry cache for text, hubs and abstracts to avoid regenerating unchanged geometries
const useGeometryCache = () => {
  const cacheRef = useRef<{
    text: Map<string, { groupGeo: THREE_ACTUAL.BufferGeometry; underlineGeo?: THREE_ACTUAL.BufferGeometry }>;
    hubs: Map<string, { geo: THREE_ACTUAL.BufferGeometry }>;
    abstracts: Map<string, { geo: THREE_ACTUAL.BufferGeometry; mirrorGeo?: THREE_ACTUAL.BufferGeometry }>
  }>({ text: new Map(), hubs: new Map(), abstracts: new Map() });
  const clear = useCallback(() => {
    try {
      cacheRef.current.text.forEach(v => { v.groupGeo?.dispose?.(); v.underlineGeo?.dispose?.(); });
      cacheRef.current.hubs.forEach(v => { v.geo?.dispose?.(); });
      cacheRef.current.abstracts.forEach(v => { v.geo?.dispose?.(); v.mirrorGeo?.dispose?.(); });
    } catch (e) {
      /* ignore dispose errors */
    }
    cacheRef.current.text.clear();
    cacheRef.current.hubs.clear();
    cacheRef.current.abstracts.clear();
  }, []);
  return { cache: cacheRef.current, clear };
};

const useThreeJSCleanup = () => {
  const geometries = useRef<THREE_ACTUAL.BufferGeometry[]>([]);
  const materials = useRef<THREE_ACTUAL.Material[]>([]);
  const meshes = useRef<THREE_ACTUAL.Mesh[]>([]);
  
  const trackGeometry = useCallback((geo: THREE_ACTUAL.BufferGeometry) => {
    geometries.current.push(geo);
    return geo;
  }, []);
  
  const trackMesh = useCallback((mesh: THREE_ACTUAL.Mesh) => {
    meshes.current.push(mesh);
    return mesh;
  }, []);
  
  const cleanup = useCallback(() => {
    [...geometries.current].forEach(geo => {
      try { geo.dispose(); } catch (e) { console.warn('Failed to dispose geometry:', e); }
    });
    [...materials.current].forEach(mat => {
      try { mat.dispose(); } catch (e) { console.warn('Failed to dispose material:', e); }
    });
    [...meshes.current].forEach(mesh => {
      try { 
        mesh.geometry?.dispose(); 
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(m => m.dispose());
        } else {
          mesh.material?.dispose(); 
        }
      } catch (e) { console.warn('Failed to dispose mesh:', e); }
    });
    
    geometries.current = [];
    materials.current = [];
    meshes.current = [];
  }, []);
  
  return { trackGeometry, trackMesh, cleanup };
};

const useErrorHandler = () => {
  const [error, setError] = useState<{message: string, details?: any} | null>(null);
  
  const handleError = useCallback((error: any, context: string) => {
    console.error(`[${context}] Error:`, error);
    setError({
      message: error.message || 'An unexpected error occurred',
      details: error
    });
    
    // Auto-clear error after 5 seconds
    setTimeout(() => setError(null), 5000);
  }, []);
  
  return { error, handleError };
};

const useExportManager = () => {
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [isExporting, setIsExporting] = useState(false);
  
  const exportWithProgress = useCallback(async (
    exportFn: (onProgress: (progress: number) => void) => Promise<Blob>,
    filename: string
  ) => {
    setIsExporting(true);
    setExportProgress(0);
    
    try {
      const blob = await exportFn((progress) => {
        setExportProgress(progress);
      });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setExportProgress(100);
    } catch (error) {
      console.error('Export failed:', error);
      throw error;
    } finally {
      setTimeout(() => {
        setIsExporting(false);
        setExportProgress(0);
      }, 1000);
    }
  }, []);
  
  return { exportProgress, isExporting, exportWithProgress };
};

const useUserFeedback = () => {
  const [notifications, setNotifications] = useState<Array<{
    id: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
    duration?: number;
  }>>([]);
  
  const showNotification = useCallback((
    message: string, 
    type: 'info' | 'success' | 'warning' | 'error' = 'info',
    duration: number = 3000
  ) => {
    const id = Math.random().toString(36).substr(2, 9);
    setNotifications(prev => [...prev, { id, message, type, duration }]);
    
    if (duration > 0) {
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== id));
      }, duration);
    }
  }, []);
  
  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);
  
  return { notifications, showNotification, removeNotification };
};

const useKeyboardShortcuts = (
    shortcuts: ShortcutConfig, 
    callbacks: { [key in keyof ShortcutConfig]?: () => void } & { forceUpdate3D: () => void }
) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      
      if (e.key === 'Enter' && !isInput) {
          e.preventDefault();
          callbacks.forceUpdate3D();
          return;
      }

      if (isInput) {
        if (!e.ctrlKey && !e.altKey && !e.metaKey) return;
      }
      
      const check = (def: any) => {
          if (!def) return false;
          return e.key.toLowerCase() === def.key.toLowerCase() &&
                 !!e.ctrlKey === !!def.ctrlKey &&
                 !!e.shiftKey === !!def.shiftKey &&
                 !!e.altKey === !!def.altKey &&
                 !!e.metaKey === !!def.metaKey;
      };

      const actions = Object.keys(shortcuts) as (keyof ShortcutConfig)[];
      for (const action of actions) {
          if (check(shortcuts[action]) && callbacks[action]) {
              e.preventDefault();
              callbacks[action]!();
              return;
          }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts, callbacks]);
};

// ... Geometry helpers condensed ...
const removeDegenerateTriangles = (geometry: THREE_ACTUAL.BufferGeometry): THREE_ACTUAL.BufferGeometry => {
    const pos = geometry.attributes.position;
    if (!pos) return geometry;
    const pA = new THREE_ACTUAL.Vector3(); const pB = new THREE_ACTUAL.Vector3(); const pC = new THREE_ACTUAL.Vector3(); const cb = new THREE_ACTUAL.Vector3(); const ab = new THREE_ACTUAL.Vector3();
    const THRESHOLD = 1e-10;
    const newPositions: number[] = [];
    if (geometry.index) {
        const idx = geometry.index;
        for (let i = 0; i < idx.count; i += 3) {
            const a = idx.getX(i); const b = idx.getX(i + 1); const c = idx.getX(i + 2);
            pA.fromBufferAttribute(pos, a); pB.fromBufferAttribute(pos, b); pC.fromBufferAttribute(pos, c);
            if (isNaN(pA.x) || isNaN(pB.x) || isNaN(pC.x)) { continue; }
            cb.subVectors(pC, pB); ab.subVectors(pA, pB); cb.cross(ab);
            if (cb.lengthSq() > THRESHOLD) { newPositions.push(pA.x, pA.y, pA.z); newPositions.push(pB.x, pB.y, pB.z); newPositions.push(pC.x, pC.y, pC.z); }
        }
    } else {
        for (let i = 0; i < pos.count; i += 3) {
            pA.fromBufferAttribute(pos, i); pB.fromBufferAttribute(pos, i+1); pC.fromBufferAttribute(pos, i+2);
            if (isNaN(pA.x) || isNaN(pB.x) || isNaN(pC.x)) { continue; }
            cb.subVectors(pC, pB); ab.subVectors(pA, pB); cb.cross(ab);
            if (cb.lengthSq() > THRESHOLD) { newPositions.push(pA.x, pA.y, pA.z); newPositions.push(pB.x, pB.y, pB.z); newPositions.push(pC.x, pC.y, pC.z); }
        }
    }
    if (newPositions.length > 0) {
        const newGeo = new THREE_ACTUAL.BufferGeometry();
        newGeo.setAttribute('position', new THREE_ACTUAL.Float32BufferAttribute(newPositions, 3));
        return newGeo;
    }
    return geometry;
};

const repairGeometry = (geometry: THREE_ACTUAL.BufferGeometry | null, tolerance: number = 0.0001, merge: boolean = true): THREE_ACTUAL.BufferGeometry | null => {
  if (!geometry || !geometry.attributes.position) return null;
  if (geometry.attributes.color) geometry.deleteAttribute('color');
  if (geometry.attributes.uv) geometry.deleteAttribute('uv');
  try {
    let repaired = removeDegenerateTriangles(geometry);
    if (merge) {
        repaired = BufferGeometryUtils.mergeVertices(repaired, tolerance);
        repaired.computeVertexNormals();
        return repaired;
    }
    repaired.computeVertexNormals();
    return repaired;
  } catch (e) { console.warn("Geometry repair failed:", e); }
  return geometry;
};

const checkConnectivity = (geometry: THREE_ACTUAL.BufferGeometry): boolean => {
    const mergedGeo = BufferGeometryUtils.mergeVertices(geometry, 0.1);
    const index = mergedGeo.index;
    const position = mergedGeo.attributes.position;
    if (!index) return true; 
    const vertexCount = position.count;
    if (vertexCount > 100000) return true; 
    const adj: number[][] = new Array(vertexCount).fill(null).map(() => []);
    for (let i = 0; i < index.count; i += 3) {
        const a = index.getX(i); const b = index.getX(i + 1); const c = index.getX(i + 2);
        adj[a].push(b, c); adj[b].push(a, c); adj[c].push(a, b);
    }
    const visited = new Uint8Array(vertexCount);
    let visitedCount = 0;
    const queue = [0]; visited[0] = 1; visitedCount++;
    let head = 0;
    while(head < queue.length) {
        const u = queue[head++];
        const neighbors = adj[u];
        for(let i = 0; i < neighbors.length; i++) {
            const v = neighbors[i];
            if(visited[v] === 0) { visited[v] = 1; visitedCount++; queue.push(v); }
        }
    }
    return visitedCount === vertexCount;
};

const seededRandom = (seed: number) => {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
};

const createSlotGeometries = (layer: LayerConfig, baseSlotLength: number, baseSlotWidth: number, extrusionDepth: number, bevelEnabled: boolean, bevelAmount: number, allLayers: LayerConfig[]): THREE_ACTUAL.BufferGeometry[] => {
  if (!layer.slotType || layer.slotType === 'none') return [];
  const slots: THREE_ACTUAL.BufferGeometry[] = [];
  const enabledLayers = allLayers.filter(l => l.enabled);
  const numPlanes = enabledLayers.length;
  
  const adjLength = layer.slotLengthAdjustment || 0;
  const adjWidth = layer.slotWidthOffset || 0;
  
  const slotLength = baseSlotLength + adjLength;
  const rotationOffset = layer.primary.rotationOffset;
  
  // `extrusionDepth` is the TOTAL material thickness (including bevel).
  // The `bevelAmount` passed here is the per-side bevel thickness.
  const materialThickness = extrusionDepth;
  const bevelPerSide = bevelEnabled ? bevelAmount : 0;
  // Remaining core thickness after bevels on both sides (not used for cut depth,
  // but useful to reason about geometry if needed).
  const coreThickness = Math.max(0.001, materialThickness - (bevelPerSide * 2));
  const cutThickness = baseSlotWidth + adjWidth;
  // Ensure cuts fully pass through the total material thickness (with small margin).
  const cutDepth = materialThickness + 8.0;
  
  const SLOT_EXTENSION = 200; 

  const createBlade = (length: number, xOffset: number, thickness: number, extent: number, angleX: number, angleZ: number) => {
    const overlap = 2.0; 
    const totalLen = length + overlap;
    const geo = new THREE_ACTUAL.BoxGeometry(totalLen, extent, thickness, 4, 2, 2);
    
    const centerX = xOffset + (length - overlap) / 2;
    
    const eps = 0.001;
    geo.translate(centerX + (Math.random() - 0.5) * eps, (Math.random() - 0.5) * eps, (Math.random() - 0.5) * eps);
    
    const rotEps = 0.0001; 
    geo.rotateX(angleX * Math.PI / 180 + (Math.random() - 0.5) * rotEps);
    geo.rotateZ(angleZ * Math.PI / 180 + (Math.random() - 0.5) * rotEps);
    
    return geo;
  };

  const createVerticalBlade = (length: number, xOffset: number) => {
    return createBlade(length, xOffset, cutThickness, cutDepth, 90, -rotationOffset);
  };

  if (numPlanes === 2) {
    slots.push(createVerticalBlade(slotLength + SLOT_EXTENSION, 0));
    return slots;
  }

  if (numPlanes === 3) {
    const layerIndex = enabledLayers.findIndex(l => l.id === layer.id);
    
    if (layerIndex === 0) {
      // First layer: Two angled cuts at 120° and 240°
      slots.push(createBlade(slotLength + SLOT_EXTENSION, 0, cutThickness, cutDepth, 120, -rotationOffset));
      slots.push(createBlade(slotLength + SLOT_EXTENSION, 0, cutThickness, cutDepth, 240, -rotationOffset));
      
    } else if (layerIndex === 1) {
      // Second layer: Horizontal cut + one angled cut
      slots.push(createBlade(slotLength + SLOT_EXTENSION, 0, cutDepth, cutThickness, 330, -rotationOffset));
      const xOffsetShort = slotLength * 0.75; 
      const shortLength = (slotLength * 0.25) + SLOT_EXTENSION;
      slots.push(createBlade(shortLength, xOffsetShort, cutThickness, cutDepth, 60, -rotationOffset + 180));
      
    } else if (layerIndex === 2) {
      // Third layer: Two angled cuts + extended horizontal
      slots.push(createBlade(slotLength + SLOT_EXTENSION, 0, cutThickness, cutDepth, 240, -rotationOffset));
      slots.push(createBlade(slotLength + SLOT_EXTENSION, 0, cutThickness, cutDepth, 120, -rotationOffset));
      const extLen = slotLength * 0.75;
      const extOff = -extLen;
      slots.push(createBlade(extLen, extOff, cutDepth, cutThickness, 30, -rotationOffset));
    }
    return slots;
  }

  slots.push(createVerticalBlade(slotLength + SLOT_EXTENSION, 0));
  return slots;
};

const applySlotCuts = async (layerGeo: THREE_ACTUAL.BufferGeometry, layer: LayerConfig, slotLength: number, slotWidth: number, extrusionDepth: number, bevelEnabled: boolean, bevelAmount: number, allLayers: LayerConfig[], onProgress?: () => Promise<void>): Promise<THREE_ACTUAL.BufferGeometry> => {
  const cacheKey = makeCacheKey(layer.id || 'layer', slotLength, slotWidth, extrusionDepth, bevelEnabled, bevelAmount);
  const slotGeometries = getOrCreateSlotGeometries(cacheKey, () => createSlotGeometries(layer, slotLength, slotWidth, extrusionDepth, bevelEnabled, bevelAmount, allLayers));
  if (slotGeometries.length === 0) return layerGeo;
  // Serialize Base early so filtered worker calls can reference it.
  const baseData = {
      position: layerGeo.attributes.position.array,
      normal: layerGeo.attributes.normal?.array,
      index: layerGeo.index?.array
  };

  // Fast AABB filter: rotate slot blades into the same orientation as the
  // provided `layerGeo` and skip any blades whose bounding box doesn't
  // intersect the layer's bounding box. This avoids expensive CSG work
  // when blades don't affect the plane. We keep original `slotGeometries`
  // intact for disposal and worker serialization, but only send the
  // intersecting subset to the worker.
  try {
    if (!layerGeo.boundingBox) layerGeo.computeBoundingBox();
    const layerBB = layerGeo.boundingBox ? layerGeo.boundingBox.clone() : null;
    if (layerBB) {
      const rotX = layer.rotation3D?.x ? layer.rotation3D.x * Math.PI / 180 : 0;
      const rotY = layer.rotation3D?.y ? layer.rotation3D.y * Math.PI / 180 : 0;
      const rotZ = layer.rotation3D?.z ? layer.rotation3D.z * Math.PI / 180 : 0;
      const rotMat = new THREE_ACTUAL.Matrix4();
      rotMat.makeRotationX(rotX).multiply(new THREE_ACTUAL.Matrix4().makeRotationY(rotY)).multiply(new THREE_ACTUAL.Matrix4().makeRotationZ(rotZ));

      const keptSlots: THREE_ACTUAL.BufferGeometry[] = [];
      for (const g of slotGeometries) {
        try {
          const clone = g.clone();
          clone.applyMatrix4(rotMat);
          clone.computeBoundingBox();
          const gbb = clone.boundingBox;
          // small padding to be safe
          if (gbb && layerBB.expandByScalar) {
            const padded = gbb.clone().expandByScalar(0.5);
            if (layerBB.intersectsBox(padded)) keptSlots.push(g);
          } else if (gbb && layerBB.intersectsBox(gbb)) {
            keptSlots.push(g);
          }
          clone.dispose?.();
        } catch (e) {
          // If anything goes wrong, be conservative and keep the slot
          keptSlots.push(g);
        }
      }

      if (keptSlots.length === 0) {
        // Nothing intersects — dispose slot geometries and return original mesh
        slotGeometries.forEach(s => s.dispose());
        return layerGeo;
      }

      // Replace slotsData to only include keptSlots
      const slotsData = keptSlots.map(g => ({
        position: g.attributes.position.array,
        normal: g.attributes.normal?.array,
        index: g.index?.array
      }));

      // Worker Communication (filtered) via manager
      return postCSGJob(baseData, slotsData, layer.rotation3D)
        .then((e: any) => {
          const { position, normal, index } = e;
          const resultGeo = new THREE_ACTUAL.BufferGeometry();
          resultGeo.setAttribute('position', new THREE_ACTUAL.BufferAttribute(position, 3));
          if (normal) resultGeo.setAttribute('normal', new THREE_ACTUAL.BufferAttribute(normal, 3));
          if (index) resultGeo.setIndex(new THREE_ACTUAL.BufferAttribute(index, 1));
          // Dispose original slots (we kept references in slotGeometries)
          slotGeometries.forEach(g => g.dispose());
          return resultGeo;
        })
        .catch((err: any) => {
          console.error('CSG Worker Error', err);
          slotGeometries.forEach(g => g.dispose());
          return layerGeo;
        });
    }
  } catch (e) {
    console.warn('Slot AABB filtering failed, proceeding with full CSG', e);
  }

    // Fallback: serialize all slots (reuse `baseData` declared earlier)
    const allSlotsData = slotGeometries.map(g => ({
      position: g.attributes.position.array,
      normal: g.attributes.normal?.array,
      index: g.index?.array
    }));

    // If we fell through (no layerBB or error), fall back to original worker call
    return postCSGJob(baseData, allSlotsData, layer.rotation3D)
      .then((e: any) => {
        const { position, normal, index } = e;
        const resultGeo = new THREE_ACTUAL.BufferGeometry();
        resultGeo.setAttribute('position', new THREE_ACTUAL.BufferAttribute(position, 3));
        if (normal) resultGeo.setAttribute('normal', new THREE_ACTUAL.BufferAttribute(normal, 3));
        if (index) resultGeo.setIndex(new THREE_ACTUAL.BufferAttribute(index, 1));
        // Dispose original slots
        slotGeometries.forEach(g => g.dispose());
        return resultGeo;
      })
      .catch((err: any) => {
        console.error('CSG Worker Error', err);
        slotGeometries.forEach(g => g.dispose());
        return layerGeo; // Fallback to original
      });
};

const createDefaultTextGroup = (text: string, rotation: number, fontSize: number, textX: number): TextGroupConfig => ({
  enabled: true,
  text,
  fontFamily: CURSIVE_FONTS[0].name,
  arms: 6,
  textX, 
  letterSpacing: 0,
  thickness: 0, 
  fontSize, 
  mirrorEnabled: true,
  mirrorOffset: 0,
  rotationOffset: rotation,
  charOffsets: Array.from({ length: text.length }, () => ({ x: 0, y: 0 })),
  underline: { enabled: false, thickness: 1.5, startXOffset: 0, length: 50, yOffset: -5, capType: 'none', capWidth: 10 }
});

const createDefaultLayer = (id: string, name: string, rx = 0, ry = 0, isEnabled = false): LayerConfig => ({
  id,
  name,
  enabled: isEnabled,
  rotation3D: { x: rx, y: ry },
  primary: createDefaultTextGroup("Snow", 0, 36.7, 20), 
  secondary: createDefaultTextGroup("", 30, 20, 10),
  secondaryEnabled: true,
  abstracts: [],
  hubs: [],
  slotType: 'none',
  slotLengthAdjustment: 0,
  slotWidthOffset: 0
});

const calculateOptimalSlots = (layers: LayerConfig[]): LayerConfig[] => {
  const updatedLayers = JSON.parse(JSON.stringify(layers)) as LayerConfig[];
  const enabled = updatedLayers.filter(l => l.enabled);
  const count = enabled.length;
  if (count < 2) { console.warn('Need at least 2 enabled layers for slot calculation'); return updatedLayers; }
  if (count === 2) {
    enabled[0].rotation3D = { x: 0, y: 0 }; enabled[0].slotType = 'half-back';
    enabled[1].rotation3D = { x: 90, y: 0 }; enabled[1].slotType = 'half-front';
  } else if (count === 3) {
    enabled[0].rotation3D = { x: 0, y: 0 }; enabled[0].slotType = 'third-back';
    enabled[1].rotation3D = { x: 120, y: 0 }; enabled[1].slotType = 'third-middle';
    enabled[2].rotation3D = { x: 240, y: 0 }; enabled[2].slotType = 'third-front';
  } else {
    enabled.forEach((layer, index) => { const angle = (360 / count) * index; layer.rotation3D = { x: angle, y: 0 }; layer.slotType = 'custom'; });
  }
  return updatedLayers;
};

const App: React.FC = () => {
  const defaultDepth = 3.0;
  
  const initialState: SnowflakeConfig = {
    projectName: "MySnowflake",
    layers: [
      createDefaultLayer('layer-1', 'Base Plane', 0, 0, true),
      createDefaultLayer('layer-2', 'Cross Plane', 120, 0, false),
      createDefaultLayer('layer-4', 'Tilt Plane', 240, 0, false),
    ],
    activeLayerIndex: 0,
    color: "#38bdf8",
    extrusionDepth: defaultDepth,
    bevelEnabled: true, // Default ON
    bevelType: 'fillet',
    bevelAmount: 0.4,
    bevelSegments: 5, 
    slotEnabled: false,
    slotLength: 95, 
    slotWidth: 4.0, 
    quality: 'low',
    syncAllLayers: true // Default ON
  };

  const [config, setConfig] = useState<SnowflakeConfig>(initialState);
  const [config3D, setConfig3D] = useState<SnowflakeConfig>(initialState); 
  const [rendered3DConfig, setRendered3DConfig] = useState<SnowflakeConfig>(initialState); 
  // Guarded setter: only update rendered3DConfig when it actually differs
  const setRendered3DIfChanged = useCallback((next: SnowflakeConfig) => {
    setRendered3DConfig(prev => {
      try {
        if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
      } catch (e) {
        // Fallback: if stringify fails, fall through and set
      }
      return next;
    });
  }, []);
  const [designDiameter, setDesignDiameter] = useState(0); 
  const [activeTab, setActiveTab] = useState<'global' | 'text' | 'Letter Ctrl' | 'hubs' | 'abstract' | 'planes'>('text');
  const [shortcuts, setShortcuts] = useState<ShortcutConfig>(DEFAULT_SHORTCUTS);

  const [history, setHistory] = useState<SnowflakeConfig[]>([initialState]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const [exportLoading, setExportLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiProgress, setAiProgress] = useState(0); 
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d'); 
  const [dynamicFonts, setDynamicFonts] = useState<Record<string, string>>(FONT_TTF_URLS);
  
  const svgRef = useRef<SVGSVGElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csgEvaluator = useRef(null); // No longer needed on main thread for cutting
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  const { loadFont } = useFontCache();
  const { cleanup } = useThreeJSCleanup();
  const { handleError } = useErrorHandler();
  const { exportWithProgress } = useExportManager();
  const { notifications, showNotification } = useUserFeedback();
  const { cache: geometryCache, clear: clearGeometryCache } = useGeometryCache();

  // Diameter Calculation Logic
  useEffect(() => {
    let active = true;
    const calc = async () => {
        const enabledLayers = config.layers.filter(l => l.enabled);
        if (!enabledLayers.length) {
            if(active) setDesignDiameter(0);
            return;
        }

        let maxR = 0;
        const bevelPadding = config.bevelEnabled ? config.bevelAmount : 0;

        for (const layer of enabledLayers) {
            // Hubs
            for (const h of layer.hubs) {
                if (h.enabled) {
                    let r = h.outerRadius;
                    if (h.shape === 'circle' && h.oscillationEnabled) r += h.oscillationAmplitude;
                    r += bevelPadding;
                    if (r > maxR) maxR = r;
                }
            }
            // Abstracts
            for (const a of layer.abstracts) {
                if (a.enabled) {
                    let r = 0;
                    if (a.type === 'fractal') {
                       if (a.outerRadius > 0) r = a.outerRadius;
                       else r = a.innerRadius + (a.trunkLength || 0) + ((a.initialLength || 30) * 3); // Approx
                    } else {
                       r = a.outerRadius;
                    }
                    r += (a.thickness / 2) + bevelPadding;
                    if (r > maxR) maxR = r;
                }
            }
            // Text
            for (const group of [layer.primary, layer.secondary]) {
                if (group.enabled && group.text) {
                    const fontName = group.fontFamily.replace(/'/g, '').split(',')[0].trim();
                    const url = dynamicFonts[fontName] || FONT_TTF_URLS[fontName];
                    try {
                        const font = await loadFont(fontName, url); 
                        if (font) {
                            const scale = group.fontSize / font.unitsPerEm;
                            const glyphs = font.stringToGlyphs(group.text);
                            let currentX = 0;
                            let maxGlyphX = 0;
                            glyphs.forEach((glyph, i) => {
                                const offset = group.charOffsets[i] || { x: 0, y: 0 };
                                const bbox = glyph.getBoundingBox();
                                const glyphRightEdge = currentX + offset.x + (bbox.x2 * scale);
                                if (glyphRightEdge > maxGlyphX) maxGlyphX = glyphRightEdge;
                                currentX += (glyph.advanceWidth * scale) + group.letterSpacing;
                            });
                            
                            let textExtent = group.textX + maxGlyphX; 
                            
                            // Underline
                            if (group.underline?.enabled) {
                                 const u = group.underline;
                                 const uEnd = group.textX + u.startXOffset + u.length;
                                 let capExt = (u.capType !== 'none') ? u.capWidth : 0;
                                 if (uEnd + capExt > textExtent) textExtent = uEnd + capExt;
                            }

                            textExtent += bevelPadding;
                            if (textExtent > maxR) maxR = textExtent;
                        }
                    } catch (e) {
                        // Fallback
                    }
                }
            }
        }
        if(active) setDesignDiameter(maxR * 2);
    };
    calc();
    return () => { active = false; };
  }, [config, dynamicFonts, loadFont]);

  const handleUpdateConfig = useCallback((updates: Partial<SnowflakeConfig>, commitTo3D: boolean = false) => {
    setConfig(prev => {
      const next = { ...prev, ...updates };
      
      if (debounceTimer.current) {
          clearTimeout(debounceTimer.current);
          debounceTimer.current = null;
      }

      if (commitTo3D) {
        setConfig3D(next);
        setHistory(h => {
            const newHistory = [...h.slice(0, historyIndex + 1), JSON.parse(JSON.stringify(next))];
            if (newHistory.length > MAX_HISTORY) return newHistory.slice(newHistory.length - MAX_HISTORY);
            return newHistory;
        });
        setHistoryIndex(i => Math.min(i + 1, MAX_HISTORY - 1));
        
        // Immediate update for 3D view (whether visible or not, it keeps it in sync)
        setRendered3DIfChanged(next);
      } else {
        // Debounce update for 3D view
        // If in 3D mode: fast debounce (300ms) for responsiveness
        // If in 2D mode: slow debounce (1000ms) to avoid lagging the UI with background generation
        const delay = viewMode === '3d' ? 300 : 1000;
        debounceTimer.current = setTimeout(() => {
          setRendered3DIfChanged(next);
        }, delay);
      }
      return next;
    });
  }, [historyIndex, viewMode]);

  useEffect(() => {
      return () => {
          if (debounceTimer.current) clearTimeout(debounceTimer.current);
      }
  }, []);

  const updateGroup = useCallback((group: 'primary' | 'secondary', updates: Partial<TextGroupConfig>, commitTo3D: boolean = false) => {
    handleUpdateConfig({
      layers: config.layers.map((layer, idx) => {
        if (idx === config.activeLayerIndex || config.syncAllLayers) {
            return { ...layer, [group]: { ...layer[group], ...updates } };
        }
        return layer;
      })
    }, commitTo3D);
  }, [config.layers, config.activeLayerIndex, config.syncAllLayers, handleUpdateConfig]);

  const updateCharOffset = useCallback((group: 'primary' | 'secondary', charIndex: number, offset: Partial<CharOffset>, commitTo3D: boolean = false) => {
    handleUpdateConfig({
      layers: config.layers.map((layer, idx) => {
        if (idx === config.activeLayerIndex || config.syncAllLayers) {
            const newOffsets = [...layer[group].charOffsets];
            if (!newOffsets[charIndex]) newOffsets[charIndex] = { x: 0, y: 0 };
            newOffsets[charIndex] = { ...newOffsets[charIndex], ...offset };
            return { ...layer, [group]: { ...layer[group], charOffsets: newOffsets } };
        }
        return layer;
      })
    }, commitTo3D);
  }, [config.layers, config.activeLayerIndex, config.syncAllLayers, handleUpdateConfig]);

  const updateHubs = useCallback((newHubs: HubConfig[], commitTo3D: boolean = false) => {
    handleUpdateConfig({
        layers: config.layers.map((layer, idx) => {
            if (idx === config.activeLayerIndex) {
                return { ...layer, hubs: newHubs };
            }
            if (config.syncAllLayers) {
                return { ...layer, hubs: JSON.parse(JSON.stringify(newHubs)) };
            }
            return layer;
        })
    }, commitTo3D);
  }, [config.layers, config.activeLayerIndex, config.syncAllLayers, handleUpdateConfig]);

  const updateAbstracts = useCallback((newAbstracts: AbstractConfig[], commitTo3D: boolean = false) => {
    handleUpdateConfig({
        layers: config.layers.map((layer, idx) => {
            if (idx === config.activeLayerIndex) {
                return { ...layer, abstracts: newAbstracts };
            }
            if (config.syncAllLayers) {
                return { ...layer, abstracts: JSON.parse(JSON.stringify(newAbstracts)) };
            }
            return layer;
        })
    }, commitTo3D);
  }, [config.layers, config.activeLayerIndex, config.syncAllLayers, handleUpdateConfig]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
        setHistoryIndex(i => i - 1);
        const prev = history[historyIndex - 1];
        setConfig(prev);
        setConfig3D(prev);
        if (viewMode === '3d') setRendered3DIfChanged(prev);
    }
  }, [history, historyIndex, viewMode]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
        setHistoryIndex(i => i + 1);
        const next = history[historyIndex + 1];
        setConfig(next);
        setConfig3D(next);
        if (viewMode === '3d') setRendered3DIfChanged(next);
    }
  }, [history, historyIndex, viewMode]);

  const generateMesh = useCallback(async (onProgress: (p: number) => void, overrideQuality?: DesignQuality): Promise<THREE_ACTUAL.Group> => {
    const qualityToUse = overrideQuality || rendered3DConfig.quality;
    let qMult = 1;
    let curveSeg = 12;
    let bevelSegCap = 10;
    
    if (qualityToUse === 'low') {
        qMult = 0.5;
        curveSeg = 6;
        bevelSegCap = 4;
    } else if (qualityToUse === 'med') {
        qMult = 0.8;
        curveSeg = 12;
        bevelSegCap = 6;
    } else {
        qMult = 1.0;
        curveSeg = 24;
        bevelSegCap = 12;
    }

    // `extrusionDepth` represents the overall material thickness INCLUDING any bevel.
    // Compute bevel as a per-side value and clamp it so it never exceeds half
    // the total thickness (to avoid negative core depth).
    const bevelPerSide = rendered3DConfig.bevelEnabled ? Math.min(rendered3DConfig.bevelAmount, rendered3DConfig.extrusionDepth / 2) : 0;
    const effectiveDepth = Math.max(0.001, rendered3DConfig.extrusionDepth);

    const extrudeSettings = {
      depth: effectiveDepth,
      bevelEnabled: rendered3DConfig.bevelEnabled,
      bevelThickness: bevelPerSide,
      bevelSize: bevelPerSide, // Standard expansion
      bevelSegments: rendered3DConfig.bevelEnabled ? (rendered3DConfig.bevelType === 'chamfer' ? 1 : Math.min(rendered3DConfig.bevelSegments, bevelSegCap)) : 0,
      curveSegments: curveSeg,
    };

    const group = new THREE_ACTUAL.Group();
    // Use all layers to generate geometry so instant toggling works
    const layersToGenerate = rendered3DConfig.layers;
    
    let totalOps = layersToGenerate.length; 
    if (rendered3DConfig.slotEnabled) {
        const numPlanes = layersToGenerate.length;
        if (numPlanes === 2) totalOps += 2;
        else if (numPlanes === 3) totalOps += 7;
        else totalOps += layersToGenerate.length;
    }

    let completedOps = 0;
    
    const updateProgress = async () => {
        completedOps++;
        onProgress(Math.min(0.99, completedOps / totalOps));
        await new Promise(r => setTimeout(r, 10)); 
    };

    for (let lIdx = 0; lIdx < layersToGenerate.length; lIdx++) {
      const layer = layersToGenerate[lIdx];
      const layerGeometries: THREE_ACTUAL.BufferGeometry[] = [];
      
      const processTextGroup = async (textGroup: TextGroupConfig) => {
        if (!textGroup.enabled) return;
        
        const fontName = textGroup.fontFamily.replace(/'/g, '').split(',')[0].trim();
        const url = dynamicFonts[fontName] || FONT_TTF_URLS[fontName];
        
        const font = await loadFont(fontName, url).catch((error) => {
          console.warn(`Failed to load font ${fontName}:`, error);
          return null;
        });
        if (font) {
            const scale = textGroup.fontSize / font.unitsPerEm;
            // Build a cache key for this text shape + extrude settings
            const textKey = JSON.stringify({
              fontName,
              url,
              text: textGroup.text,
              fontSize: textGroup.fontSize,
              charOffsets: textGroup.charOffsets,
              letterSpacing: textGroup.letterSpacing,
              mirrorEnabled: textGroup.mirrorEnabled,
              mirrorOffset: textGroup.mirrorOffset,
              underline: textGroup.underline,
              arms: textGroup.arms,
              rotationOffset: textGroup.rotationOffset,
              extrude: {
                depth: extrudeSettings.depth,
                bevelEnabled: extrudeSettings.bevelEnabled,
                bevelSize: extrudeSettings.bevelSize,
                bevelSegments: extrudeSettings.bevelSegments,
                curveSegments: extrudeSettings.curveSegments
              }
            });

            let groupGeo: THREE_ACTUAL.BufferGeometry | null = null;
            let underlineGeo: THREE_ACTUAL.BufferGeometry | null = null;

            if (geometryCache.text.has(textKey)) {
              const cached = geometryCache.text.get(textKey);
              if (cached) {
                groupGeo = cached.groupGeo.clone();
                if (cached.underlineGeo) underlineGeo = cached.underlineGeo.clone();
              }
            } else {
              const glyphs = font.stringToGlyphs(textGroup.text);
              let shapes: THREE_ACTUAL.Shape[] = [];
              let currentX = 0;
              glyphs.forEach((glyph, i) => {
                const offset = textGroup.charOffsets[i] || { x: 0, y: 0 };
                const path = glyph.getPath(currentX + offset.x, offset.y, textGroup.fontSize);
                const threePath = new THREE_ACTUAL.ShapePath();
                path.commands.forEach(cmd => {
                  if (cmd.type === 'M') threePath.moveTo(cmd.x, cmd.y);
                  else if (cmd.type === 'L') threePath.lineTo(cmd.x, cmd.y);
                  else if (cmd.type === 'Q') threePath.quadraticCurveTo(cmd.x1, cmd.y1, cmd.x, cmd.y);
                  else if (cmd.type === 'C') threePath.bezierCurveTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y);
                });
                shapes.push(...threePath.toShapes(true));
                currentX += (glyph.advanceWidth * scale) + textGroup.letterSpacing;
              });

              groupGeo = new THREE_ACTUAL.ExtrudeGeometry(shapes, extrudeSettings);

              // Underline Logic
              const uConf = textGroup.underline;
              let underlineShapes: THREE_ACTUAL.Shape[] = [];

              if (uConf && uConf.enabled) {
                // ... (Keep existing underline logic exactly as is) ...
                const t = uConf.thickness;
                const halfT = t / 2;
                const startX = textGroup.textX + uConf.startXOffset;
                const endX = startX + uConf.length;
                
                if (!textGroup.mirrorEnabled) {
                    const topY = (textGroup.mirrorOffset / 2) + uConf.yOffset;
                    const shape = new THREE_ACTUAL.Shape();
                    shape.moveTo(startX, topY + halfT);
                    shape.lineTo(endX, topY + halfT);
                    shape.lineTo(endX, topY - halfT);
                    shape.lineTo(startX, topY - halfT);
                    shape.closePath();
                    underlineShapes.push(shape);
                } else {
                    if (uConf.capType === 'none') {
                        const topY = (textGroup.mirrorOffset / 2) + uConf.yOffset;
                        const botY = -(textGroup.mirrorOffset / 2) - uConf.yOffset;

                        const shape1 = new THREE_ACTUAL.Shape();
                        shape1.moveTo(startX, topY + halfT);
                        shape1.lineTo(endX, topY + halfT);
                        shape1.lineTo(endX, topY - halfT);
                        shape1.lineTo(startX, topY - halfT);
                        shape1.closePath();
                        underlineShapes.push(shape1);

                        const shape2 = new THREE_ACTUAL.Shape();
                        shape2.moveTo(startX, botY + halfT);
                        shape2.lineTo(endX, botY + halfT);
                        shape2.lineTo(endX, botY - halfT);
                        shape2.lineTo(startX, botY - halfT);
                        shape2.closePath();
                        underlineShapes.push(shape2);
                    } else {
                        const y1 = (textGroup.mirrorOffset / 2) + uConf.yOffset;
                        const y2 = -(textGroup.mirrorOffset / 2) - uConf.yOffset;
                        
                        const actualTopY = Math.max(y1, y2);
                        const actualBotY = Math.min(y1, y2);
                        
                        const outerTop = actualTopY + halfT;
                        const innerTop = actualTopY - halfT;
                        const outerBot = actualBotY - halfT;
                        const innerBot = actualBotY + halfT;
                        
                        const capOuterX = endX + uConf.capWidth;
                        const capInnerX = Math.max(endX, endX + uConf.capWidth - (t * 1.5));
                        
                        const shape = new THREE_ACTUAL.Shape();
                        shape.moveTo(startX, outerTop);
                        if (uConf.capType === 'square') {
                             shape.lineTo(endX, outerTop);
                             shape.lineTo(capOuterX, outerTop);
                             shape.lineTo(capOuterX, outerBot);
                             shape.lineTo(endX, outerBot);
                        } else if (uConf.capType === 'round') {
                             const ry = (outerTop - outerBot) / 2;
                             const rx = uConf.capWidth;
                             const cy = (outerTop + outerBot) / 2;
                             shape.absellipse(endX, cy, rx, ry, Math.PI/2, -Math.PI/2, true);
                        } else if (uConf.capType === 'chevron') {
                             shape.lineTo(endX, outerTop);
                             const cy = (outerTop + outerBot) / 2;
                             shape.lineTo(capOuterX, cy);
                             shape.lineTo(endX, outerBot);
                        } else { 
                             shape.lineTo(endX, outerTop);
                             shape.lineTo(endX, outerBot);
                        }
                        shape.lineTo(startX, outerBot);
                        shape.lineTo(startX, innerBot);
                        if (uConf.capType === 'square') {
                             shape.lineTo(endX, innerBot);
                             if (capInnerX > endX + 0.001) {
                                 shape.lineTo(capInnerX, innerBot);
                                 shape.lineTo(capInnerX, innerTop);
                             }
                             shape.lineTo(endX, innerTop);
                        } else if (uConf.capType === 'round') {
                             const ry = (innerTop - innerBot) / 2;
                             if (ry > 0.001) {
                                 const rx = Math.max(0.001, uConf.capWidth - t);
                                 const cy = (outerTop + outerBot) / 2;
                                 shape.absellipse(endX, cy, rx, ry, -Math.PI/2, Math.PI/2, false);
                             } else {
                                 shape.lineTo(endX, innerBot); 
                                 shape.lineTo(endX, innerTop);
                             }
                        } else if (uConf.capType === 'chevron') {
                             shape.lineTo(endX, innerBot);
                             const innerTipX = Math.max(endX, endX + uConf.capWidth - (t * 1.5));
                             const cy = (outerTop + outerBot) / 2;
                             if (innerTipX > endX + 0.001 && (innerTop > innerBot)) {
                                 shape.lineTo(innerTipX, cy);
                             }
                             shape.lineTo(endX, innerTop);
                        } else {
                             shape.lineTo(endX, innerBot);
                             shape.lineTo(endX, innerTop);
                        }
                        shape.lineTo(startX, innerTop);
                        shape.closePath();
                        underlineShapes.push(shape);
                    }
                }
                }
              }

              if (underlineShapes.length > 0) {
                underlineGeo = new THREE_ACTUAL.ExtrudeGeometry(underlineShapes, extrudeSettings);
              }

              // Cache the generated geometries (store clones to keep originals safe)
              try {
                geometryCache.text.set(textKey, { groupGeo: groupGeo.clone(), underlineGeo: underlineGeo ? underlineGeo.clone() : undefined });
              } catch (e) {
                // ignore caching errors
              }
            }

            const angleStep = (Math.PI * 2) / textGroup.arms;
            
            // Center the extrusion on Z-axis
            const centerZOffset = -extrudeSettings.depth / 2;

            for (let i = 0; i < textGroup.arms; i++) {
              const angle = i * angleStep + (textGroup.rotationOffset * Math.PI / 180);
              const inst = groupGeo.clone();
              inst.translate(textGroup.textX, textGroup.mirrorOffset / 2, centerZOffset);
              inst.rotateX(Math.PI); inst.rotateZ(-angle);
              layerGeometries.push(inst);
              if (textGroup.mirrorEnabled) {
                const mirrored = groupGeo.clone();
                mirrored.translate(textGroup.textX, -textGroup.mirrorOffset / 2, centerZOffset);
                mirrored.rotateZ(-angle); layerGeometries.push(mirrored);
              }
              if (underlineGeo) {
                  const uInst = underlineGeo.clone();
                  uInst.translate(0, 0, centerZOffset);
                  uInst.rotateX(Math.PI);
                  uInst.rotateZ(-angle);
                  layerGeometries.push(uInst);
              }
            }
          }
        }
      };

      const processHubs = (hubs: HubConfig[]) => {
         // ... (Keep existing hub logic but ensure centerZOffset is correct)
         const centerZOffset = -extrudeSettings.depth / 2;
         hubs.filter(h => h.enabled).forEach(hub => {
             // ... (Shape generation code - same as original) ...
             const shape = new THREE_ACTUAL.Shape();
             const radius = !isNaN(hub.outerRadius) ? hub.outerRadius : 20;
             const wallT = !isNaN(hub.wallThickness) ? hub.wallThickness : 2;
             const sRatio = !isNaN(hub.starRatio) ? hub.starRatio : 0.5;
             const amp = !isNaN(hub.oscillationAmplitude) ? hub.oscillationAmplitude : 5;
             
             const sides = hub.shape === 'star' ? Math.floor(hub.sides * 2) : (hub.shape === 'polygon' ? Math.floor(hub.sides) : 64);
             const isOsc = hub.shape === 'circle' && hub.oscillationEnabled;
             
             const baseRes = Math.ceil( (hub.shape === 'circle' ? 128 : 64) * qMult );
             const oscRes = Math.ceil( Math.max(baseRes, hub.oscillationFrequency * 48 * qMult) );
             const res = isOsc ? oscRes : (hub.shape === 'circle' ? baseRes : sides);
             
             for(let i=0; i<=res; i++) {
                 const angle = (i/res) * Math.PI * 2;
                 let r = radius;
                 if (hub.shape === 'star') r = (i%2 === 0) ? r : r * sRatio;
                 if (isOsc) r += Math.sin(angle * hub.oscillationFrequency) * amp;
                 const x = Math.cos(angle) * r;
                 const y = Math.sin(angle) * r;
                 if (i===0) shape.moveTo(x,y); else shape.lineTo(x,y);
             }

             if (hub.hollow) {
                 const hole = new THREE_ACTUAL.Path();
                 for(let i=0; i<=res; i++) {
                     const angle = (i/res) * Math.PI * 2;
                     let r = radius - wallT;
                     if (r < 0) r = 0.1; 
                     if (hub.shape === 'star') r = (i%2 === 0) ? r : r * sRatio;
                     if (isOsc) r += Math.sin(angle * hub.oscillationFrequency) * amp;
                     const x = Math.cos(angle) * r;
                     const y = Math.sin(angle) * r;
                     if (i===0) hole.moveTo(x,y); else hole.lineTo(x,y);
                 }
                 shape.holes.push(hole);
             }

             // Build a cache key for the hub geometry
             const hubKey = JSON.stringify({
               hub,
               extrude: {
                 depth: extrudeSettings.depth,
                 bevelEnabled: extrudeSettings.bevelEnabled,
                 bevelSize: extrudeSettings.bevelSize,
                 bevelSegments: extrudeSettings.bevelSegments,
                 curveSegments: extrudeSettings.curveSegments
               }
             });

             if (geometryCache.hubs.has(hubKey)) {
               const cached = geometryCache.hubs.get(hubKey);
               if (cached && cached.geo) {
                 const cachedClone = cached.geo.clone();
                 cachedClone.rotateZ(hub.rotationOffset * Math.PI / 180);
                 cachedClone.translate(0, 0, centerZOffset);
                 layerGeometries.push(cachedClone);
                 return;
               }
             }

             const geo = new THREE_ACTUAL.ExtrudeGeometry(shape, extrudeSettings);
             geo.rotateZ(hub.rotationOffset * Math.PI / 180);
             geo.translate(0, 0, centerZOffset);
             layerGeometries.push(geo);

             try {
               geometryCache.hubs.set(hubKey, { geo: geo.clone() });
             } catch (e) {
               // ignore cache failures
             }
         });
      };

      const processAbstracts = (abstracts: AbstractConfig[]) => {
          // ... (Keep existing abstract logic but ensure centerZOffset is correct)
          const centerZOffset = -extrudeSettings.depth / 2;
          // ... (Abstract generation code - reuse logic) ...
          abstracts.filter(a => a.enabled).forEach(abs => {
               // ... (Fractal and Shape logic - assume copied from previous context or reuse existing)
               // For brevity, using the same robust logic structure as App.tsx
               if (abs.type === 'fractal') {
                   // Build a cache key for fractal abstract
                   const absKey = JSON.stringify({
                     type: 'fractal',
                     params: abs,
                     extrude: {
                       depth: extrudeSettings.depth,
                       bevelEnabled: extrudeSettings.bevelEnabled,
                       bevelSize: extrudeSettings.bevelSize,
                       bevelSegments: extrudeSettings.bevelSegments,
                       curveSegments: extrudeSettings.curveSegments
                     },
                     qMult
                   });

                   if (geometryCache.abstracts.has(absKey)) {
                     const cached = geometryCache.abstracts.get(absKey)!;
                     const fractalClone = cached.geo.clone();
                     const angleStep = (Math.PI * 2) / abs.arms;
                     for(let i=0; i<abs.arms; i++) {
                         const angle = i * angleStep + (abs.rotationOffset * Math.PI / 180);
                         const absInst = fractalClone.clone();
                         absInst.translate(0, abs.mirrorOffset/2, centerZOffset);
                         absInst.rotateZ(angle);
                         layerGeometries.push(absInst);
                         if (abs.mirrorEnabled && cached.mirrorGeo) {
                             const mirClone = cached.mirrorGeo.clone();
                             mirClone.translate(0, -abs.mirrorOffset/2, centerZOffset);
                             mirClone.rotateZ(angle);
                             layerGeometries.push(mirClone);
                         } else if (abs.mirrorEnabled) {
                             const mir = fractalClone.clone();
                             mir.scale(1, -1, 1);
                             mir.translate(0, -abs.mirrorOffset/2, centerZOffset);
                             mir.rotateZ(angle);
                             layerGeometries.push(mir);
                         }
                     }
                     return;
                   }
                   // ... (Fractal generation)
                   const shapes: THREE_ACTUAL.Shape[] = [];
                   const rng = seededRandom(abs.randomSeed || 1234);
                   
                   const decay = abs.lengthDecay || 0.8;
                   const depth = abs.recursionDepth || 4;
                   const trunk = abs.trunkLength || 0;
                   const init = abs.initialLength || 30;
                   
                   let theoreticalMax = trunk;
                   if (Math.abs(decay - 1) < 0.0001) {
                       theoreticalMax += init * depth;
                   } else {
                       theoreticalMax += init * ((1 - Math.pow(decay, depth)) / (1 - decay));
                   }
                   
                   const availableSpace = abs.outerRadius - abs.innerRadius;
                   const scaleFactor = (availableSpace > 0 && theoreticalMax > 0) 
                       ? Math.min(1.0, availableSpace / theoreticalMax) 
                       : 1.0;

                   const effectiveTrunk = trunk * scaleFactor;
                   const effectiveInit = init * scaleFactor;
                   const effectiveMinBranch = (abs.minBranchLength || 5) * scaleFactor;

                   const generateBranch = (x: number, y: number, angleRad: number, length: number, width: number, depth: number) => {
                       // ... (Recursive branch logic from original code)
                       if (isNaN(x) || isNaN(y) || isNaN(angleRad) || isNaN(length) || isNaN(width)) return;
                       if (depth <= 0 || length < (effectiveMinBranch || 0.1)) return;
                       
                       const endX = x + Math.cos(angleRad) * length;
                       const endY = y + Math.sin(angleRad) * length;
                       if (isNaN(endX) || isNaN(endY)) return;
                       const nextWidth = width * (abs.thicknessDecay || 0.8);
                       const shape = new THREE_ACTUAL.Shape();
                       const perpX = -Math.sin(angleRad);
                       const perpY = Math.cos(angleRad);
                       const halfW = width * 0.5;
                       const halfNW = nextWidth * 0.5;
                       const p1x = x + perpX * halfW;
                       const p1y = y + perpY * halfW;
                       const p2x = x - perpX * halfW;
                       const p2y = y - perpY * halfW;
                       const p3x = endX - perpX * halfNW;
                       const p3y = endY - perpY * halfNW;
                       const p4x = endX + perpX * halfNW;
                       const p4y = endY + perpY * halfNW;
                       shape.moveTo(p1x, p1y);
                       shape.lineTo(p4x, p4y);
                       const isTip = (depth <= 1);
                       if (abs.roundedTips && isTip) {
                           shape.absarc(endX, endY, halfNW, angleRad - Math.PI/2, angleRad + Math.PI/2, false);
                       } else {
                           shape.lineTo(p3x, p3y);
                       }
                       shape.lineTo(p2x, p2y);
                       shape.closePath();
                       shapes.push(shape);
                       const rawBranchCount = abs.branchesPerNode || 2;
                       const baseCount = Math.floor(rawBranchCount);
                       const extraProb = rawBranchCount - baseCount;
                       const spread = (abs.branchAngle || 45) * Math.PI / 180;
                       const nextLenBase = length * (decay); 
                       const isAlt = abs.branchPattern === 'alternating';
                       const count = isAlt ? 1 : (baseCount + (rng() < extraProb ? 1 : 0));
                       for(let i=0; i<count; i++) {
                           let da = 0;
                           if (abs.branchPattern === 'random') { da = (rng() - 0.5) * spread * 2; } 
                           else if (isAlt) { const sign = (depth % 2 !== 0) ? 1 : -1; da = sign * spread; } 
                           else { if (count > 1) da = -spread/2 + i * (spread/(count-1)); }
                           if (abs.angleVariation) da += (rng() - 0.5) * (abs.angleVariation * Math.PI);
                           let childLen = nextLenBase;
                           if (abs.lengthVariation) childLen *= (1 + (rng() - 0.5) * abs.lengthVariation);
                           generateBranch(endX, endY, angleRad + da, childLen, nextWidth, depth - 1);
                       }
                   };

                   let startX = abs.innerRadius;
                   let startY = 0;
                   let startDepth = abs.recursionDepth || 4;
                   let currentWidth = abs.thickness;
                   if (effectiveTrunk > 0) {
                       const trunkEnd = startX + effectiveTrunk;
                       const maxRSq = abs.outerRadius > 0 ? abs.outerRadius * abs.outerRadius : Infinity;
                       if (maxRSq === Infinity || (startX*startX <= maxRSq)) {
                           const trunkShape = new THREE_ACTUAL.Shape();
                           trunkShape.moveTo(startX, currentWidth/2);
                           trunkShape.lineTo(trunkEnd, currentWidth/2);
                           trunkShape.lineTo(trunkEnd, -currentWidth/2);
                           trunkShape.lineTo(startX, -currentWidth/2);
                           trunkShape.closePath();
                           shapes.push(trunkShape);
                       }
                       startX = trunkEnd;
                   }
                   const spread = (abs.branchAngle || 45) * Math.PI / 180;
                   const count = (abs.branchPattern === 'alternating') ? 1 : (abs.branchesPerNode || 2);
                   const initLen = effectiveInit; 
                   for(let i=0; i<count; i++) {
                       let da = 0;
                       if (abs.branchPattern === 'random') { da = (rng() - 0.5) * spread; } else if (abs.branchPattern === 'alternating') { da = spread; } else { if (count > 1) da = -spread/2 + i * (spread/(count-1)); }
                       if (abs.angleVariation) da += (rng() - 0.5) * (abs.angleVariation * Math.PI);
                       let len = initLen;
                       if (abs.lengthVariation) len *= (1 + (rng() - 0.5) * abs.lengthVariation);
                       generateBranch(startX, startY, da, len, currentWidth, startDepth);
                   }

                     if (shapes.length > 0) {
                       const fractalGeo = new THREE_ACTUAL.ExtrudeGeometry(shapes, extrudeSettings);
                       // cache the base fractal and mirrored base
                       try {
                       const mirrorBase = fractalGeo.clone();
                       mirrorBase.scale(1, -1, 1);
                       geometryCache.abstracts.set(JSON.stringify({ type: 'fractal', params: abs, extrude: { depth: extrudeSettings.depth, bevelEnabled: extrudeSettings.bevelEnabled, bevelSize: extrudeSettings.bevelSize, bevelSegments: extrudeSettings.bevelSegments, curveSegments: extrudeSettings.curveSegments }, qMult }), { geo: fractalGeo.clone(), mirrorGeo: mirrorBase });
                       } catch (e) {
                       // ignore caching failures
                       }
                       const angleStep = (Math.PI * 2) / abs.arms;
                       for(let i=0; i<abs.arms; i++) {
                         const angle = i * angleStep + (abs.rotationOffset * Math.PI / 180);
                         const absInst = fractalGeo.clone();
                         absInst.translate(0, abs.mirrorOffset/2, centerZOffset);
                         absInst.rotateZ(angle);
                         layerGeometries.push(absInst);
                         if (abs.mirrorEnabled) {
                           const mir = fractalGeo.clone();
                           mir.scale(1, -1, 1); 
                           mir.translate(0, -abs.mirrorOffset/2, centerZOffset);
                           mir.rotateZ(angle);
                           layerGeometries.push(mir);
                         }
                       }
                     }
                   return;
               }

               // Non-fractal
               const shapePoints: THREE_ACTUAL.Vector2[] = [];
               const steps = Math.ceil(200 * qMult);
               // Build cache key for non-fractal abstracts
               const absKey = JSON.stringify({ type: abs.type, params: abs, extrude: { depth: extrudeSettings.depth, bevelEnabled: extrudeSettings.bevelEnabled, bevelSize: extrudeSettings.bevelSize, bevelSegments: extrudeSettings.bevelSegments, curveSegments: extrudeSettings.curveSegments }, qMult });
               if (geometryCache.abstracts.has(absKey)) {
                 const cached = geometryCache.abstracts.get(absKey)!;
                 const angleStep = (Math.PI * 2) / abs.arms;
                 for(let i=0; i<abs.arms; i++) {
                     const angle = i * angleStep + (abs.rotationOffset * Math.PI / 180);
                     const absInst = cached.geo.clone();
                     absInst.translate(0, abs.mirrorOffset/2, centerZOffset);
                     absInst.rotateZ(angle);
                     layerGeometries.push(absInst);
                     if (abs.mirrorEnabled && cached.mirrorGeo) {
                       const mir = cached.mirrorGeo.clone();
                       mir.translate(0, -abs.mirrorOffset/2, centerZOffset);
                       mir.rotateZ(angle);
                       layerGeometries.push(mir);
                     } else if (abs.mirrorEnabled) {
                       const mir = cached.geo.clone();
                       mir.scale(1, -1, 1);
                       mir.translate(0, -abs.mirrorOffset/2, centerZOffset);
                       mir.rotateZ(angle);
                       layerGeometries.push(mir);
                     }
                 }
                 return;
               }
               for(let i=0; i<=steps; i++) {
                   const rCurrent = abs.innerRadius + (i/steps) * (abs.outerRadius - abs.innerRadius);
                   const normX = rCurrent - abs.innerRadius;
                   let yVal = 0;
                   if (abs.type === 'sine') yVal = Math.sin(normX * abs.frequency) * abs.amplitude;
                   else if (abs.type === 'zigzag') {
                       const period = (Math.PI * 2) / abs.frequency;
                       const phase = (normX % period) / period;
                       yVal = (phase < 0.5 ? phase * 4 - 1 : (1 - phase) * 4 - 1) * abs.amplitude;
                   }
                   if (!isNaN(rCurrent) && !isNaN(yVal)) {
                       shapePoints.push(new THREE_ACTUAL.Vector2(rCurrent, yVal));
                   }
               }
               const createAbstractShape = (pts: THREE_ACTUAL.Vector2[]) => {
                   if (pts.length < 2) return new THREE_ACTUAL.Shape();
                   const s = new THREE_ACTUAL.Shape();
                   const halfThick = abs.thickness / 2;
                   pts.forEach((pt, i) => { if (i === 0) s.moveTo(pt.x, pt.y + halfThick); else s.lineTo(pt.x, pt.y + halfThick); });
                   for(let i = pts.length-1; i >= 0; i--) { s.lineTo(pts[i].x, pts[i].y - halfThick); }
                   s.lineTo(pts[0].x, pts[0].y + halfThick);
                   return s;
               };
               const normalShape = createAbstractShape(shapePoints);
               const normalGeo = new THREE_ACTUAL.ExtrudeGeometry(normalShape, extrudeSettings);
               const mirroredPoints = shapePoints.map((pt) => new THREE_ACTUAL.Vector2(pt.x, -pt.y));
               const mirroredShape = createAbstractShape(mirroredPoints);
               const mirroredGeo = new THREE_ACTUAL.ExtrudeGeometry(mirroredShape, extrudeSettings);
               const angleStep = (Math.PI * 2) / abs.arms;
               for(let i=0; i<abs.arms; i++) {
                   const angle = i * angleStep + (abs.rotationOffset * Math.PI / 180);
                   const absInst = normalGeo.clone();
                   absInst.translate(0, abs.mirrorOffset/2, centerZOffset);
                   absInst.rotateZ(angle);
                   layerGeometries.push(absInst);
                   if (abs.mirrorEnabled) {
                       const mir = mirroredGeo.clone();
                       mir.translate(0, -abs.mirrorOffset/2, centerZOffset);
                       mir.rotateZ(angle);
                       layerGeometries.push(mir);
                   }
               }
          });
      };

      await processTextGroup(layer.primary);
      await processTextGroup(layer.secondary);
      processHubs(layer.hubs);
      processAbstracts(layer.abstracts);
      
      await updateProgress();

      if (layerGeometries.length > 0) {
        // Merge without boolean (just combine buffers)
        let layerMerged = BufferGeometryUtils.mergeGeometries(layerGeometries);
        if (layerMerged) {
          // If slots are enabled, we must perform aggressive repair (merging vertices) 
          // to ensure CSG operations (subtraction) work on manifold geometry.
          // However, repairGeometry(..., true) destroys the sharp normals generated by ExtrudeGeometry
          // when edge profile (bevel) is OFF.
          // Therefore, if slots are disabled (just viewing), we SKIP the initial repair to keep
          // the visual quality high (sharp caps, smooth walls).
           // When producing the 3D view we should merge/repair vertices so overlapping
           // geometry fuses correctly. This reduces visual overlaps and prevents
           // floating/non-welded faces in the 3D preview and exports.
           if (rendered3DConfig.slotEnabled || viewMode === '3d') {
             layerMerged = repairGeometry(layerMerged, 0.0001, true) as THREE_ACTUAL.BufferGeometry;
           }

          layerMerged.rotateX(layer.rotation3D.x * Math.PI / 180);
          layerMerged.rotateY(layer.rotation3D.y * Math.PI / 180);
          
          if (rendered3DConfig.slotEnabled) {
            layerMerged = await applySlotCuts(
              layerMerged,
              layer,
              rendered3DConfig.slotLength,
              rendered3DConfig.slotWidth,
              rendered3DConfig.extrusionDepth,
              rendered3DConfig.bevelEnabled,
              bevelPerSide,
              rendered3DConfig.layers,
              async () => { await updateProgress(); }
            );
            // After cuts, we might want to repair again to fix n-gons or loose edges from boolean op
            const postSlotRepair = repairGeometry(layerMerged, 0.0001, true); 
            if (postSlotRepair) layerMerged = postSlotRepair;
            if (lIdx === 0) layerMerged.rotateZ(Math.PI);
          }
          
          // Final clean up logic:
          // If slots are enabled, use the repaired (merged vertices) geometry.
          // If slots are DISABLED, use the pristine geometry from mergeGeometries which preserves normals.
          const finalGeo = rendered3DConfig.slotEnabled 
             ? (repairGeometry(layerMerged, 0.0001, true) || layerMerged)
             : layerMerged;

          const mesh = new THREE_ACTUAL.Mesh(finalGeo);
          mesh.userData.layerId = layer.id;
          mesh.name = layer.name;
          group.add(mesh);
        }
      }
    }
    onProgress(1);
    return group;
  }, [rendered3DConfig, dynamicFonts, loadFont, viewMode]);

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportSTL = async (quality?: DesignQuality) => {
    setExportLoading(true);
    try {
        const group = await generateMesh(() => {}, quality);
        const flatGeoms: THREE_ACTUAL.BufferGeometry[] = [];
        group.traverse((child) => {
            if (child instanceof THREE_ACTUAL.Mesh && child.geometry) {
                const g = child.geometry.clone();
                g.applyMatrix4(child.matrixWorld);
                flatGeoms.push(g);
            }
        });
        
        if (flatGeoms.length > 0) {
            const combinedForCheck = BufferGeometryUtils.mergeGeometries(flatGeoms);
            if (combinedForCheck) {
                const isConnected = checkConnectivity(combinedForCheck);
                if (!isConnected) {
                    const confirmExport = window.confirm(
                        "⚠️ CRITICAL WARNING: Floating Bodies Detected\n\n" +
                        "The generated mesh contains disconnected parts (floating bodies).\n" +
                        "This usually happens when letters or rings don't overlap properly.\n\n" +
                        "This print may fail. Do you still want to export?"
                    );
                    if (!confirmExport) {
                        setExportLoading(false);
                        return;
                    }
                }
            }
        }

        const exporter = new STLExporter();
        const result = exporter.parse(group, { binary: true });
        const blob = new Blob([result], { type: 'application/octet-stream' });
        const qLabel = quality ? `_${quality}` : '';
        downloadBlob(blob, `${config.projectName}${qLabel}.stl`);
        showNotification('STL export completed successfully!', 'success');
    } catch (e) { 
      console.error("Export Failed", e); 
      handleError(e, 'STL Export');
    }
    setExportLoading(false);
  };

  const handleExportLayerSTL = async (layerIndex: number, quality?: DesignQuality) => {
    const layer = config.layers[layerIndex];
    if (!layer) return;
    setExportLoading(true);
    try {
        const group = await generateMesh(() => {}, quality);
        const mesh = group.children.find(c => c instanceof THREE_ACTUAL.Mesh && c.userData.layerId === layer.id) as THREE_ACTUAL.Mesh | undefined;
        if (mesh) {
            if (mesh.geometry) {
                 const isConnected = checkConnectivity(mesh.geometry);
                 if (!isConnected) {
                     if (!window.confirm("Warning: This layer has disconnected parts. Export anyway?")) {
                         setExportLoading(false);
                         return;
                     }
                 }
            }
            const exporter = new STLExporter();
            const result = exporter.parse(mesh, { binary: true });
            const blob = new Blob([result], { type: 'application/octet-stream' });
            const qLabel = quality ? `_${quality}` : '';
            downloadBlob(blob, `${config.projectName}_${layer.name.replace(/\s+/g, '_')}${qLabel}.stl`);
            showNotification(`Exported ${layer.name} successfully!`, 'success');
        }
    } catch(e) { 
      console.error(e); 
      handleError(e, 'Layer STL Export');
    }
    setExportLoading(false);
  };

  const handleExportAllLayersZip = async (quality?: DesignQuality) => {
      setExportLoading(true);
      try {
          const group = await generateMesh(() => {}, quality);
          const zip = new JSZip();
          const exporter = new STLExporter();
          
          let anyFloating = false;
          group.children.forEach(child => {
              if (child instanceof THREE_ACTUAL.Mesh) {
                  const mesh = child as THREE_ACTUAL.Mesh;
                  if (mesh.geometry) {
                       if (!checkConnectivity(mesh.geometry)) anyFloating = true;
                  }
              }
          });

          if (anyFloating) {
              if (!window.confirm("Warning: One or more layers contain disconnected parts. Continue with ZIP export?")) {
                  setExportLoading(false);
                  return;
              }
          }
          
          group.children.forEach(child => {
              if (child instanceof THREE_ACTUAL.Mesh) {
                  const result = exporter.parse(child, { binary: true });
                  const data = result instanceof DataView ? result.buffer : result;
                  const qLabel = quality ? `_${quality}` : '';
                  zip.file(`${config.projectName}_${child.name.replace(/\s+/g, '_')}${qLabel}.stl`, data);
              }
          });
          
          const content = await zip.generateAsync({ type: 'blob' });
          const qLabel = quality ? `_${quality}` : '';
          downloadBlob(content, `${config.projectName}_All_Planes${qLabel}.zip`);
          showNotification('ZIP export completed successfully!', 'success');
      } catch(e) { 
        console.error(e); 
        handleError(e, 'ZIP Export');
      }
      setExportLoading(false);
  };

  const handleExport2D = async (layerIndex: number, format: 'svg' | 'dxf') => {
    setExportLoading(true);
    try {
      const layer = config.layers[layerIndex];
      if (!layer) return;

      const fonts: Record<string, opentype.Font> = {};
      const loadFont = async (family: string) => {
        const name = family.replace(/'/g, '').split(',')[0].trim();
        if (fonts[name]) return fonts[name];
        return new Promise<opentype.Font | null>(r => {
           opentype.load(dynamicFonts[name] || FONT_TTF_URLS[name], (e, f) => {
              if (f) fonts[name] = f;
              r(f || null);
           });
        });
      };
      if (layer.primary.enabled) await loadFont(layer.primary.fontFamily);
      if (layer.secondary.enabled) await loadFont(layer.secondary.fontFamily);

      let svgContent = '';
      let dxfEntities = '';
      
      const getPointsFromCommands = (commands: opentype.PathCommand[]): {x:number, y:number}[] => {
          const points: {x:number, y:number}[] = [];
          let currentX = 0; 
          let currentY = 0;
          
          commands.forEach(cmd => {
              if (cmd.type === 'M') {
                  currentX = cmd.x; currentY = cmd.y;
                  points.push({x: currentX, y: currentY});
              } else if (cmd.type === 'L') {
                  currentX = cmd.x; currentY = cmd.y;
                  points.push({x: currentX, y: currentY});
              } else if (cmd.type === 'Q') {
                  const steps = 10;
                  for (let t = 1; t <= steps; t++) {
                      const tt = t / steps;
                      const u = 1 - tt;
                      const x = u * u * currentX + 2 * u * tt * cmd.x1 + tt * tt * cmd.x;
                      const y = u * u * currentY + 2 * u * tt * cmd.y1 + tt * tt * cmd.y;
                      points.push({x, y});
                  }
                  currentX = cmd.x; currentY = cmd.y;
              } else if (cmd.type === 'C') {
                  const steps = 10;
                  for (let t = 1; t <= steps; t++) {
                      const tt = t / steps;
                      const u = 1 - tt;
                      const x = u*u*u*currentX + 3*u*u*tt*cmd.x1 + 3*u*tt*tt*cmd.x2 + tt*tt*tt*cmd.x;
                      const y = u*u*u*currentY + 3*u*u*tt*cmd.y1 + 3*u*tt*tt*cmd.y2 + tt*tt*tt*cmd.y;
                      points.push({x, y});
                  }
                  currentX = cmd.x; currentY = cmd.y;
              }
          });
          return points;
      };

      const addPathSVG = (d: string, transform: string) => {
         svgContent += `<path d="${d}" fill="none" stroke="black" stroke-width="1" transform="${transform}" />`;
      };

      const addPolyDXF = (pts: {x:number,y:number}[], transform: {x:number, y:number, rotation:number, scaleX:number, scaleY:number}) => {
          if (pts.length < 2) return;
          dxfEntities += "0\nLWPOLYLINE\n8\n0\n"; 
          dxfEntities += `90\n${pts.length}\n`; 
          dxfEntities += "70\n1\n"; 
          
          const rad = transform.rotation * Math.PI / 180;
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);

          pts.forEach(p => {
              const sx = p.x * transform.scaleX;
              const sy = p.y * transform.scaleY;
              const rx = sx * cos - sy * sin;
              const ry = sx * sin + sy * cos;
              const finalX = rx + transform.x;
              const finalY = ry + transform.y;
              dxfEntities += `10\n${finalX.toFixed(4)}\n20\n${finalY.toFixed(4)}\n`;
          });
          dxfEntities += "0\n";
      };

      const getGroupPath = (group: TextGroupConfig) => {
         if (!group.enabled) return { d: '', commands: [] as opentype.PathCommand[] };
         const font = fonts[group.fontFamily.replace(/'/g, '').split(',')[0].trim()];
         if (!font) return { d: '', commands: [] };
         let d = '';
         const allCommands: opentype.PathCommand[] = [];
         const scale = group.fontSize / font.unitsPerEm;
         const glyphs = font.stringToGlyphs(group.text);
         let currentX = 0;
         glyphs.forEach((glyph, i) => {
            const offset = group.charOffsets[i] || { x:0, y:0 };
            const path = glyph.getPath(currentX + offset.x, offset.y, group.fontSize);
            d += path.toPathData(2) + ' ';
            allCommands.push(...path.commands);
            currentX += (glyph.advanceWidth * scale) + group.letterSpacing;
         });
         return { d, commands: allCommands };
      };

      const processGroup = (group: TextGroupConfig) => {
         const { d, commands } = getGroupPath(group);
         const points = format === 'dxf' ? getPointsFromCommands(commands) : [];
         const angleStep = 360 / group.arms;
         for (let i = 0; i < group.arms; i++) {
             const angle = i * angleStep + group.rotationOffset;
             if (format === 'svg') {
                 addPathSVG(d, `rotate(${angle}) translate(${group.textX}, ${group.mirrorOffset/2}) scale(1, -1)`);
                 if (group.mirrorEnabled) {
                     addPathSVG(d, `rotate(${angle}) translate(${group.textX}, ${-group.mirrorOffset/2}) scale(1, 1)`);
                 }
             } else {
                 addPolyDXF(points, { x: group.textX, y: group.mirrorOffset/2, rotation: angle, scaleX: 1, scaleY: -1 });
                 if (group.mirrorEnabled) {
                     addPolyDXF(points, { x: group.textX, y: -group.mirrorOffset/2, rotation: angle, scaleX: 1, scaleY: 1 });
                 }
             }
         }
      };

      processGroup(layer.primary);
      if (layer.secondaryEnabled) processGroup(layer.secondary);

      if (format === 'svg') {
         const finalSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-250 -250 500 500" width="500mm" height="500mm"><g transform="scale(1, -1)">${svgContent}</g></svg>`;
         const blob = new Blob([finalSvg], { type: 'image/svg+xml' });
         downloadBlob(blob, `${config.projectName}_${layer.name}.svg`);
      } 
      else if (format === 'dxf') {
          let dxf = `0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${dxfEntities}0\nENDSEC\n0\nEOF\n`;
          const blob = new Blob([dxf], { type: 'application/dxf' });
          downloadBlob(blob, `${config.projectName}_${layer.name}.dxf`);
      }

      showNotification(`2D ${format.toUpperCase()} export completed!`, 'success');
    } catch (e) { 
      console.error(e); 
      handleError(e, '2D Export');
    }
    setExportLoading(false);
  };

  const handleSaveProject = () => {
    try {
      const json = JSON.stringify(config, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      downloadBlob(blob, `${config.projectName}.json`);
      showNotification('Project saved successfully!', 'success');
    } catch (error) {
      handleError(error, 'Save Project');
    }
  };

  const handleLoadProject = () => {
    fileInputRef.current?.click();
  };

  const handleFileLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const loaded = JSON.parse(event.target?.result as string);
        setConfig(loaded);
        setConfig3D(loaded);
        setRendered3DIfChanged(loaded);
        setHistory([loaded]);
        setHistoryIndex(0);
        showNotification('Project loaded successfully!', 'success');
      } catch (err) {
        console.error(err);
        alert("Failed to load project file.");
        handleError(err, 'Load Project');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleFetchFont = async (name: string) => {
    return true; 
  };

  const handleFontUpload = (file: File) => {
    const url = URL.createObjectURL(file);
    const name = file.name.replace(/\.[^/.]+$/, "");
    setDynamicFonts(prev => ({ ...prev, [name]: url }));
    loadFont(name, url);
  };

  const handleAiPolish = async (mode: '3d' | '2d' | 'fractal', reset: boolean = false) => {
  if (!process.env.API_KEY) {
    showNotification("API Key is missing. Please check your environment configuration.", "error");
    return;
  }

  setAiLoading(true);
  setAiProgress(0);
  
  const progressInterval = setInterval(() => {
      setAiProgress(prev => {
          if (prev >= 90) return 90;
          return prev + Math.floor(Math.random() * 5) + 1;
      });
  }, 100);

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const model = 'gemini-3-flash-preview';
    
    const availableFonts = CURSIVE_FONTS.map(f => f.name).join(', ');
    
    let configContext = config;

    // Handle Reset: Clear to clean state but preserve layer structure
    if (reset) {
        const resetLayer1 = createDefaultLayer('layer-1', 'Base Plane', 0, 0, true);
        resetLayer1.slotType = 'half-back';
        
        const resetLayer2 = createDefaultLayer('layer-2', 'Cross Plane', 120, 0, false);
        resetLayer2.slotType = 'half-front';
        
        const resetLayer3 = createDefaultLayer('layer-4', 'Tilt Plane', 240, 0, false);
        resetLayer3.slotType = 'custom';

        // FOR FRACTAL MODE: Clear everything and prepare fractal-only config
        if (mode === 'fractal') {
            resetLayer1.primary.enabled = false;
            resetLayer1.primary.text = "";
            resetLayer1.secondary.enabled = false;
            resetLayer1.hubs = [];
            resetLayer1.abstracts = []; // Will be populated by AI
        } else {
            resetLayer1.primary.text = "";
        }
        
        const cleanConfig: SnowflakeConfig = {
            ...initialState,
            projectName: config.projectName,
            color: config.color,
            activeLayerIndex: 0,
            layers: [resetLayer1, resetLayer2, resetLayer3],
            syncAllLayers: true
        };
        
        setConfig(cleanConfig);
        setConfig3D(cleanConfig);
        setRendered3DIfChanged(cleanConfig);
        
        configContext = cleanConfig;
    }
    
    const currentText = configContext.layers[0]?.primary?.text || "";
    const hasText = currentText.trim().length > 0;

    const prompt = `
      Generate a randomized Snowflake Generator Configuration (JSON).
      
      **CRITICAL CONSTRAINTS:**
      1. **Only define the design for the FIRST layer (Base Plane).**
      2. The design will be automatically applied to the other 2 planes by the app.
      3. Set 'activeLayerIndex' to 0.
      ${mode !== 'fractal' ? `4. Use a random cursive font from this list: [${availableFonts}].` : ''}
      
      ${mode === 'fractal' ? `
      **MODE: TRADITIONAL FRACTAL SNOWFLAKE**
      
      **CRITICAL RULES FOR FRACTALS:**
      1. **DISABLE ALL TEXT**: Set both 'primary.enabled' = false AND 'secondary.enabled' = false
      2. **DISABLE ALL HUBS**: Set 'hubs' to empty array []
      3. **ENABLE ONLY FRACTALS**: Create 1-3 'abstracts' with type='fractal'
      4. **Use 6 arms** for traditional snowflake symmetry
      5. **Set mirrorEnabled: true** to create symmetric branches
      
      **REQUIRED Fractal Schema:**
      Each fractal abstract MUST have these exact fields with SAFE values:
      {
        "id": "unique-id",
        "enabled": true,
        "type": "fractal",
        "arms": 6,
        "rotationOffset": 0,
        "innerRadius": 0,
        "outerRadius": 150,
        "amplitude": 0,
        "frequency": 0,
        "thickness": 2.5,
        "mirrorEnabled": true,
        "mirrorOffset": 0,
        "trunkLength": 0,
        "branchesPerNode": 2.0,
        "recursionDepth": 4,
        "minBranchLength": 3,
        "branchPattern": "symmetric",
        "branchAngle": 45,
        "initialLength": 40,
        "lengthDecay": 0.75,
        "randomSeed": <random integer 1000-9999>,
        "angleVariation": 0.1,
        "lengthVariation": 0.15,
        "thicknessDecay": 0.75,
        "roundedTips": true
      }
      ` : `
      **TEXT CONTENT:**
      ${hasText 
          ? `The user has provided the text "${currentText}". YOU MUST USE THIS TEXT EXACTLY. Do not change the word.` 
          : `Choose a random winter word like 'Snow', 'Ice', 'Frost', 'Cold', 'Joy'.`
      }
      
      **VISIBILITY RULES:**
      - **Hubs:** If enabled, 'outerRadius' MUST be > 5mm and 'wallThickness' > 1mm. 
      - **Abstracts:** If enabled, 'outerRadius' MUST be significantly larger than 'innerRadius' (min 10mm gap) so they are visible. 'thickness' > 1mm.
      - **Disable Invisible:** If an element is too small or hidden behind text, set 'enabled: false'. Do not generate invisible geometry.
      
      **MODE: ${mode === '3d' ? '3D PRINTING OPTIMIZED' : '2D / LASER AESTHETIC'}**
      
      ${mode === '3d' ? `
      - **Goal:** Create a single, contiguous solid object. NO floating bodies.
      - **Text Connectivity (CRITICAL):**
        - Set 'letterSpacing' to a negative value (between -1.5 and -3.0) to force cursive letters to overlap and fuse.
        - Set 'thickness' (Stroke Weight) to >= 2.0mm to prevent thin, breakable parts.
      - **Hub Anchoring (CRITICAL):**
        - Enable a central 'hub'.
        - Set 'textX' (Inner Radius) to be LESS THAN the hub's 'outerRadius' (e.g., if Hub Radius is 25mm, set textX to 20mm). The text MUST penetrate the hub to fuse.
      ` : `
      - **Goal:** Visually striking, intricate design.
      - **Structure:**
        - Floating parts are allowed.
        - Can use thinner lines and more delicate details.
      `}
      `}
      
      Return **ONLY** valid JSON matching the 'SnowflakeConfig' schema.
    `;

    const response = await ai.models.generateContent({
      model,
      contents: [
          { role: 'user', parts: [{ text: prompt }] },
          { role: 'user', parts: [{ text: JSON.stringify(configContext) }] }
      ],
      config: {
          responseMimeType: 'application/json'
      }
    });

    const responseText = response.text;
    if (responseText) {
        const newConfig = JSON.parse(responseText);
        const generatedLayer = newConfig.layers[0];
        
        // Merge generated design into current state PRESERVING LAYERS
        const currentLayers = [...configContext.layers];
        
        // Update Layer 0 with generated design
        currentLayers[0] = {
            ...currentLayers[0],
            primary: { ...currentLayers[0].primary, ...generatedLayer.primary },
            secondary: { ...currentLayers[0].secondary, ...generatedLayer.secondary },
            hubs: generatedLayer.hubs || [],
            abstracts: generatedLayer.abstracts || []
        };
        
        // Handle Fractal specific: Force disable text/hubs if mode is fractal
        if (mode === 'fractal') {
            currentLayers[0].primary.enabled = false;
            currentLayers[0].secondary.enabled = false;
            currentLayers[0].hubs = [];
        }

        // Propagate to other layers (Sync)
        for (let i = 1; i < currentLayers.length; i++) {
            currentLayers[i] = {
                ...currentLayers[i],
                primary: JSON.parse(JSON.stringify(currentLayers[0].primary)),
                secondary: JSON.parse(JSON.stringify(currentLayers[0].secondary)),
                hubs: JSON.parse(JSON.stringify(currentLayers[0].hubs)),
                abstracts: JSON.parse(JSON.stringify(currentLayers[0].abstracts)),
            };
            // Preserve basic transform/slot properties of the target layer
            // (Assuming rotation3D and slotType are managed by layer setup, not design gen)
        }
        
        const finalConfig = {
            ...configContext,
            layers: currentLayers,
            activeLayerIndex: 0,
            syncAllLayers: true
        };

        setAiProgress(100);
        handleUpdateConfig(finalConfig, true);
        setRendered3DIfChanged(finalConfig);
        const modeLabel = mode === 'fractal' ? 'Fractal' : (mode === '3d' ? '3D' : '2D');
        showNotification(`Generated random ${modeLabel} design!`, "success");
    }

  } catch (err) {
    console.error("AI Randomizer error:", err);
    handleError(err, "AI Randomizer");
    showNotification("AI generation failed. Please try again.", "error");
  } finally {
    clearInterval(progressInterval);
    setTimeout(() => {
        setAiLoading(false);
        setAiProgress(0);
    }, 500);
  }
};

  useKeyboardShortcuts(shortcuts, {
    undo,
    redo,
    toggleView: () => setViewMode(v => v === '2d' ? '3d' : '2d'),
    exportCombinedSTL: () => handleExportSTL(),
    exportBasePlaneSTL: () => handleExportLayerSTL(0),
    exportCrossPlaneSTL: () => handleExportLayerSTL(1),
    exportTiltPlaneSTL: () => handleExportLayerSTL(2),
    saveProject: handleSaveProject,
    loadProject: handleLoadProject,
    switchToGlobalTab: () => setActiveTab('global'),
    switchToTextTab: () => setActiveTab('text'),
    switchToLetterCtrlTab: () => setActiveTab('Letter Ctrl'),
    switchToHubsTab: () => setActiveTab('hubs'),
    switchToAbstractTab: () => setActiveTab('abstract'),
    switchToPlanesTab: () => setActiveTab('planes'),
    forceUpdate3D: () => {
        setRendered3DIfChanged(config);
        showNotification("3D Model Updated", "info", 1000);
    }
  });

  return (
        <div className="flex flex-col h-screen bg-slate-950 text-white overflow-hidden font-sans selection:bg-sky-500/30">
            {/* Header */}
            <div className="h-14 border-b border-white/10 bg-slate-900/50 backdrop-blur-md shrink-0 z-50 relative">
                <div className="h-full max-w-[1920px] mx-auto px-4 flex items-center justify-center">
                    <div className="w-full">
                        <Header 
                            projectName={config.projectName} 
                            onProjectNameChange={(n) => handleUpdateConfig({ projectName: n })}
                            onSaveConfig={handleSaveProject}
                            onLoadConfig={handleLoadProject}
                            shortcuts={shortcuts}
                            onUpdateShortcuts={(s) => setShortcuts(s)}
                            onResetShortcuts={() => setShortcuts(DEFAULT_SHORTCUTS)}
                        />
                    </div>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Control Panel */}
                <div className="w-[420px] flex flex-col border-r border-white/10 bg-slate-900/30 backdrop-blur-sm shrink-0 z-40">
                    <ControlPanel 
                        config={config} 
                        onUpdate={handleUpdateConfig}
                        updateGroup={updateGroup}
                        updateCharOffset={updateCharOffset}
                        updateHubs={updateHubs}
                        updateAbstracts={updateAbstracts}
                        onAiPolish={handleAiPolish}
                        aiLoading={aiLoading}
                        aiProgress={aiProgress}
                        onExportSTL={handleExportSTL}
                        onExportLayerSTL={handleExportLayerSTL}
                        onExportAllLayersZip={handleExportAllLayersZip}
                        onExport2D={handleExport2D}
                        exportLoading={exportLoading}
                        onFetchFont={handleFetchFont}
                        onFontUpload={handleFontUpload}
                        dynamicFonts={dynamicFonts}
                        onAutoConfigureSlots={() => handleUpdateConfig({ layers: calculateOptimalSlots(config.layers), slotEnabled: true }, true)}
                        undo={undo}
                        redo={redo}
                        canUndo={canUndo}
                        canRedo={canRedo}
                        shortcuts={shortcuts}
                        activeTab={activeTab}
                        onTabChange={setActiveTab}
                    />
                </div>

                {/* Preview Area */}
                <div className="flex-1 relative bg-slate-950 overflow-hidden">
                    <div className={`absolute inset-0 w-full h-full transition-opacity duration-300 ${viewMode === '2d' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
                        <SnowflakePreview 
                            config={config} 
                            globalColor={config.color} 
                            globalBevel={config.bevelEnabled} 
                            globalBevelAmount={config.bevelAmount}
                            globalThickness={config.extrusionDepth}
                            slotEnabled={config.slotEnabled}
                            slotLength={config.slotLength}
                            slotWidth={config.slotWidth}
                            svgRef={svgRef}
                            dynamicFonts={dynamicFonts}
                            undo={undo}
                            redo={redo}
                            canUndo={canUndo}
                            canRedo={canRedo}
                            calculatedDiameter={designDiameter} // PASS CALCULATED DIAMETER
                            shortcuts={shortcuts}
                        />
                    </div>
                    <div className={`absolute inset-0 w-full h-full transition-opacity duration-300 ${viewMode === '3d' ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}>
                        <Snowflake3D 
                            config={rendered3DConfig} 
                            generateMesh={generateMesh} 
                            color={config.color} 
                            undo={undo} 
                            redo={redo} 
                            canUndo={canUndo} 
                            canRedo={canRedo}
                            initialDiameter={designDiameter} // PASS INITIAL DIAMETER
                            shortcuts={shortcuts}
                            isVisible={viewMode === '3d'}
                        />
                    </div>
                    
                    {/* View Toggle */}
                    <div className="absolute top-4 right-4 z-50 flex bg-slate-900/80 rounded-lg p-1 border border-white/10 shadow-lg backdrop-blur">
                        <button 
                            onClick={() => setViewMode('2d')} 
                            className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase transition-all ${viewMode === '2d' ? 'bg-sky-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                        >
                            2D Preview
                        </button>
                        <button 
                            onClick={() => {
                              setRendered3DIfChanged(config);
                              setViewMode('3d');
                            }} 
                            className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase transition-all ${viewMode === '3d' ? 'bg-sky-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                        >
                            3D Model
                        </button>
                    </div>
                </div>
            </div>

            {/* Hidden Input for File Load */}
            <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileLoad} 
                accept=".json" 
                className="hidden" 
            />
            
            {/* Notifications */}
            <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
                {notifications.map(n => (
                    <div key={n.id} className={`pointer-events-auto px-4 py-3 rounded-lg shadow-xl border text-xs font-bold text-white animate-in slide-in-from-right duration-300 ${n.type === 'error' ? 'bg-rose-600 border-rose-500' : (n.type === 'success' ? 'bg-emerald-600 border-emerald-500' : 'bg-slate-800 border-white/10')}`}>
                        {n.message}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default App;
