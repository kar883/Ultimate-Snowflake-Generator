import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { SnowflakeConfig, TextGroupConfig, HubConfig, CharOffset, LayerConfig, AbstractConfig, DesignQuality, UnderlineConfig, ShortcutConfig, ImageConfig, createDefaultImage } from './types';
import { CURSIVE_FONTS, FONT_TTF_URLS, BOLD_FONT_URLS, BOLD_FONT_THRESHOLD } from './constants';
import { useFontPreloader } from './utils/fontPreloader';
import ControlPanel from './components/ControlPanel';
import SnowflakePreview from './components/SnowflakePreview';
import Snowflake3D from './components/Snowflake3D';
import Header from './components/Header';
import ShortcutsModal from './components/ShortcutsModal';
import UpdateNotification from './components/UpdateNotification';
import * as THREE_ACTUAL from 'three';
import { STLExporter } from './stlExporter';
// import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils';
import opentype from 'opentype.js';
import JSZip from 'jszip';
import { GoogleGenAI } from "@google/genai";
import { getApiKey, loadAiScope, type AiScopeConfig } from './components/ShortcutsModal';
import { surgicalSlotRepair, getTopologyReport } from './surgicalSlotRepair';
import { type SlotProfile2D } from './manifoldCSG';
import { fillSlotHoles } from './slotHoleFiller';
import { postCSGJob } from './csgWorkerManager';
// @ts-ignore
// import { fillHolesManifold } from './holeFillingRepair'; // Temporarily commented
import { geometryCache, makeTextKey, makeHubKey, makeAbstractKey, /*makeSlotKey,*/ getOrCreateGeometry, clearGeometryCache, modelCache3D, hashConfig, /*slotCutCache,*/ makeUnderlineKey } from './geometryCache';

const MAX_HISTORY = 50;

const DEFAULT_SHORTCUTS: ShortcutConfig = {
    undo: { key: 'z', ctrlKey: true },
    redo: { key: 'z', ctrlKey: true, shiftKey: true },
    toggleView: { key: '1', ctrlKey: true },
    forceRegenerate: { key: 'r', ctrlKey: true },
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
    resetApp: { key: 'r', ctrlKey: true, shiftKey: true },
};

const useFontCache = (getPreloadedFont?: (fontName: string) => opentype.Font | null, isPreloadedFont?: (fontName: string) => boolean) => {
  const fontCache = useRef<Record<string, opentype.Font>>({});

  const loadFont = useCallback(async (fontName: string, url: string) => {
    // First check if font is already in our cache
    if (fontCache.current[fontName]) {
      return fontCache.current[fontName];
    }

    // Check if font is preloaded
    if (getPreloadedFont && isPreloadedFont) {
      const preloadedFont = getPreloadedFont(fontName);
      if (preloadedFont && isPreloadedFont(fontName)) {
        fontCache.current[fontName] = preloadedFont;
        return preloadedFont;
      }
    }

    // If not preloaded, load it normally
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
  }, [getPreloadedFont, isPreloadedFont]);

  return { loadFont, fontCache: fontCache.current };
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

// ============================================================================
// 2D BOLDNESS FUNCTIONS USING CAVALIER CONTOURS
// ============================================================================

/**
 * Convert Polyline back to THREE.Vector2 array
 */
// function polylineToPoints(polyline: Polyline): THREE_ACTUAL.Vector2[] {
// }

/**
 * Simple path offset by expanding shapes outward
 * Uses a vertex-normal approach for reliable results
 */
function offsetShape(shape: THREE_ACTUAL.Shape, offset: number): THREE_ACTUAL.Shape {
  // Simple approach: scale the shape outward to simulate boldness
  // This is much faster than complex path offsetting
  const points = shape.getPoints(16); // Use fewer points for performance
  if (points.length < 3) {
    return shape;
  }

  // Calculate center point
  let centerX = 0, centerY = 0;
  for (const point of points) {
    centerX += point.x;
    centerY += point.y;
  }
  centerX /= points.length;
  centerY /= points.length;

  // Scale outward from center to simulate offset
  const scale = 1 + (offset / 10); // Adjust scaling factor as needed
  const scaledPoints = points.map(p => ({
    x: centerX + (p.x - centerX) * scale,
    y: centerY + (p.y - centerY) * scale
  }));

  const offsetShape = new THREE_ACTUAL.Shape();
  offsetShape.moveTo(scaledPoints[0].x, scaledPoints[0].y);
  for (let i = 1; i < scaledPoints.length; i++) {
    offsetShape.lineTo(scaledPoints[i].x, scaledPoints[i].y);
  }
  offsetShape.closePath();

  return offsetShape;
}

/**
 * Apply boldness to shapes using simple path offset
 * This mimics SVG stroke behavior: expands outward by strokeWidth/2
 */
function applyBoldnessToShapes(
  shapes: THREE_ACTUAL.Shape[],
  strokeWidth: number
): THREE_ACTUAL.Shape[] {
  if (strokeWidth <= 0.1) {
    return shapes;
  }

  // PROPER BOLDNESS - Preserves Holes and Handles Self-Intersections
  const expandedShapes: THREE_ACTUAL.Shape[] = [];

  for (const shape of shapes) {
    try {
      // Extract the main contour and holes separately
      const extractedPoints = shape.extractPoints(48);

      // Offset the outer shape OUTWARD
      const outerPoints = extractedPoints.shape;
      const expandedOuter = offsetPathWithValidation(outerPoints, strokeWidth / 2, false);

      // Offset the holes INWARD (so they get smaller, preserving the loop)
      const contractedHoles: THREE_ACTUAL.Vector2[][] = [];
      if (extractedPoints.holes && extractedPoints.holes.length > 0) {
        for (const hole of extractedPoints.holes) {
          // Negative offset to shrink the hole
          const contractedHole = offsetPathWithValidation(hole, -strokeWidth / 2, true);
          if (contractedHole && contractedHole.length > 2) {
            contractedHoles.push(contractedHole);
          }
        }
      }

      // Create new shape with expanded outer and contracted holes
      if (expandedOuter && expandedOuter.length > 2) {
        const newShape = new THREE_ACTUAL.Shape(expandedOuter);

        // Add holes back
        for (const holePoints of contractedHoles) {
          const holePath = new THREE_ACTUAL.Path(holePoints);
          newShape.holes.push(holePath);
        }

        expandedShapes.push(newShape);
      }
    } catch (error) {
      console.warn('Failed to expand shape with holes, using original:', error);
      expandedShapes.push(shape);
    }
  }

  if (expandedShapes.length > 0) {
    console.log(`✅ Applied ${strokeWidth}px boldness to ${expandedShapes.length} shapes`);
    return expandedShapes;
  }

  return shapes;
}

/**
 * Helper function to offset a path with validation and cleanup
 * Returns null if offset creates invalid geometry
 */
function offsetPathWithValidation(
  points: THREE_ACTUAL.Vector2[],
  offsetDist: number,
  isHole: boolean
): THREE_ACTUAL.Vector2[] | null {

  if (points.length < 3) return null;

  const offsetPoints: THREE_ACTUAL.Vector2[] = [];
  const len = points.length;

  for (let i = 0; i < len; i++) {
    const curr = points[i];
    const prev = points[(i - 1 + len) % len];
    const next = points[(i + 1) % len];

    // Calculate tangents
    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;

    const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1) || 1;
    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 1;

    // Perpendicular vectors
    const n1x = -dy1 / len1;
    const n1y = dx1 / len1;
    const n2x = -dy2 / len2;
    const n2y = dx2 / len2;

    // Average normal
    let avgNx = (n1x + n2x) / 2;
    let avgNy = (n1y + n2y) / 2;

    const avgLen = Math.sqrt(avgNx * avgNx + avgNy * avgNy);

    // Detect degenerate cases
    if (avgLen < 0.001) {
      // Sharp corner or cusp - use perpendicular to incoming edge
      avgNx = n1x;
      avgNy = n1y;
    } else {
      avgNx /= avgLen;
      avgNy /= avgLen;
    }

    // Calculate the angle between consecutive edges
    const dot = (dx1 * dx2 + dy1 * dy2) / (len1 * len2);
    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));

    // Apply miter limit for sharp corners
    let actualOffset = offsetDist;
    if (angle < Math.PI / 6) { // Less than 30 degrees
      // Limit miter extension on sharp corners
      const miterLimit = 2.0;
      const miterLength = Math.abs(offsetDist / Math.sin(angle / 2));
      if (miterLength > Math.abs(offsetDist) * miterLimit) {
        actualOffset = offsetDist * miterLimit * Math.sin(angle / 2);
      }
    }

    offsetPoints.push(new THREE_ACTUAL.Vector2(
      curr.x + avgNx * actualOffset,
      curr.y + avgNy * actualOffset
    ));
  }

  // Validate the result - check if area is positive (for outer) or negative (for holes)
  const area = calculateSignedArea(offsetPoints);

  // If hole is contracting too much and becomes invalid, return null
  if (isHole && Math.abs(area) < 1.0) {
    return null; // Hole collapsed
  }

  // Ensure correct winding order
  if (!isHole && area < 0) {
    offsetPoints.reverse();
  } else if (isHole && area > 0) {
    offsetPoints.reverse();
  }

  return offsetPoints;
}

/**
 * Calculate signed area of a polygon (for winding order detection)
 */
function calculateSignedArea(points: THREE_ACTUAL.Vector2[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return area / 2;
}

/**
 * Simple closed path offset - works for outer boundaries
 */
function offsetClosedPath(
  points: THREE_ACTUAL.Vector2[],
  distance: number
): THREE_ACTUAL.Vector2[] | null {

  if (points.length < 3) return null;

  const result: THREE_ACTUAL.Vector2[] = [];
  const n = points.length;

  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];

    const e1x = p1.x - p0.x;
    const e1y = p1.y - p0.y;
    const e2x = p2.x - p1.x;
    const e2y = p2.y - p1.y;

    const e1len = Math.sqrt(e1x * e1x + e1y * e1y) || 0.001;
    const e2len = Math.sqrt(e2x * e2x + e2y * e2y) || 0.001;

    const n1x = -e1y / e1len;
    const n1y = e1x / e1len;
    const n2x = -e2y / e2len;
    const n2y = e2x / e2len;

    let bisX = n1x + n2x;
    let bisY = n1y + n2y;
    const bisLen = Math.sqrt(bisX * bisX + bisY * bisY) || 0.001;
    bisX /= bisLen;
    bisY /= bisLen;

    result.push(new THREE_ACTUAL.Vector2(
      p1.x + bisX * distance,
      p1.y + bisY * distance
    ));
  }

  return result;
}

// Efficient deep comparison for config objects
const deepEqual = (a: any, b: any): boolean => {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;

  if (typeof a !== 'object') return a === b;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!keysB.includes(key)) return false;
    if (!deepEqual(a[key], b[key])) return false;
  }
  return true;
};

// Efficient structured clone for history — native structuredClone is 10-50× faster
// than the old recursive implementation for large config objects.
const deepClone = (obj: any): any => structuredClone(obj);

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
    const idx = geometry.index;
    if (!pos || !idx) return geometry;

    const positions = pos.array as Float32Array;
    const indices = idx.array as Uint32Array;
    const newIndices: number[] = [];

    for (let i = 0; i < indices.length; i += 3) {
        const i0 = indices[i] * 3;
        const i1 = indices[i + 1] * 3;
        const i2 = indices[i + 2] * 3;

        const v0 = new THREE_ACTUAL.Vector3(positions[i0], positions[i0 + 1], positions[i0 + 2]);
        const v1 = new THREE_ACTUAL.Vector3(positions[i1], positions[i1 + 1], positions[i1 + 2]);
        const v2 = new THREE_ACTUAL.Vector3(positions[i2], positions[i2 + 1], positions[i2 + 2]);

        if (!v0.equals(v1) && !v1.equals(v2) && !v0.equals(v2)) {
            newIndices.push(indices[i], indices[i + 1], indices[i + 2]);
        }
    }

    geometry.setIndex(newIndices);
    return geometry;
};

const checkConnectivity = (geometry: THREE_ACTUAL.BufferGeometry): boolean => {
    const pos = geometry.attributes.position;
    const idx = geometry.index;
    if (!pos || !idx) return false;

    const vertexCount = pos.count;
    const visited = new Array(vertexCount).fill(0);
    const adjacency: number[][] = Array(vertexCount).fill(null).map(() => []);

    // Build adjacency list
    for (let i = 0; i < idx.count; i += 3) {
        const v0 = idx.getX(i);
        const v1 = idx.getX(i + 1);
        const v2 = idx.getX(i + 2);

        adjacency[v0].push(v1, v2);
        adjacency[v1].push(v0, v2);
        adjacency[v2].push(v0, v1);
    }

    // BFS from first vertex
    const queue = [0];
    visited[0] = 1;
    let visitedCount = 1;

    while (queue.length > 0) {
        const current = queue.shift()!;
        for (const neighbor of adjacency[current]) {
            if (visited[neighbor] === 0) {
                visited[neighbor] = 1;
                visitedCount++;
                queue.push(neighbor);
            }
        }
    }

    return visitedCount === vertexCount;
};

const seededRandom = (seed: number) => {
  let value = seed;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
};

const getSlotPlanePreset = (
  enabledLayers: LayerConfig[],
  index: number,
  slotMode: SnowflakeConfig['slotMode']
) => {
  if (slotMode === '2-plane') {
    if (enabledLayers.length < 2) return null;
    return index === 0
      ? { rotationX: 0, slotType: 'half-back' as const }
      : { rotationX: 90, slotType: 'half-front' as const };
  }

  if (enabledLayers.length < 3) return null;
  if (index === 0) return { rotationX: 0, slotType: 'third-back' as const };
  if (index === 1) return { rotationX: 120, slotType: 'third-middle' as const };
  if (index === 2) return { rotationX: 240, slotType: 'third-front' as const };
  return null;
};

const createSlotProfilesForLayer = (
  layer: LayerConfig,
  layerIndex: number,
  enabledLayers: LayerConfig[],
  config: SnowflakeConfig,
  materialThickness: number
): SlotProfile2D[] => {
  if (!config.slotEnabled) return [];
  if (config.slotMode === '2-plane' && enabledLayers.length < 2) return [];
  if (config.slotMode === '3-plane' && enabledLayers.length < 3) return [];

  const slots: SlotProfile2D[] = [];
  const modelDiameter = 190;
  const drawLength = Math.max(config.slotLength + (layer.slotLengthAdjustment ?? 0), (modelDiameter / 2) + 20);
  const slotLength = Math.max(2, config.slotLength + (layer.slotLengthAdjustment ?? 0));
  const tipInStart = Math.max(0, slotLength * 0.75);
  const tipInLength = Math.max(0.01, drawLength - tipInStart);
  const widthAdjustment = layer.slotWidthOffset ?? 0;
  const requestedWidth = Math.max(0.5, config.slotWidth + widthAdjustment);
  const cutThickness = Math.max(materialThickness + 0.2, requestedWidth);
  const bridge = Math.min(0.4, Math.max(0.15, cutThickness * 0.08));
  const halfChannel = Math.max(0.12, (cutThickness - bridge) / 2);
  const armAngle = layer.primary.rotationOffset ?? 0;

  if (config.slotMode === '2-plane') {
    if (layerIndex === 0) {
      slots.push({ length: drawLength, width: cutThickness, yOffset: 0, rotationDeg: -armAngle });
    } else if (layerIndex === 1) {
      slots.push({ length: drawLength, width: cutThickness, yOffset: 0, rotationDeg: -(armAngle + 180) });
    }
    return slots;
  }

  if (layerIndex === 0) {
    slots.push({
      length: drawLength,
      width: halfChannel,
      yOffset: (bridge / 2) + (halfChannel / 2),
      rotationDeg: -armAngle,
    });
    slots.push({
      length: drawLength,
      width: halfChannel,
      yOffset: -((bridge / 2) + (halfChannel / 2)),
      rotationDeg: -armAngle,
    });
    return slots;
  }

  if (layerIndex === 1) {
    slots.push({
      length: slotLength,
      width: halfChannel,
      yOffset: (bridge / 2) + (halfChannel / 2),
      rotationDeg: -armAngle,
    });
    // Keep same azimuth as main cut; xOffset places this on the opposite side.
    slots.push({
      length: tipInLength,
      width: halfChannel,
      xOffset: -drawLength,
      yOffset: (bridge / 2) + (halfChannel / 2),
      rotationDeg: -armAngle,
    });
    return slots;
  }

  if (layerIndex === 2) {
    slots.push({
      length: slotLength,
      width: halfChannel,
      yOffset: -((bridge / 2) + (halfChannel / 2)),
      rotationDeg: -armAngle,
    });
    // Opposite-arm extension: start at the origin and cut outward on the
    // negative-X arm for 75% of slotLength.
    slots.push({
      length: Math.max(0.01, tipInStart),
      width: Math.max(0.12, halfChannel * 0.85),
      xOffset: -Math.max(0.01, tipInStart),
      yOffset: -((bridge / 2) + (halfChannel / 2)),
      rotationDeg: -armAngle,
    });
    return slots;
  }

  return slots;
};

const createAngledSlotCuttersForLayer = (
  layer: LayerConfig,
  layerIndex: number,
  enabledLayers: LayerConfig[],
  config: SnowflakeConfig,
  materialThickness: number,
  centerZ: number,
  depthZ: number
): THREE_ACTUAL.BufferGeometry[] => {
  if (!config.slotEnabled) return [];
  if (config.slotMode === '2-plane' && enabledLayers.length < 2) return [];
  if (config.slotMode === '3-plane' && enabledLayers.length < 3) return [];

  const modelDiameter = 190;
  const adjLength = Math.max(2, config.slotLength + (layer.slotLengthAdjustment ?? 0));
  const adjWidth = Math.max(0.5, config.slotWidth + (layer.slotWidthOffset ?? 0));
  const drawLength = Math.max(adjLength, (modelDiameter / 2) + 20);
  const tipInStart = Math.max(0, adjLength * 0.75);
  const tipInLength = Math.max(0.01, drawLength - tipInStart);
  const armAngle = layer.primary.rotationOffset ?? 0;
  const cutThickness = Math.max(materialThickness + 0.25, adjWidth);
  const bridge = Math.min(0.4, Math.max(0.15, cutThickness * 0.08));
  const halfChannel = Math.max(0.12, (cutThickness - bridge) / 2);
  const fullPunch = Math.max(500, drawLength * 4);

  const cutters: THREE_ACTUAL.BufferGeometry[] = [];

  const addCutter = (
    nearX: number,
    length: number,
    slotThickness: number,
    rotXDeg: number,
    rotZDeg: number,
    yOffset = 0
  ) => {
    if (length <= 0.01 || slotThickness <= 0.01) return;
    // Match legacy blade orientation: length along X, huge punch along Y,
    // and slot opening thickness along Z.
    const g = new THREE_ACTUAL.BoxGeometry(length, fullPunch, slotThickness);
    // Keep slot placement in local XY before rotation, then apply global Z centering.
    // If centerZ is applied before rotateX/rotateZ it gets rotated into side offsets.
    g.translate(nearX + (length / 2), yOffset, 0);
    g.rotateX((rotXDeg * Math.PI) / 180);
    g.rotateZ((rotZDeg * Math.PI) / 180);
    g.translate(0, 0, centerZ);
    cutters.push(g);
  };

  if (config.slotMode === '2-plane') {
    if (layerIndex === 0) {
      addCutter(0, drawLength, cutThickness, 90, -armAngle, 0);
    } else if (layerIndex === 1) {
      addCutter(0, drawLength, cutThickness, 270, -(armAngle + 180), 0);
    }
    return cutters;
  }

  if (layerIndex === 0) {
    addCutter(0, drawLength, halfChannel, 120, -armAngle, (bridge / 2) + (halfChannel / 2));
    addCutter(0, drawLength, halfChannel, 240, -armAngle, -((bridge / 2) + (halfChannel / 2)));
    return cutters;
  }

  if (layerIndex === 1) {
    addCutter(0, drawLength, halfChannel, 240, -armAngle, (bridge / 2) + (halfChannel / 2));
    addCutter(-drawLength, tipInLength, halfChannel, 240, -armAngle, (bridge / 2) + (halfChannel / 2));
    return cutters;
  }

  if (layerIndex === 2) {
    addCutter(0, adjLength, halfChannel, 120, -armAngle, -((bridge / 2) + (halfChannel / 2)));
    // Opposite-arm extension from origin outward for 75% of slotLength.
    addCutter(
      -Math.max(0.01, tipInStart),
      Math.max(0.01, tipInStart),
      Math.max(0.12, halfChannel * 0.8),
      120,
      -armAngle,
      -((bridge / 2) + (halfChannel / 2))
    );
    return cutters;
  }

  return cutters;
};

const applyWatertightSlotCuts = async (
  layerGeo: THREE_ACTUAL.BufferGeometry,
  layer: LayerConfig,
  layerIndex: number,
  enabledLayers: LayerConfig[],
  config: SnowflakeConfig,
  bevelPerSide: number
): Promise<THREE_ACTUAL.BufferGeometry> => {
  const materialThickness = config.extrusionDepth + (config.bevelEnabled ? bevelPerSide * 2 : 0);
  const profiles = createSlotProfilesForLayer(layer, layerIndex, enabledLayers, config, materialThickness);
  if (profiles.length === 0) return layerGeo;

  const layerForCut = layerGeo.clone();
  layerForCut.computeBoundingBox();
  const layerBounds = layerForCut.boundingBox;
  const layerCenterZ = layerBounds ? (layerBounds.min.z + layerBounds.max.z) * 0.5 : 0;
  const layerDepth = layerBounds ? Math.max(0.01, layerBounds.max.z - layerBounds.min.z) : Math.max(0.01, materialThickness);
  const fallbackDepth = Math.max(layerDepth + 6, materialThickness + 2, config.extrusionDepth * 8, 40);

  const angledCutters = config.slotMode === '3-plane'
    ? createAngledSlotCuttersForLayer(
        layer,
        layerIndex,
        enabledLayers,
        config,
        materialThickness,
        layerCenterZ,
        fallbackDepth
      )
    : [];

  const cutters = angledCutters.length > 0
    ? angledCutters
    : profiles.map((p) => {
        const g = new THREE_ACTUAL.BoxGeometry(
          Math.max(0.01, p.length),
          Math.max(0.01, p.width),
          fallbackDepth
        );
        g.translate((p.length / 2) + (p.xOffset ?? 0), p.yOffset ?? 0, layerCenterZ);
        g.rotateZ(((p.rotationDeg ?? 0) * Math.PI) / 180);
        return g;
      });

  if (cutters.length === 0) {
    layerForCut.dispose();
    return layerGeo;
  }

  try {
    const baseData = {
      positions: Array.from(layerForCut.attributes.position.array as Float32Array),
      indices: layerForCut.index
        ? Array.from(layerForCut.index.array as Uint32Array)
        : null,
    };

    const slotsData = cutters.map((g) => ({
      positions: Array.from(g.attributes.position.array as Float32Array),
      indices: g.index
        ? Array.from(g.index.array as Uint32Array)
        : null,
      rotation: { x: 0, y: 0, z: 0 },
    }));

    const workerResult = await postCSGJob(baseData, slotsData, { x: 0, y: 0, z: 0 });
    if (!workerResult?.success || !workerResult?.geometry?.positions?.length) {
      throw new Error(workerResult?.error || 'Worker CSG returned empty geometry');
    }

    const out = new THREE_ACTUAL.BufferGeometry();
    out.setAttribute(
      'position',
      new THREE_ACTUAL.BufferAttribute(new Float32Array(workerResult.geometry.positions), 3)
    );
    if (workerResult.geometry.indices?.length) {
      out.setIndex(new THREE_ACTUAL.BufferAttribute(new Uint32Array(workerResult.geometry.indices), 1));
    }
    out.computeVertexNormals();
    out.computeBoundingBox();

    // Worker CSG returns an open shell by design; cap slot openings to make
    // a printable solid before any topology cleanup.
    const capped = fillSlotHoles(out, cutters);
    if (capped !== out) out.dispose();

    const welded = BufferGeometryUtils.mergeVertices(capped, 0.0001) as THREE_ACTUAL.BufferGeometry;
    if (welded !== capped) capped.dispose();
    welded.computeVertexNormals();
    welded.computeBoundingBox();

    const topo = getTopologyReport(welded);
    if (topo.boundaryEdges > 0 || topo.nonManifoldEdges > 0) {
      const repaired = surgicalSlotRepair(welded);
      welded.dispose();
      repaired.computeVertexNormals();
      repaired.computeBoundingBox();
      return repaired;
    }

    return welded;
  } catch (workerErr) {
    console.warn(`Worker slot cutting failed for ${layer.name}, keeping uncut geometry`, workerErr);
    return layerGeo;
  } finally {
    cutters.forEach((g) => g.dispose());
    layerForCut.dispose();
  }
};

// // ============================================================
// // createSlotGeometries
// // ============================================================
// //
// // COORDINATE SPACE
// //   The mesh passed to applySlotCuts is ALREADY in world space
// //   (rotated by layer.rotation3D before the call).  The CSG worker
// //   then rotates each BLADE by layer.rotation3D before subtracting,
// //   so blades must be supplied in LOCAL (pre-rotation) space.
// //
// //   net world angleX = localAngleX + layer.rotation3D.x
// //
// // For a slot to accept the Base plane (face normal = world-Z = 0°):
// //   net world angleX must = 0°  →  localAngleX = -rx
// //
// //   Base  (rx=  0°): local = 0°  but Base accepts Cross/Tilt, not itself.
// //     blade at local 120° → net 120° → Cross face normal → accepts Cross ✓
// //     blade at local 240° → net 240° → Tilt  face normal → accepts Tilt  ✓
// //   Cross (rx=120°): local = -120° = 240° → net 360° = 0° → accepts Base ✓
// //   Tilt  (rx=240°): local = -240° = 120° → net 360° = 0° → accepts Base ✓
// //
// // CUT THICKNESS
// //   materialThickness = extrusionDepth + (bevel ? bevelAmount×2 : 0)
// //   cutThickness      = materialThickness + boldness + 0.2 mm tolerance
// // ============================================================

// const createSlotGeometries = (
//   layer: LayerConfig,
//   baseSlotLength: number,
//   baseSlotWidth: number,
//   extrusionDepth: number,
//   bevelEnabled: boolean,
//   bevelAmount: number,
//   allLayers: LayerConfig[],
//   globalStrokeWeight: number = 0
// ): THREE_ACTUAL.BufferGeometry[] => {

//   if (!layer.slotType || layer.slotType === 'none') return [];

//   const slots: THREE_ACTUAL.BufferGeometry[] = [];
//   const enabledLayers = allLayers.filter(l => l.enabled);
//   const numPlanes     = enabledLayers.length;

//   const adjLength = layer.slotLengthAdjustment ?? 0;
//   const adjWidth  = layer.slotWidthOffset      ?? 0;

//   const slotLength = baseSlotLength + adjLength;
//   const angle      = layer.primary.rotationOffset;

//   // Material thickness: extrusion + both bevel faces + boldness expansion.
//   // Then add 0.2mm clearance for 3D-print fit (0.1mm per side).
//   const materialThickness = extrusionDepth + (bevelEnabled ? bevelAmount * 2 : 0);
//   const boldnessExpansion = globalStrokeWeight > 0 ? globalStrokeWeight : 0;
//   const cutThickness = materialThickness + boldnessExpansion + 0.2 + adjWidth;

//   const modelDiameter = 190;
//   const drawLength    = Math.max(slotLength, (modelDiameter / 2) + 20);
//   const FULL_PUNCH    = 500;

//   // ── createBlade ──────────────────────────────────────────────────────
//   // Rectangular box cutter. Used for Base slots and Tilt main slot.
//   // nearX    : X start of the blade (hub-relative)
//   // length   : blade length along local X
//   // thickness: slot opening width (= cutThickness), blade's thin Z axis
//   // extent   : punch depth (blade's Y axis) — FULL_PUNCH for full-arm cuts
//   // angleX   : local-space tilt around X axis (degrees)
//   // angleZ   : azimuth — which arm the blade points along (degrees)
//   // yOffset  : optional offset in blade-local Y (= world-Y after all rotations)
//   //            used to shift the blade to one side so it only cuts half the arm
//   const createBlade = (
//     nearX:     number,
//     length:    number,
//     thickness: number,
//     extent:    number,
//     angleX:    number,
//     angleZ:    number,
//     yOffset:   number = 0
//   ): THREE_ACTUAL.BufferGeometry => {
//     const OVERSHOOT = 1.5;
//     const totalLen  = length + OVERSHOOT;
//     const geo = new THREE_ACTUAL.BoxGeometry(totalLen, extent, thickness, 1, 1, 1);
//     geo.translate(nearX + (length - OVERSHOOT) / 2, yOffset, 0);
//     geo.rotateX(angleX * Math.PI / 180);
//     geo.rotateZ(angleZ  * Math.PI / 180);
//     return geo;
//   };

//   // ── createTriangularBlade ─────────────────────────────────────────────
//   // Triangular-prism cutter. Used for the Cross main-slot V-notch.
//   //
//   // Cross-section in local XY:
//   //   apex  at (nearX,  0)              ← hub end, zero width  = V tip
//   //   base  at (nearX+length, ±halfY)   ← arm end, full width  = slot opens
//   //
//   // The prism is extruded along local Z by ±thickness/2 (= slot opening).
//   //
//   // After rotateX(angleX) + rotateZ(angleZ) and the worker's rotation,
//   // this carves a slot that is zero-wide at the hub (leaving the triangular
//   // point of the arm body intact) and fully open at slotLength depth.
//   const createTriangularBlade = (
//     nearX:     number,
//     length:    number,
//     thickness: number,  // slot opening (Z extent)
//     halfY:     number,  // half-width of prism base (Y extent at arm end)
//     angleX:    number,
//     angleZ:    number
//   ): THREE_ACTUAL.BufferGeometry => {
//     const T  = thickness;
//     const X0 = nearX;
//     const X1 = nearX + length;
//     const H  = halfY;

//     // 6 vertices: front face (Z = -T/2) then back face (Z = +T/2)
//     const positions = new Float32Array([
//       X0,  0, -T / 2,  // v0  apex front
//       X1, +H, -T / 2,  // v1  top-right front
//       X1, -H, -T / 2,  // v2  bottom-right front
//       X0,  0, +T / 2,  // v3  apex back
//       X1, +H, +T / 2,  // v4  top-right back
//       X1, -H, +T / 2,  // v5  bottom-right back
//     ]);

//     // Triangles with outward-facing winding (CCW from outside)
//     const indices = new Uint32Array([
//       0, 2, 1,   // front face  (normal -Z)
//       3, 4, 5,   // back face   (normal +Z)
//       0, 1, 4,  0, 4, 3,   // top slant
//       0, 3, 5,  0, 5, 2,   // bottom slant
//       1, 2, 5,  1, 5, 4,   // right end cap (X = X1)
//     ]);

//     const geo = new THREE_ACTUAL.BufferGeometry();
//     geo.setAttribute('position', new THREE_ACTUAL.BufferAttribute(positions, 3));
//     geo.setIndex(new THREE_ACTUAL.BufferAttribute(indices, 1));
//     geo.computeVertexNormals();
//     geo.rotateX(angleX * Math.PI / 180);
//     geo.rotateZ(angleZ  * Math.PI / 180);
//     return geo;
//   };

//   // ════════════════════════════════════════════════════════════════════
//   // 2-PLANE ASSEMBLY
//   // ════════════════════════════════════════════════════════════════════
//   if (numPlanes === 2) {
//     if (layer.slotType === 'half-back') {
//       slots.push(createBlade(0, drawLength, cutThickness, FULL_PUNCH, 90, -angle));
//     } else if (layer.slotType === 'half-front') {
//       slots.push(createBlade(0, drawLength, cutThickness, FULL_PUNCH, 90, -(angle + 180)));
//     } else {
//       slots.push(createBlade(-drawLength / 2, drawLength, cutThickness, FULL_PUNCH, 90, -angle));
//     }
//     return slots;
//   }

//   // ════════════════════════════════════════════════════════════════════
//   // 3-PLANE ASSEMBLY  (reference: App-Clean_slots.tsx)
//   // ════════════════════════════════════════════════════════════════════
//   if (numPlanes === 3) {
//     const layerIndex = enabledLayers.findIndex(l => l.id === layer.id);
//     console.log(`🔧 Slot gen: "${layer.name}" id="${layer.id}" slotType="${layer.slotType}" → layerIndex=${layerIndex} of ${numPlanes}`);

//     // ── L0: BASE PLANE ───────────────────────────────────────────────
//     // Two angled blades: one at 120° accepts Cross, one at 240° accepts Tilt.
//     if (layerIndex === 0) {
//       slots.push(createBlade(0, drawLength, cutThickness, cutDepth, 120, -angle));
//       slots.push(createBlade(0, drawLength, cutThickness, cutDepth, 240, -angle));
//       return slots;
//     }

//     // ── L1: CROSS PLANE ──────────────────────────────────────────────
//     // Triangular prism cutter — creates V-notch (triangular point at hub).
//     //
//     // The prism is WIDE at the hub (X=0) and TAPERS to an apex at slotLength.
//     // This removes material from both sides of the arm near the center,
//     // leaving the arm body as a triangular point at the hub. (yellow lines)
//     //
//     // Prism cross-section (local Y axis = arm height after rotations):
//     //   hub end  (X=0):         ±halfY wide  → max cut, arm body = point
//     //   slot end (X=slotLength): 0 wide       → no cut, arm body = full rect
//     //
//     // local angleX=240° → worker +120° → net 0° = Base face normal ✓
//     if (layerIndex === 1) {
//       const H = FULL_PUNCH / 2;
//       const X0 = 0;
//       const X1 = slotLength;
//       const T  = cutThickness;

//       // 6 vertices: wide rect at hub (X0), point (line) at tip (X1)
//       // v0-v1: hub bottom-front / hub top-front  (Z = -T/2)
//       // v2: tip apex front (Z = -T/2)
//       // v3-v4: hub bottom-back / hub top-back    (Z = +T/2)
//       // v5: tip apex back  (Z = +T/2)
//       const positions = new Float32Array([
//         X0, -H, -T / 2,  // v0 hub bottom front
//         X0, +H, -T / 2,  // v1 hub top front
//         X1,  0, -T / 2,  // v2 tip apex front
//         X0, -H, +T / 2,  // v3 hub bottom back
//         X0, +H, +T / 2,  // v4 hub top back
//         X1,  0, +T / 2,  // v5 tip apex back
//       ]);

//       // CCW winding (outward normals)
//       const indices = new Uint32Array([
//         0, 1, 2,            // front face   (-Z normal)
//         3, 5, 4,            // back face    (+Z normal)
//         0, 2, 5,  0, 5, 3,  // bottom slant
//         1, 4, 5,  1, 5, 2,  // top slant
//         0, 3, 4,  0, 4, 1,  // hub end cap  (-X normal)
//       ]);

//       const geo = new THREE_ACTUAL.BufferGeometry();
//       geo.setAttribute('position', new THREE_ACTUAL.BufferAttribute(positions, 3));
//       geo.setIndex(new THREE_ACTUAL.BufferAttribute(indices, 1));
//       geo.computeVertexNormals();
//       geo.rotateX(240 * Math.PI / 180);
//       geo.rotateZ(-angle * Math.PI / 180);
//       slots.push(geo);
//       return slots;
//     }

//     // ── L2: TILT PLANE ───────────────────────────────────────────────
//     // Single rectangular blade, shifted entirely to one Y side.
//     // This creates a single clean diagonal face on the tilt arm. (red lines)
//     //
//     // yOffset = -FULL_PUNCH/2 shifts the blade so it only covers world-Y < 0
//     // (the lower half of the arm when viewed in world space), leaving the
//     // upper half intact and creating the angled face at the cut boundary.
//     //
//     // local angleX=120° → worker +240° → net 0° = Base face normal ✓
//     if (layerIndex === 2) {
//       slots.push(createBlade(
//         0,
//         slotLength,
//         cutThickness,
//         FULL_PUNCH,
//         120,
//         -angle,
//         -FULL_PUNCH / 2   // shift blade to only cut world-Y < 0
//       ));
//       return slots;
//     }

//     console.warn(`  ⚠️ layerIndex=${layerIndex} unresolved for "${layer.name}", using fallback`);
//     slots.push(createBlade(0, drawLength, cutThickness, cutDepth, 120, -angle));
//     return slots;
//   }

//   // ── 4+ planes fallback ───────────────────────────────────────────────────
//   slots.push(createBlade(-drawLength / 2, drawLength, cutThickness, FULL_PUNCH, 90, -angle));
//   return slots;
// };


// // ... (unchanged code below)
// /**
//  * Parse the WorkerOutput envelope and build a THREE.BufferGeometry.
//  * The CSG worker posts:
//  *   { success, geometry: { positions, indices, normals }, stats }
//  * Old callers mistakenly destructured { position, index } directly from `e`.
//  * /
// function workerOutputToGeometry(
//   e: any,
//   fallback: THREE_ACTUAL.BufferGeometry
// ): THREE_ACTUAL.BufferGeometry | null {
//   if (!e || !e.success || !e.geometry) {
//     console.error('CSG Worker returned failure:', e?.error ?? 'unknown');
//     return null;
//   }
//   const { positions, indices, normals } = e.geometry;
//   if (!positions || positions.length === 0) {
//     console.error('CSG Worker returned empty positions');
//     return null;
//   }
//   const geo = new THREE_ACTUAL.BufferGeometry();
//   geo.setAttribute(
//     'position',
//     new THREE_ACTUAL.BufferAttribute(new Float32Array(positions), 3)
//   );
//   if (normals && normals.length > 0) {
//     geo.setAttribute(
//       'normal',
//       new THREE_ACTUAL.BufferAttribute(new Float32Array(normals), 3)
//     );
//   }
//   if (indices && indices.length > 0) {
//     geo.setIndex(
//       new THREE_ACTUAL.BufferAttribute(new Uint32Array(indices), 1)
//     );
//   }
//   geo.computeVertexNormals();
//   return geo;
// }

// /**
//  * Post-process a freshly BSP-cut geometry:
//  *   1. Fill open boundary loops (B)
//  *   2. Attempt Manifold re-subtraction with wider merge tolerance (C)
//  *
//  * The slotGeometries are passed to Manifold so it can redo the boolean on
//  * the now-closed mesh.  If Manifold fails, the hole-filled result is returned
//  * (still valid for preview and STL export).
//  * /
// async function postProcessCutGeometry(
//   cutGeo: THREE_ACTUAL.BufferGeometry,
//   _slotGeometries: THREE_ACTUAL.BufferGeometry[]
// ): Promise<THREE_ACTUAL.BufferGeometry> {
//   try {
//     // Step 1: wider-tolerance weld bridges BSP seam vertices (0.02 mm)
//     let geo = BufferGeometryUtils.mergeVertices(cutGeo, 0.08) as THREE_ACTUAL.BufferGeometry;

//     // Step 2: fill open boundary loops left by slot cuts
//     geo = fillOpenHoles(geo);

//     // Step 3: tight weld + recompute normals
//     geo = BufferGeometryUtils.mergeVertices(geo, 0.0001) as THREE_ACTUAL.BufferGeometry;
//     geo.computeVertexNormals();

//     const r = getTopologyReport(geo);
//     console.log(`✅ Post-process: boundary=${r.boundaryEdges} nonManifold=${r.nonManifoldEdges}`);
//     return geo;
//   } catch (err) {
//     console.warn('postProcessCutGeometry failed, returning raw cut geo:', err);
//     return cutGeo;
//   }
// }

// /**
//  * Fill open boundary loops in a BSP-cut mesh with fan-triangulated caps.
//  * Finds every edge with only 1 adjacent face, chains them into closed loops,
//  * and triangulates each loop from its centroid with correct outward winding.
//  * /
// function fillOpenHoles(geometry: THREE_ACTUAL.BufferGeometry): THREE_ACTUAL.BufferGeometry {
//   if (!geometry.index) geometry = BufferGeometryUtils.mergeVertices(geometry, 1e-4);
//   if (!geometry.index) return geometry;

//   const idx = geometry.index;
//   const pos = geometry.attributes.position as THREE_ACTUAL.BufferAttribute;

//   // Build edge → face-count map
//   const edgeCount = new Map<string, number>();
//   const edgeDir   = new Map<string, [number, number]>();
//   for (let i = 0; i < idx.count; i += 3) {
//     const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2);
//     for (const [v0, v1] of [[a,b],[b,c],[c,a]] as [number,number][]) {
//       const k = v0 < v1 ? `${v0}_${v1}` : `${v1}_${v0}`;
//       edgeCount.set(k, (edgeCount.get(k) ?? 0) + 1);
//       if (!edgeDir.has(k)) edgeDir.set(k, [v0, v1]);
//     }
//   }

//   // Collect boundary edges (valence-1)
//   const nextVert = new Map<number, number[]>();
//   edgeCount.forEach((cnt, k) => {
//     if (cnt !== 1) return;
//     const [v0, v1] = edgeDir.get(k)!;
//     if (!nextVert.has(v0)) nextVert.set(v0, []);
//     if (!nextVert.has(v1)) nextVert.set(v1, []);
//     nextVert.get(v0)!.push(v1);
//     nextVert.get(v1)!.push(v0);
//   });
//   if (nextVert.size === 0) return geometry;

//   // Chain into closed loops
//   const visited = new Set<number>();
//   const loops: number[][] = [];
//   nextVert.forEach((_, start) => {
//     if (visited.has(start)) return;
//     const loop: number[] = [];
//     let cur = start, prev = -1;
//     for (let safety = 0; safety < 200000; safety++) {
//       if (visited.has(cur) && cur !== start) break;
//       loop.push(cur); visited.add(cur);
//       const nbs = nextVert.get(cur) ?? [];
//       let moved = false;
//       for (const nb of nbs) {
//         if (nb === prev) continue;
//         if (!visited.has(nb) || (nb === start && loop.length > 2)) {
//           prev = cur; cur = nb; moved = true; break;
//         }
//       }
//       if (!moved || cur === start) break;
//     }
//     if (loop.length >= 3) loops.push(loop);
//   });
//   if (loops.length === 0) return geometry;

//   // Append cap triangles
//   const posArr = Array.from(pos.array as Float32Array);
//   const idxArr = Array.from(idx.array as Uint32Array);
//   const bbox   = new THREE_ACTUAL.Box3().setFromBufferAttribute(pos);
//   const mc     = new THREE_ACTUAL.Vector3(); bbox.getCenter(mc);

//   for (const loop of loops) {
//     let cx = 0, cy = 0, cz = 0;
//     for (const vi of loop) { cx += pos.getX(vi); cy += pos.getY(vi); cz += pos.getZ(vi); }
//     cx /= loop.length; cy /= loop.length; cz /= loop.length;
//     const ci = posArr.length / 3;
//     posArr.push(cx, cy, cz);

//     // Winding: cap normal must point away from mesh centroid
//     const p0 = new THREE_ACTUAL.Vector3(pos.getX(loop[0]), pos.getY(loop[0]), pos.getZ(loop[0]));
//     const p1 = new THREE_ACTUAL.Vector3(pos.getX(loop[1]), pos.getY(loop[1]), pos.getZ(loop[1]));
//     const pC = new THREE_ACTUAL.Vector3(cx, cy, cz);
//     const n  = new THREE_ACTUAL.Vector3().crossVectors(
//       p1.clone().sub(p0), pC.clone().sub(p0)
//     );
//     const flip = n.dot(mc.clone().sub(pC)) > 0;
//     for (let i = 0; i < loop.length; i++) {
//       const a = loop[i], b = loop[(i + 1) % loop.length];
//       flip ? idxArr.push(b, a, ci) : idxArr.push(a, b, ci);
//     }
//   }

//   const out = new THREE_ACTUAL.BufferGeometry();
//   out.setAttribute('position', new THREE_ACTUAL.Float32BufferAttribute(posArr, 3));
//   out.setIndex(idxArr);
//   out.computeVertexNormals();
//   return out;
// }


// // ─── applySlotCuts ───────────────────────────────────────────────────────────

// const applySlotCuts = async (
//   layerGeo: THREE_ACTUAL.BufferGeometry,
//   layer: LayerConfig,
//   slotLength: number,
//   slotWidth: number,
//   extrusionDepth: number,
//   bevelEnabled: boolean,
//   bevelAmount: number,
//   allLayers: LayerConfig[],
//   globalStrokeWeight: number = 0,
//   onProgress?: () => Promise<void>
// ): Promise<THREE_ACTUAL.BufferGeometry> => {

//   // Include rotation + numPlanes so L0/L1/L2 each get distinct cached blade sets
//   const enabledLayers = allLayers.filter(l => l.enabled);
//   const rxTag      = Math.round(layer.rotation3D?.x ?? 0);
//   const nPlanesTag = enabledLayers.length;
//   const layerIndexTag = enabledLayers.findIndex(l => l.id === layer.id);
//   const cacheKey   = makeCacheKey(
//     `${layer.id}_idx${layerIndexTag}_rx${rxTag}_np${nPlanesTag}`,
//     slotLength, slotWidth, extrusionDepth,
//     bevelEnabled, bevelAmount, globalStrokeWeight
//   );

//   // TEMPORARY: Force-bust slot cache during debugging
//   clearSlotCache();  // remove after slot geometry is verified

//   const slotGeometries = getOrCreateSlotGeometries(
//     cacheKey,
//     () => createSlotGeometries(
//       layer, slotLength, slotWidth, extrusionDepth,
//       bevelEnabled, bevelAmount, allLayers, globalStrokeWeight
//     )
//   );
//   if (slotGeometries.length === 0) return layerGeo;

//   // ── Serialise base with CORRECT plural key names ─────────────────────────
//   const baseData = {
//     positions: Array.from(layerGeo.attributes.position.array as Float32Array),
//     indices:   layerGeo.index
//       ? Array.from(layerGeo.index.array as Uint32Array)
//       : null,
//   };

//   // ── Helper: build result from worker response + run B+C repair ───────────
//   const buildResult = async (
//     e: any,
//     usedSlots: THREE_ACTUAL.BufferGeometry[]
//   ): Promise<THREE_ACTUAL.BufferGeometry> => {
//     const rawGeo = workerOutputToGeometry(e, layerGeo);
//     if (!rawGeo) {
//       usedSlots.forEach(g => g.dispose());
//       return layerGeo;
//     }

//     const report = getTopologyReport(rawGeo);
//     console.log(`📊 Post-CSG topology [${layer.name}]:`, report);

//     // Run B+C: fill holes → attempt Manifold with wider merge tolerance
//     const repairedGeo = await postProcessCutGeometry(rawGeo, usedSlots);

//     usedSlots.forEach(g => g.dispose());
//     return repairedGeo;
//   };

//   // ── Fast AABB filter ──────────────────────────────────────────────────────
//   try {
//     if (!layerGeo.boundingBox) layerGeo.computeBoundingBox();
//     const layerBB = layerGeo.boundingBox ? layerGeo.boundingBox.clone() : null;

//     if (layerBB) {
//       const rotX = (layer.rotation3D?.x ?? 0) * Math.PI / 180;
//       const rotY = (layer.rotation3D?.y ?? 0) * Math.PI / 180;
//       const rotMat = new THREE_ACTUAL.Matrix4()
//         .makeRotationX(rotX)
//         .multiply(new THREE_ACTUAL.Matrix4().makeRotationY(rotY));

//       const keptSlots: THREE_ACTUAL.BufferGeometry[] = [];
//       for (const g of slotGeometries) {
//         try {
//           const clone = g.clone();
//           clone.applyMatrix4(rotMat);
//           clone.computeBoundingBox();
//           const gbb = clone.boundingBox;
//           if (gbb) {
//             const padded = gbb.clone().expandByScalar(0.5);
//             if (layerBB.intersectsBox(padded)) keptSlots.push(g);
//           }
//           clone.dispose?.();
//         } catch {
//           keptSlots.push(g); // conservative: keep on error
//         }
//       }

//       if (keptSlots.length === 0) {
//         slotGeometries.forEach(s => s.dispose());
//         return layerGeo;
//       }

//       // Serialise with CORRECT plural key names
//       const slotsData = keptSlots.map(g => ({
//         positions: Array.from(g.attributes.position.array as Float32Array),
//         indices:   g.index
//           ? Array.from(g.index.array as Uint32Array)
//           : null,
//         rotation: layer.rotation3D ?? { x: 0, y: 0, z: 0 },
//       }));

//       return postCSGJob(baseData, slotsData, layer.rotation3D)
//         .then((e: any) => buildResult(e, keptSlots))
//         .catch((err: any) => {
//           console.error('CSG Worker Error (filtered path):', err);
//           slotGeometries.forEach(g => g.dispose());
//           return layerGeo;
//         });
//     }
//   } catch (e) {
//     console.warn('Slot AABB filtering failed, proceeding with full CSG', e);
//   }

//   // ── Fallback: send all slots ──────────────────────────────────────────────
//   const allSlotsData = slotGeometries.map(g => ({
//     positions: Array.from(g.attributes.position.array as Float32Array),
//     indices:   g.index
//       ? Array.from(g.index.array as Uint32Array)
//       : null,
//     rotation: layer.rotation3D ?? { x: 0, y: 0, z: 0 },
//   }));

//   return postCSGJob(baseData, allSlotsData, layer.rotation3D)
//     .then((e: any) => buildResult(e, slotGeometries))
//     .catch((err: any) => {
//       console.error('CSG Worker Error (full fallback path):', err);
//       slotGeometries.forEach(g => g.dispose());
//       return layerGeo;
//     });
// };


const createDefaultTextGroup = (text: string, rotation: number, fontSize: number, textX: number): TextGroupConfig => ({
  enabled: true,
  text,
  fontFamily: CURSIVE_FONTS[0].family,
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
  rotation3D: { x: rx, y: ry, z: 0 },
  primary: createDefaultTextGroup("Snow", 0, 36.7, 20),
  secondary: createDefaultTextGroup("", 30, 20, 10),
  secondaryEnabled: true,
  abstracts: [],
  hubs: [],
  slotType: 'none',
  slotLengthAdjustment: 0,
  slotWidthOffset: 0,
  images: [],
});

// // ============================================================
// // REPLACE calculateOptimalSlots in App.tsx
// // (Re-enables automatic 3-plane mode switching)
// // ============================================================

// const calculateOptimalSlots = (layers: LayerConfig[]): LayerConfig[] => {
//   const updatedLayers = JSON.parse(JSON.stringify(layers)) as LayerConfig[];
//   const enabled = updatedLayers.filter(l => l.enabled);
//   const count = enabled.length;
//   if (count < 2) { console.warn('Need at least 2 enabled layers for slot calculation'); return updatedLayers; }
//   if (count === 2) {
//     enabled[0].rotation3D = { x: 0, y: 0 }; enabled[0].slotType = 'half-back';
//     enabled[1].rotation3D = { x: 90, y: 0 }; enabled[1].slotType = 'half-front';
//   } else if (count === 3) {
//     enabled[0].rotation3D = { x: 0, y: 0 }; enabled[0].slotType = 'third-back';
//     enabled[1].rotation3D = { x: 120, y: 0 }; enabled[1].slotType = 'third-middle';
//     enabled[2].rotation3D = { x: 240, y: 0 }; enabled[2].slotType = 'third-front';
//   } else {
//     enabled.forEach((layer, index) => { const angle = (360 / count) * index; layer.rotation3D = { x: angle, y: 0 }; layer.slotType = 'custom'; });
//   }
//   return updatedLayers;
// };


const App: React.FC = () => {
  const defaultDepth = 3.0;

  // Debug: Track app initialization only once
  useEffect(() => {
    const appStartTime = performance.now();
    console.log(`🚀 App Debug: App component starting initialization at ${appStartTime.toFixed(2)}ms`);

    // Auto-update functionality - Temporarily commented out due to rendering issues
    // const checkForUpdates = async () => {
    //   try {
    //     const response = await fetch('https://api.github.com/repos/kar883/Ultimate-Snowflake-Generator/releases/latest');
    //     const release = await response.json();
    //     const currentVersion = '1.0.3';
    //     const latestVersion = release.tag_name.replace('v', '');
        
    //     console.log('Current version:', currentVersion, 'Latest version:', latestVersion);
        
    //     if (latestVersion !== currentVersion) {
    //       console.log('New version available:', latestVersion);
          
    //       // Show update notification
    //       const updateNotification = document.createElement('div');
    //       updateNotification.innerHTML = `
    //         <div style="
    //           position: fixed;
    //           top: 20px;
    //           right: 20px;
    //           background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    //           color: white;
    //           padding: 16px 20px;
    //           border-radius: 12px;
    //           box-shadow: 0 10px 25px rgba(0,0,0,0.2);
    //           z-index: 9999;
    //           font-family: system-ui, -apple-system, sans-serif;
    //           font-size: 14px;
    //           font-weight: 600;
    //           max-width: 350px;
    //           border: 1px solid rgba(255,255,255,0.1);
    //         ">
    //           <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
    //             <span style="font-size: 18px;"></span>
    //             <div>
    //               <div style="font-weight: 700; margin-bottom: 2px;">Update Available!</div>
    //               <div style="opacity: 0.9; font-size: 12px;">Version ${latestVersion} is now available</div>
    //             </div>
    //           </div>
    //           <div style="display: flex; gap: 8px; margin-top: 12px;">
    //             <button id="download-update" style="
    //               background: rgba(255,255,255,0.2);
    //               border: 1px solid rgba(255,255,255,0.3);
    //               color: white;
    //               padding: 6px 12px;
    //               border-radius: 6px;
    //               font-size: 12px;
    //               font-weight: 600;
    //               cursor: pointer;
    //               transition: all 0.2s;
    //             ">Download</button>
    //             <button id="dismiss-update" style="
    //               background: transparent;
    //               border: 1px solid rgba(255,255,255,0.2);
    //               color: white;
    //               padding: 6px 12px;
    //               border-radius: 6px;
    //               font-size: 12px;
    //               font-weight: 600;
    //               cursor: pointer;
    //               transition: all 0.2s;
    //             ">Later</button>
    //           </div>
    //         </div>
    //       `;
          
    //       document.body.appendChild(updateNotification);
          
    //       // Add event listeners
    //       const downloadBtn = updateNotification.querySelector('#download-update');
    //       const dismissBtn = updateNotification.querySelector('#dismiss-update');
          
    //       if (downloadBtn) {
    //         downloadBtn.addEventListener('click', () => {
    //           window.open('https://github.com/kar883/Ultimate-Snowflake-Generator/releases/latest', '_blank');
    //           document.body.removeChild(updateNotification);
    //         });
    //       }
          
    //       if (dismissBtn) {
    //         dismissBtn.addEventListener('click', () => {
    //           document.body.removeChild(updateNotification);
    //         });
    //       }
          
    //       // Auto-dismiss after 30 seconds
    //       setTimeout(() => {
    //         if (document.body.contains(updateNotification)) {
    //           document.body.removeChild(updateNotification);
    //         }
    //       }, 30000);
    //     } else {
    //       console.log('App is up to date');
    //     }
    //   } catch (error) {
    //     console.error('Failed to check for updates:', error);
    //   }
    // };

    // Check for updates on app start
    // setTimeout(checkForUpdates, 3000); // Check after 3 seconds

    return () => {
      console.log(`🚀 App Debug: App component unmounted after ${(performance.now() - appStartTime).toFixed(2)}ms`);
    };
  }, []);

  // Cache for expensive operations
  const enabledLayersCache = useRef<Map<string, LayerConfig[]>>(new Map());
  const lastConfigHash = useRef<string>('');
  const lastQuality = useRef<string>('');

  const initialState: SnowflakeConfig = {
    projectName: "MySnowflake",
    layers: [
      createDefaultLayer('layer-1', 'Base Plane', 0, 0, true),
      createDefaultLayer('layer-2', 'Cross Plane', 120, 0, true),
      createDefaultLayer('layer-4', 'Tilt Plane', 240, 0, true),
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
    slotMode: '3-plane',
    quality: 'low',
    syncAllLayers: true, // Default ON
    globalStrokeWeight: 0,
    freeFloatingCheck: true
  };

  const [config, setConfig] = useState<SnowflakeConfig>(initialState);
  const [config3D, setConfig3D] = useState<SnowflakeConfig>(initialState);
  const [rendered3DConfig, setRendered3DConfig] = useState<SnowflakeConfig>(initialState);
  // Guarded setter: skip update when config hash is unchanged (avoids full deepEqual on main thread).
  const lastRendered3DHash = useRef<string>(hashConfig(initialState));
  const setRendered3DIfChanged = useCallback((next: SnowflakeConfig) => {
    const h = hashConfig(next);
    if (h === lastRendered3DHash.current) return;
    lastRendered3DHash.current = h;
    setRendered3DConfig(next);
  }, []);
  const [designDiameter, setDesignDiameter] = useState(0);
  const [activeTab, setActiveTab] = useState<'global' | 'text' | 'Letter Ctrl' | 'hubs' | 'abstract' | 'planes' | 'images'>('text');
  const [shortcuts, setShortcuts] = useState<ShortcutConfig>(DEFAULT_SHORTCUTS);
  const [language, setLanguage] = useState<string>('en');
  const [showTooltips, setShowTooltips] = useState<boolean>(true);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [shortcutsModalTab, setShortcutsModalTab] = useState<'shortcuts' | 'apikey' | 'aiscope'>('shortcuts');
  const [shortcutsModalMessage, setShortcutsModalMessage] = useState<string | null>(null);

  const [history, setHistory] = useState<SnowflakeConfig[]>([initialState]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const [exportLoading, setExportLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiProgress, setAiProgress] = useState(0);
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');
  const [dynamicFonts, setDynamicFonts] = useState<Record<string, string>>(FONT_TTF_URLS);
  const [fontsPreloaded, setFontsPreloaded] = useState(false);

  // Font preloader hook
  const { preloadAllFonts, getFont, isFontLoaded } = useFontPreloader();

  // Preload all fonts when app starts (silent background loading)
  useEffect(() => {
    const preloadFonts = async () => {
      try {
        await preloadAllFonts();
        setFontsPreloaded(true);
      } catch (error) {
        // Silent failure - fonts will load on-demand if preloading fails
        console.debug('Font preloading failed, fonts will load on-demand:', error);
        setFontsPreloaded(true); // Still set to true to allow normal loading
      }
    };

    preloadFonts();
  }, [preloadAllFonts]);

  // Load fonts as CSS @font-face rules for dropdown display
  useEffect(() => {
    const style = document.createElement('style');
    let cssText = '';

    // Add built-in fonts
    CURSIVE_FONTS.forEach(font => {
      const fontUrl = FONT_TTF_URLS[font.name];
      if (fontUrl) {
        // Add @font-face rule for each Google Font
        cssText += `
          @font-face {
            font-family: '${font.family}';
            src: url('${fontUrl}') format('truetype');
            font-weight: normal;
            font-style: normal;
          }
        `;
      }
    });

    // Add dynamic fonts
    Object.entries(dynamicFonts).forEach(([name, url]) => {
      if (url && !CURSIVE_FONTS.some(f => f.name === name)) {
        cssText += `
          @font-face {
            font-family: '${name}';
            src: url('${url}') format('truetype');
            font-weight: normal;
            font-style: normal;
          }
        `;
      }
    });

    if (cssText) {
      style.textContent = cssText;
      document.head.appendChild(style);
    }

    return () => {
      if (style.parentNode) {
        style.parentNode.removeChild(style);
      }
    };
  }, [dynamicFonts]);

  const svgRef = useRef<SVGSVGElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csgEvaluator = useRef(null); // No longer needed on main thread for cutting
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  const { loadFont } = useFontCache(getFont, isFontLoaded);
  const { cleanup } = useThreeJSCleanup();
  const { handleError } = useErrorHandler();
  const { exportWithProgress } = useExportManager();
  const { notifications, showNotification } = useUserFeedback();

  // Stable debounced setters — backed by refs so they never change identity
  // and never reset their internal timer on re-render.
  const debounce150Timer = useRef<NodeJS.Timeout | null>(null);
  const debounce500Timer = useRef<NodeJS.Timeout | null>(null);

  const debouncedUpdate3D = useCallback((next: SnowflakeConfig) => {
    if (debounce150Timer.current) clearTimeout(debounce150Timer.current);
    debounce150Timer.current = setTimeout(() => setRendered3DIfChanged(next), 150);
  }, [setRendered3DIfChanged]);

  const debouncedUpdate3DSlow = useCallback((next: SnowflakeConfig) => {
    if (debounce500Timer.current) clearTimeout(debounce500Timer.current);
    debounce500Timer.current = setTimeout(() => setRendered3DIfChanged(next), 500);
  }, [setRendered3DIfChanged]);

  // Memoized enabled layers with caching
  const getEnabledLayers = useCallback((config: SnowflakeConfig): LayerConfig[] => {
    const configHash = JSON.stringify({
      layers: config.layers.map(l => ({ id: l.id, enabled: l.enabled }))
    });

    if (lastConfigHash.current !== configHash) {
      const enabled = config.layers.filter(l => l.enabled);
      enabledLayersCache.current.set(configHash, enabled);
      lastConfigHash.current = configHash;
      return enabled;
    }

    return enabledLayersCache.current.get(configHash) || [];
  }, []);

  // Diameter Calculation Logic
  useEffect(() => {
    // Skip diameter calculation during app initialization to prevent visual shifting
    // Only start calculating once fonts are preloaded
    if (!fontsPreloaded) {
      return;
    }

    let active = true;
    const calc = async () => {
        const enabledLayers = getEnabledLayers(config);
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
  }, [config, dynamicFonts, loadFont, fontsPreloaded]);

  const handleUpdateConfig = useCallback((updates: Partial<SnowflakeConfig>, commitTo3D: boolean = false) => {
    // Validate numeric bounds to prevent invalid values
    if ('globalStrokeWeight' in updates && typeof updates.globalStrokeWeight === 'number') {
      updates.globalStrokeWeight = Math.max(0, Math.min(10, updates.globalStrokeWeight));
    }

    // Clear geometry cache if boldness settings change
    if ('globalStrokeWeight' in updates && updates.globalStrokeWeight !== config.globalStrokeWeight) {
      clearGeometryCache();
    }
    // Clear geometry and model caches when quality changes so the new resolution
    // is actually applied rather than serving the old cached mesh
    if ('quality' in updates && updates.quality !== lastQuality.current) {
      clearGeometryCache();
      modelCache3D.clear();
      lastQuality.current = updates.quality!;
    }
    // if ('slotEnabled' in updates || 'slotLength' in updates || ...) {
    //   clearSlotCache(); slotCutCache.clear();
    // }

    setConfig(prev => {
      const next = { ...prev, ...updates };


      if (debounceTimer.current) {
          clearTimeout(debounceTimer.current);
          debounceTimer.current = null;
      }

      if (commitTo3D) {
        setConfig3D(next);
        setHistory(h => {
            const newHistory = [...h.slice(0, historyIndex + 1), deepClone(next)];
            if (newHistory.length > MAX_HISTORY) return newHistory.slice(newHistory.length - MAX_HISTORY);
            return newHistory;
        });
        setHistoryIndex(i => Math.min(i + 1, MAX_HISTORY - 1));

        // Immediate update for 3D view (whether visible or not, it keeps it in sync)
        setRendered3DIfChanged(next);
      } else {
        // Debounce update for 3D view
        // If in 3D mode: fast debounce (150ms) for responsiveness
        // If in 2D mode: slower debounce (500ms) to avoid lagging the UI with background generation
        const delay = viewMode === '3d' ? 150 : 500;
        if (delay === 150) {
          debouncedUpdate3D(next);
        } else {
          debouncedUpdate3DSlow(next);
        }
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

  const updateImages = useCallback((newImages: ImageConfig[], commitTo3D: boolean = false) => {
    handleUpdateConfig({
        layers: config.layers.map((layer, idx) => {
            if (idx === config.activeLayerIndex) {
                return { ...layer, images: newImages };
            }
            if (config.syncAllLayers) {
                return { ...layer, images: JSON.parse(JSON.stringify(newImages)) };
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

  const generateMesh = useCallback(async (onProgress: (p: number) => void, overrideQuality?: DesignQuality, overrideConfig?: SnowflakeConfig): Promise<THREE_ACTUAL.Group> => {
    const config = overrideConfig || rendered3DConfig;

    // Full-config cache key — any property change invalidates the cache.
    // Previously used a partial key that missed hub/abstract parameters,
    // causing 3D to show stale mesh when those values changed.
    const meshKey = hashConfig(config) + '|q:' + (overrideQuality || config.quality);

    // Check cache first
    const cached = modelCache3D.get(meshKey);
    if (cached && !overrideQuality && !overrideConfig) {
      onProgress(1);
      return cached;
    }

    // Clear geometry cache if quality changes (different curve/bevel segments)
    if (overrideQuality && overrideQuality !== rendered3DConfig.quality) {
      clearGeometryCache();
    }
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
    const bevelPerSide = config.bevelEnabled ? Math.min(config.bevelAmount, config.extrusionDepth / 2) : 0;
    const effectiveDepth = Math.max(0.001, config.extrusionDepth);

    const extrudeSettings = {
      depth: effectiveDepth,
      bevelEnabled: config.bevelEnabled,
      bevelThickness: bevelPerSide,
      bevelSize: bevelPerSide, // Standard expansion
      bevelSegments: config.bevelEnabled ? (config.bevelType === 'chamfer' ? 1 : Math.min(config.bevelSegments, bevelSegCap)) : 0,
      curveSegments: curveSeg,
    };

    const group = new THREE_ACTUAL.Group();
    // Only generate enabled layers
    const layersToGenerate = config.layers.filter(l => l.enabled);

    let totalOps = layersToGenerate.length;

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

  try {
    const font = await loadFont(fontName, url);
    if (font) {
      const scale = textGroup.fontSize / font.unitsPerEm;
      const glyphs = font.stringToGlyphs(textGroup.text);

      // BOLD FONT VARIANT FALLBACK (E part of B+E)
      // If high stroke weight and bold variant available, try loading it
      const totalStrokeWeight = (rendered3DConfig.globalStrokeWeight || 0) + (textGroup.thickness || 0);
      const boldUrl = BOLD_FONT_URLS[fontName];
      let finalFont = font;

      if (totalStrokeWeight >= BOLD_FONT_THRESHOLD && boldUrl) {
        try {
          console.log(`🎯 Attempting bold font variant for ${fontName}`);
          const boldFont = await loadFont(`${fontName}-Bold`, boldUrl);
          if (boldFont) {
            finalFont = boldFont;
            console.log(`✅ Using bold font variant for ${fontName}`);
          }
        } catch (boldError) {
          console.warn(`⚠️ Bold font variant failed for ${fontName}, using regular with path offsetting`);
        }
      }
      let textShapes: THREE_ACTUAL.Shape[] = [];
      let nonTextShapes: THREE_ACTUAL.Shape[] = [];
      let currentX = 0;

      glyphs.forEach((glyph, i) => {
        try {
          const offset = textGroup.charOffsets[i] || { x: 0, y: 0 };
          const path = glyph.getPath(currentX + offset.x, offset.y, textGroup.fontSize);
          const threePath = new THREE_ACTUAL.ShapePath();
          path.commands.forEach(cmd => {
            if (cmd.type === 'M') threePath.moveTo(cmd.x, cmd.y);
            else if (cmd.type === 'L') threePath.lineTo(cmd.x, cmd.y);
            else if (cmd.type === 'Q') threePath.quadraticCurveTo(cmd.x1, cmd.y1, cmd.x, cmd.y);
            else if (cmd.type === 'C') threePath.bezierCurveTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y);
          });
          const glyphShapes = threePath.toShapes(true);
          textShapes.push(...glyphShapes);
        } catch (error) {
          console.warn(`Failed to process glyph ${i} for font ${fontName}:`, error);
        }
        currentX += (glyph.advanceWidth * scale) + textGroup.letterSpacing;
      });

      // Combine all shapes for processing
      const shapes = [...textShapes, ...nonTextShapes];

      // ==================================================================
      // BOLDNESS PROCESSING - Using bevel expansion for valid geometry
      // ==================================================================
      // Calculate boldness bevel amount (strokeWidth/2 mimics SVG stroke centered on path)
      const boldnessBevel = totalStrokeWeight > 0.1 ? totalStrokeWeight / 2 : 0;
      const shouldApplyBoldness = totalStrokeWeight > 0.1 && !(totalStrokeWeight >= BOLD_FONT_THRESHOLD && boldUrl);

      // Create extrude settings with boldness bevel added to regular bevel
      const textExtrudeSettings = {
        ...extrudeSettings,
        bevelEnabled: true, // Always enable when boldness is applied
        bevelThickness: bevelPerSide + boldnessBevel,
        bevelSize: bevelPerSide + boldnessBevel,
        bevelSegments: Math.max(2, bevelSegCap), // Ensure enough segments for smoothness
      };

      if (shouldApplyBoldness) {
        console.log('🎨 Applying boldness via bevel expansion:', {
          globalStrokeWeight: rendered3DConfig.globalStrokeWeight,
          textThickness: textGroup.thickness,
          total: totalStrokeWeight,
          boldnessBevel,
          finalBevelSize: textExtrudeSettings.bevelSize
        });
      }
      // ==================================================================

      const textKey = makeTextKey(layer.id, textGroup, textGroup.fontSize, effectiveDepth, rendered3DConfig.bevelEnabled, bevelPerSide, rendered3DConfig.globalStrokeWeight, textGroup.thickness);
      const groupGeo = getOrCreateGeometry(geometryCache.text, textKey, () => new THREE_ACTUAL.ExtrudeGeometry(shapes, textExtrudeSettings));

            // Underline Logic
            const uConf = textGroup.underline;
            let underlineShapes: THREE_ACTUAL.Shape[] = [];
            let underlineGeo = null;

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

            // Apply boldness to underlines using the same stroke expansion as text
            const underlineGlobalBoldness = rendered3DConfig.globalStrokeWeight || 0;
            const underlineTextBoldness = uConf.thickness || 0;
            const totalUnderlineBoldness = underlineGlobalBoldness + underlineTextBoldness;

            if (totalUnderlineBoldness > 0.1) {
              const expandedUnderlineShapes: THREE_ACTUAL.Shape[] = [];

              for (const shape of underlineShapes) {
                try {
                  // Get points with higher resolution for smoother expansion
                  const points = shape.getPoints(Math.max(32, Math.ceil(totalUnderlineBoldness * 4)));
                  if (points.length < 3) {
                    expandedUnderlineShapes.push(shape);
                    continue;
                  }

                  // Expand the shape outward by strokeWidth/2 to match SVG stroke rendering
                  const expandedPoints: THREE_ACTUAL.Vector2[] = [];
                  const halfStroke = totalUnderlineBoldness / 2;

                  for (let i = 0; i < points.length; i++) {
                    const p = points[i];
                    const prevP = points[(i - 1 + points.length) % points.length];
                    const nextP = points[(i + 1) % points.length];

                    // Calculate normals from adjacent segments
                    const dx1 = p.x - prevP.x;
                    const dy1 = p.y - prevP.y;
                    const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);

                    const dx2 = nextP.x - p.x;
                    const dy2 = nextP.y - p.y;
                    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

                    if (len1 < 0.0001 || len2 < 0.0001) {
                      expandedPoints.push(p);
                      continue;
                    }

                    // Perpendicular normals (rotated 90 degrees)
                    const nx1 = -dy1 / len1;
                    const ny1 = dx1 / len1;
                    const nx2 = -dy2 / len2;
                    const ny2 = dx2 / len2;

                    // Average normal for this vertex
                    const nx = (nx1 + nx2) / 2;
                    const ny = (ny1 + ny2) / 2;
                    const nlen = Math.sqrt(nx * nx + ny * ny);

                    if (nlen < 0.0001) {
                      expandedPoints.push(p);
                      continue;
                    }

                    // Normalize and scale by half stroke width
                    const offsetX = (nx / nlen) * halfStroke;
                    const offsetY = (ny / nlen) * halfStroke;

                    expandedPoints.push(new THREE_ACTUAL.Vector2(p.x + offsetX, p.y + offsetY));
                  }

                  // Create new shape from expanded points
                  if (expandedPoints.length >= 3) {
                    const expandedShape = new THREE_ACTUAL.Shape();
                    expandedShape.moveTo(expandedPoints[0].x, expandedPoints[0].y);
                    for (let i = 1; i < expandedPoints.length; i++) {
                      expandedShape.lineTo(expandedPoints[i].x, expandedPoints[i].y);
                    }
                    expandedShape.closePath();
                    expandedUnderlineShapes.push(expandedShape);
                  } else {
                    expandedUnderlineShapes.push(shape);
                  }
                } catch (error) {
                  console.warn('Failed to expand underline shape, using original:', error);
                  expandedUnderlineShapes.push(shape);
                }
              }

              if (expandedUnderlineShapes.length > 0) {
                underlineShapes = expandedUnderlineShapes;
                console.log(`✅ Applied ${totalUnderlineBoldness}px boldness to ${expandedUnderlineShapes.length} underline shapes`);
              }
            }

            if (underlineShapes.length > 0) {
                const underlineKey = makeUnderlineKey(layer.id, textGroup, effectiveDepth, rendered3DConfig.bevelEnabled, bevelPerSide);
                underlineGeo = getOrCreateGeometry(geometryCache.text, underlineKey, () => new THREE_ACTUAL.ExtrudeGeometry(underlineShapes, extrudeSettings));
            }

            const angleStep = (Math.PI * 2) / textGroup.arms;

            // Center the extrusion on Z-axis
            const centerZOffset = -extrudeSettings.depth / 2;

            // Only push geometry if it has vertices
            if (groupGeo.attributes.position?.count > 0) {
              for (let i = 0; i < textGroup.arms; i++) {
                const angle = i * angleStep + (textGroup.rotationOffset * Math.PI / 180);
                const inst = groupGeo.clone();
                inst.translate(textGroup.textX, textGroup.mirrorOffset / 2, centerZOffset);
                inst.rotateX(Math.PI); inst.rotateZ(-angle);
                layerGeometries.push(inst);
                if (textGroup.mirrorEnabled) {
                  const mirrored = groupGeo.clone();
                  mirrored.translate(textGroup.textX, -textGroup.mirrorOffset / 2, centerZOffset);
                  mirrored.rotateZ(-angle);
                  layerGeometries.push(mirrored);
                }
                if (underlineGeo && underlineGeo.attributes.position?.count > 0) {
                    const uInst = underlineGeo.clone();
                    uInst.translate(0, 0, centerZOffset);
                    uInst.rotateX(Math.PI);
                    uInst.rotateZ(-angle);
                    layerGeometries.push(uInst);
                }
              }
            }
          }
        } catch (error) {
          console.warn(`Failed to load font ${fontName}:`, error);
        }
      };

      const processHubs = (hubs: HubConfig[]) => {
         // ... (Keep existing hub logic but ensure centerZOffset is correct)
         const centerZOffset = -extrudeSettings.depth / 2;
         hubs.filter(h => h.enabled).forEach(hub => {
             // ... (Shape generation code - same as original) ...
             const shape = new THREE_ACTUAL.Shape();
             const radius = !isNaN(hub.outerRadius) ? hub.outerRadius : 20;
             const wallT = (!isNaN(hub.wallThickness) ? hub.wallThickness : 2) + rendered3DConfig.globalStrokeWeight;
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

             // Apply boldness to hub shapes using same approach as text
             const hubStrokeWeight = (rendered3DConfig.globalStrokeWeight || 0);
             if (hubStrokeWeight > 0.1) {
               const boldedShapes = applyBoldnessToShapes([shape], hubStrokeWeight);
               if (boldedShapes.length > 0) {
                 // Replace the original shape with the bolded version
                 const tempGeo = new THREE_ACTUAL.ExtrudeGeometry(boldedShapes, extrudeSettings);
                 // Note: Shape doesn't have dispose method, cleanup handled by garbage collection
                 return tempGeo;
               }
             }

             const hubKey = makeHubKey(layer.id, hub, effectiveDepth, rendered3DConfig.bevelEnabled, bevelPerSide, rendered3DConfig.globalStrokeWeight);
             const geo = getOrCreateGeometry(geometryCache.hubs, hubKey, () => new THREE_ACTUAL.ExtrudeGeometry(shape, extrudeSettings));

             // Only add to layer geometries if it has vertices
             if (geo.attributes.position?.count > 0) {
               geo.rotateZ(hub.rotationOffset * Math.PI / 180);
               geo.translate(0, 0, centerZOffset);
               layerGeometries.push(geo);
             }
         });
      };

      const processAbstracts = (abstracts: AbstractConfig[]) => {
          // ... (Keep existing abstract logic but ensure centerZOffset is correct)
          const centerZOffset = -extrudeSettings.depth / 2;
          // ... (Abstract generation code - reuse logic) ...
          abstracts.filter(a => a.enabled).forEach(abs => {
               const effectiveThickness = abs.thickness + rendered3DConfig.globalStrokeWeight;
               // ... (Fractal and Shape logic - assume copied from previous context or reuse existing)
               // For brevity, using the same robust logic structure as App.tsx
               if (abs.type === 'fractal') {
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
                   let currentWidth = effectiveThickness;
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
                       // Apply boldness to fractal shapes using same approach as text
                       const fractalStrokeWeight = (config.globalStrokeWeight || 0);
                       let boldedShapes = shapes;
                       if (fractalStrokeWeight > 0.1) {
                         boldedShapes = applyBoldnessToShapes(shapes, fractalStrokeWeight);
                       }

                       const fractalGeo = new THREE_ACTUAL.ExtrudeGeometry(boldedShapes, extrudeSettings);
                       const angleStep = (Math.PI * 2) / abs.arms;

                       // Only push fractal geometries if they have vertices
                       if (fractalGeo.attributes.position?.count > 0) {
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
                   }
                   return;
               }

               // Non-fractal
               const shapePoints: THREE_ACTUAL.Vector2[] = [];
               const steps = Math.ceil(200 * qMult);
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
                   const halfThick = effectiveThickness / 2;
                   pts.forEach((pt, i) => { if (i === 0) s.moveTo(pt.x, pt.y + halfThick); else s.lineTo(pt.x, pt.y + halfThick); });
                   for(let i = pts.length-1; i >= 0; i--) { s.lineTo(pts[i].x, pts[i].y - halfThick); }
                   s.lineTo(pts[0].x, pts[0].y + halfThick);
                   return s;
               };
               const normalShape = createAbstractShape(shapePoints);
               const abstractKey = makeAbstractKey(layer.id, abs, effectiveDepth, config.bevelEnabled, bevelPerSide, config.globalStrokeWeight);
               const normalGeo = getOrCreateGeometry(geometryCache.abstracts, abstractKey + '_normal', () => new THREE_ACTUAL.ExtrudeGeometry(normalShape as any, extrudeSettings));
               const mirroredPoints = shapePoints.map((pt) => new THREE_ACTUAL.Vector2(pt.x, -pt.y));
               const mirroredShape = createAbstractShape(mirroredPoints);

               // Apply boldness to abstract shapes using same approach as text
               const abstractStrokeWeight = (config.globalStrokeWeight || 0);
               let finalNormalShape: THREE_ACTUAL.Shape | THREE_ACTUAL.ExtrudeGeometry = normalShape;
               let finalMirroredShape: THREE_ACTUAL.Shape | THREE_ACTUAL.ExtrudeGeometry = mirroredShape;

               if (abstractStrokeWeight > 0.1) {
                 const boldedNormalShapes = applyBoldnessToShapes([normalShape], abstractStrokeWeight);
                 if (boldedNormalShapes.length > 0) {
                   const tempGeo = new THREE_ACTUAL.ExtrudeGeometry(boldedNormalShapes, extrudeSettings);
                   finalNormalShape = tempGeo; // Replace with bolded version
                 }

                 if (mirroredShape) {
                   const boldedMirroredShapes = applyBoldnessToShapes([mirroredShape], abstractStrokeWeight);
                   if (boldedMirroredShapes.length > 0) {
                     const tempGeo = new THREE_ACTUAL.ExtrudeGeometry(boldedMirroredShapes as any, extrudeSettings);
                     finalMirroredShape = tempGeo; // Replace with bolded version
                   }
                 }
               }

               const mirroredGeo = getOrCreateGeometry(geometryCache.abstracts, abstractKey + '_mirrored', () => new THREE_ACTUAL.ExtrudeGeometry(finalMirroredShape as any, extrudeSettings));
               const angleStep = (Math.PI * 2) / abs.arms;

               // Only push abstract geometries if they have vertices
               if (normalGeo.attributes.position?.count > 0) {
                 for(let i=0; i<abs.arms; i++) {
                     const angle = i * angleStep + (abs.rotationOffset * Math.PI / 180);
                     const absInst = normalGeo.clone();
                     absInst.translate(0, abs.mirrorOffset/2, centerZOffset);
                     absInst.rotateZ(angle);
                     layerGeometries.push(absInst);
                     if (abs.mirrorEnabled && mirroredGeo.attributes.position?.count > 0) {
                         const mir = mirroredGeo.clone();
                         mir.translate(0, -abs.mirrorOffset/2, centerZOffset);
                         mir.rotateZ(angle);
                         layerGeometries.push(mir);
                     }
                 }
               }
          });
      };

      // ── processImages: extrude imported SVG paths as arm instances ──────
      /*
      const processImages = (images: ImageConfig[]) => {
        if (!images || images.length === 0) return;
        const centerZOffset = -extrudeSettings.depth / 2;
        const loader = new SVGLoader();

        images.filter(img => img.enabled && img.svgPaths.length > 0).forEach(img => {
          try {
            const rawW = img.svgWidth || 100;
            const rawH = img.svgHeight || 100;

            // Build SVG string — apply svgRotation and flip in SVG space first,
            // exactly mirroring what the 2D pipeline does inside its svgGroup transform.
            const svgRotDeg = img.svgRotation || 0;
            const cx = rawW / 2;
            const cy = rawH / 2;
            // Compose: rotate around centre, then optional horizontal flip about centre
            const flipAttr = img.flipEnabled
              ? `matrix(-1,0,0,1,${rawW},0)`
              : '';
            const rotateAttr = svgRotDeg !== 0
              ? `rotate(${svgRotDeg},${cx},${cy})`
              : '';
            const innerTransform = [rotateAttr, flipAttr].filter(Boolean).join(' ');
            const strokeWidth = Math.max(0, img.thickness || 0);
            const pathsStr = img.svgPaths.map(d =>
              `<path d="${d}"${strokeWidth > 0 ? ` stroke="${layer.color}" stroke-width="${strokeWidth}"` : ''}/>`
            ).join('');
            const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${rawW} ${rawH}">` +
              (innerTransform ? `<g transform="${innerTransform}">${pathsStr}</g>` : pathsStr) +
              `</svg>`;
            const svgData = loader.parse(svgStr);

            const rawShapes: THREE_ACTUAL.Shape[] = [];
            svgData.paths.forEach(p => {
              SVGLoader.createShapes(p).forEach(s => rawShapes.push(s));
            });
            if (rawShapes.length === 0) return;

            // bboxCenterY matches the 2D pipeline's bboxCenterY = rawH / 2
            // (the 2D never computes actual bbox — it uses the declared SVG dimensions)
            const bboxCenterY = rawH / 2;

            // Transform SVG space → arm space, matching the 2D pipeline exactly.
            //
            // 2D applies: scale(s, -s) then translate(innerRadius, ty)
            // In SVG transform order (left-to-right = applied to coord system):
            //   point (px, py) → (px*s + innerRadius,  -py*s + ty)
            //   where ty = yOffset + bboxCenterY*s
            //
            // IMPORTANT: The 2D does NOT rebase X to minX. It scales raw SVG coords
            // and then translates. So we must do the same — use raw px, not (px-minX).
            const s = img.scale;
            const ty3d = img.yOffset + bboxCenterY * s;
            const transformPt = (x: number, y: number): [number, number] => [
              x * s + img.innerRadius,
              -y * s + ty3d,
            ];

            const transformedShapes: THREE_ACTUAL.Shape[] = [];
            rawShapes.forEach(shape => {
              const { shape: outerPts, holes } = shape.extractPoints(16);
              const newShape = new THREE_ACTUAL.Shape(
                outerPts.map(p => { const [tx, ty] = transformPt(p.x, p.y); return new THREE_ACTUAL.Vector2(tx, ty); })
              );
              holes.forEach(hole => {
                newShape.holes.push(new THREE_ACTUAL.Path(
                  hole.map(p => { const [tx, ty] = transformPt(p.x, p.y); return new THREE_ACTUAL.Vector2(tx, ty); })
                ));
              });
              transformedShapes.push(newShape);
            });

            const shapeGeos: THREE_ACTUAL.BufferGeometry[] = transformedShapes.map(
              sh => new THREE_ACTUAL.ExtrudeGeometry(sh, extrudeSettings)
            );
            const combinedGeo = shapeGeos.length === 1
              ? shapeGeos[0]
              : BufferGeometryUtils.mergeGeometries(shapeGeos);
            if (!combinedGeo) return;

            // ── Match the 2D transform chain exactly ──────────────────────────
            // 2D per-arm (SVG transforms apply left-to-right to the coord system):
            //   rotate(angle)  →  translate(innerRadius, ty)  →  scale(s, -s)
            // Then the layer group wraps everything in scale(1, -1).
            //
            // Working through the math for a point (px, py) in SVG space:
            //   after scale(s,-s):        (px*s,        -py*s)
            //   after translate(ir, ty):  (px*s + ir,   -py*s + ty)
            //   after rotate(angle):      rotate the above around origin
            //   after layer scale(1,-1):  negate Y  →  equivalent to rotateZ(-angle)
            //
            // In 3D, transformPt already maps SVG→arm-space (X from minX, Y flipped).
            // The geometry is already at its correct XY position relative to origin.
            // We only need to rotate each arm copy by -angle (matching the 2D result
            // after the layer's scale(1,-1) flips the rotation direction).
            const angleStep = (Math.PI * 2) / img.arms;
            for (let i = 0; i < img.arms; i++) {
              const angle = i * angleStep + (img.rotationOffset * Math.PI / 180);
              const inst = combinedGeo.clone();
              inst.translate(0, img.mirrorOffset / 2, centerZOffset);
              inst.rotateZ(-angle);
              layerGeometries.push(inst);
              if (img.mirrorEnabled) {
                const mir = combinedGeo.clone();
                mir.scale(1, -1, 1);
                mir.translate(0, -img.mirrorOffset / 2, centerZOffset);
                mir.rotateZ(-angle);
                layerGeometries.push(mir);
              }
            }
          } catch (err) {
            console.warn('processImages: failed for', img.name, err);
          }
        });
      };
      */

      await processTextGroup(layer.primary);
      await processTextGroup(layer.secondary);
      processHubs(layer.hubs);
      processAbstracts(layer.abstracts);

      await updateProgress();

      if (layerGeometries.length > 0) {
        const layerPreset = getSlotPlanePreset(layersToGenerate, lIdx, config.slotMode);
        const effectiveRotationX = config.slotEnabled && layerPreset
          ? layerPreset.rotationX
          : layer.rotation3D.x;
        const effectiveRotationY = layer.rotation3D.y;

        const mergedLayerGeo = BufferGeometryUtils.mergeGeometries(layerGeometries, false);
        if (!mergedLayerGeo || !mergedLayerGeo.attributes.position || mergedLayerGeo.attributes.position.count === 0) {
          console.warn(`⚠️ Skipping empty merged geometry for layer ${layer.name}`);
          layerGeometries.forEach(g => g.dispose());
          continue;
        }

        layerGeometries.forEach((g) => {
          if (g !== mergedLayerGeo) g.dispose();
        });

        let cutSourceGeo = mergedLayerGeo;
        if (config.slotEnabled) {
          const cutLayerGeo = await applyWatertightSlotCuts(
            mergedLayerGeo,
            layer,
            lIdx,
            layersToGenerate,
            config,
            bevelPerSide
          );
          if (cutLayerGeo !== mergedLayerGeo) {
            mergedLayerGeo.dispose();
          }
          cutSourceGeo = cutLayerGeo;
        }

        const finalGeo = cutSourceGeo.clone();
        finalGeo.rotateX((effectiveRotationX * Math.PI) / 180);
        finalGeo.rotateY((effectiveRotationY * Math.PI) / 180);

        cutSourceGeo.dispose();

        if (finalGeo && finalGeo.attributes && finalGeo.attributes.position && finalGeo.attributes.position.count > 0) {
          const mesh = new THREE_ACTUAL.Mesh(finalGeo);
          mesh.userData.layerId = layer.id;
          mesh.name = layer.name;
          group.add(mesh);
        }
          // If slots are enabled, we must perform aggressive repair (merging vertices)
          // to ensure CSG operations (subtraction) work on manifold geometry.
          // However, repairGeometry(..., true) destroys the sharp normals generated by ExtrudeGeometry
          // when edge profile (bevel) is OFF.
          // Therefore, if slots are disabled (just viewing), we SKIP the initial repair to keep
          // the visual quality high (sharp caps, smooth walls).
           // When producing 3D view we should merge/repair vertices so overlapping
           // geometry fuses correctly. This reduces visual overlaps and prevents
           // floating/non-welded faces in 3D preview and exports.
           // if (viewMode === '3d') {
           //   layerMerged = BufferGeometryUtils.mergeVertices(layerMerged, 0.0001) as THREE_ACTUAL.BufferGeometry;
           // }

          // Layer geometry has already been added to the scene as a single merged mesh.

          //           // ── SLOT CUTTER VISUALIZER ──────────────────────────────────────
          //           // When slots are enabled, add each blade as a distinct semi-transparent
          //           // colored mesh so blade positions / angles can be inspected visually.
          //           // Blades are world-space already — NO layer rotation applied here.
          //           // Set to false to disable; true to re-enable for debugging.
          //           if (false && config.slotEnabled) {
          //             const BLADE_COLORS = [
          //               0xff3333, // red
          //               0xff9900, // orange
          //               0xffee00, // yellow
          //               0x33ff66, // green
          //               0x00ccff, // cyan
          //               0xcc44ff, // purple
          //               0xff66cc, // pink
          //               0x44ffee, // teal
          //             ];
          //             const bladeGeos = createSlotGeometries(
          //               layer,
          //               config.slotLength,
          //               config.slotWidth,
          //               config.extrusionDepth,
          //               config.bevelEnabled,
          //               bevelPerSide,
          //               config.layers,
          //               config.globalStrokeWeight
          //             );
          //             bladeGeos.forEach((bladeGeo, bi) => {
          //               const mat = new THREE_ACTUAL.MeshStandardMaterial({
          //                 color: BLADE_COLORS[bi % BLADE_COLORS.length],
          //                 transparent: true,
          //                 opacity: 0.45,
          //                 depthWrite: false,
          //                 side: THREE_ACTUAL.DoubleSide,
          //               });
          //               const bladeMesh = new THREE_ACTUAL.Mesh(bladeGeo, mat);
          //               bladeMesh.name = `__slotViz_${layer.name}_blade${bi}`;
          //               bladeMesh.userData.isSlotVisualizer = true;
          //               group.add(bladeMesh);
          //             });
          //           }
          //           // ── END SLOT CUTTER VISUALIZER ───────────────────────────────────
      }
      }
    onProgress(1);

    // Cache the result before returning
    modelCache3D.set(meshKey, group);
    return group;
  }, [config, rendered3DConfig, dynamicFonts, loadFont, viewMode]);

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
            // const combinedForCheck = BufferGeometryUtils.mergeGeometries(flatGeoms);
            // if (combinedForCheck) {
                // Final topology verification before export
                // const report = getTopologyReport(combinedForCheck);
                // console.log(`📊 Final Export Topology Report:`, report);

                // if (!report.isManifold) {
                //     console.warn(`⚠️ Export has ${report.nonManifoldEdges} non-manifold edges`);
                //
                //     // Skip aggressive repair to prevent freezing during export
                //     if (report.nonManifoldEdges > 100) {
                //         console.log('🔨 Skipping aggressive repair for export to prevent freezing');
                //         console.log(`📝 Geometry has ${report.nonManifoldEdges} non-manifold edges but is still exportable`);
                //         // const repaired = surgicalSlotRepair(combinedForCheck); // Disabled to prevent freeze
                //         // Update the merged geometry with repaired version
                //         // for (let i = 0; i < flatGeoms.length; i++) {
                //         //     flatGeoms[i] = repaired;
                //         // }
                //     }
                // }

                // const isConnected = checkConnectivity(combinedForCheck);
                // if (!isConnected) {
                //     const confirmExport = window.confirm(
                //         "⚠️ CRITICAL WARNING: Floating Bodies Detected\n\n" +
                //         "The generated mesh contains disconnected parts (floating bodies).\n" +
                //         "This usually happens when letters or rings don't overlap properly.\n\n" +
                //         "This print may fail. Do you still want to export?"
                //     );
                //     if (!confirmExport) {
                //         setExportLoading(false);
                //         return;
                //     }
                // }
            // }
        }

        const exporter = new STLExporter();
        const result = exporter.parse(group, { binary: true });
        const blob = new Blob([result], { type: 'application/octet-stream' });
        const qLabel = quality ? `_${quality}` : '';
        downloadBlob(blob, `${config.projectName}${qLabel}.stl`);
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
          // const exporter = new STLExporter();

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

          const exporter = new STLExporter();
          group.children.forEach(child => {
              if (child instanceof THREE_ACTUAL.Mesh) {
                  const result = exporter.parse(child, { binary: true });
                  const data = result as ArrayBuffer;
                  const qLabel = quality ? `_${quality}` : '';
                  zip.file(`${config.projectName}_${child.name.replace(/\s+/g, '_')}${qLabel}.stl`, data);
              }
          });

          const content = await zip.generateAsync({ type: 'blob' });
          const qLabel = quality ? `_${quality}` : '';
          downloadBlob(content, `${config.projectName}_All_Planes${qLabel}.zip`);
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

  const handleResetApp = () => {
    // Show confirmation dialog
    if (window.confirm('Are you sure you want to reset all settings to defaults?\n\nThis will restore all variables, tabs, and configurations to their initial state.\n\nYour shortcut preferences will be preserved.')) {
      // Store current shortcuts to preserve them
      const currentShortcuts = shortcuts;
      const currentLanguage = language;
      const currentShowTooltips = showTooltips;
      
      // Reset all configs to initial state
      const freshConfig = { ...initialState };
      setConfig(freshConfig);
      setConfig3D(freshConfig);
      setRendered3DConfig(freshConfig);
      
      // Reset history
      setHistory([freshConfig]);
      setHistoryIndex(0);
      
      // Reset other states
      setActiveTab('text');
      setDesignDiameter(0);
      
      // Clear caches
      clearGeometryCache();
      
      // Restore shortcuts and settings (preserve user preferences)
      setShortcuts(currentShortcuts);
      setLanguage(currentLanguage);
      setShowTooltips(currentShowTooltips);
      
      showNotification('All settings have been reset to defaults!', 'success');
    }
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

  // Helper to normalize hub objects from AI API responses with proper defaults
  const normalizeHubs = (hubs: any[]): HubConfig[] => {
    if (!Array.isArray(hubs)) return [];
    return hubs.map((h: any) => ({
      id: h.id || `hub-${Date.now()}-${Math.random()}`,
      enabled: h.enabled !== undefined ? h.enabled : true,
      shape: h.shape || 'circle',
      sides: h.sides || 6,
      outerRadius: h.outerRadius || 20,
      hollow: h.hollow !== undefined ? h.hollow : true,
      wallThickness: h.wallThickness ?? 0.5,
      starRatio: h.starRatio ?? 0.5,
      rotationOffset: h.rotationOffset ?? 0,  // FIX: Default to 0 if undefined
      oscillationEnabled: h.oscillationEnabled !== undefined ? h.oscillationEnabled : false,
      oscillationAmplitude: h.oscillationAmplitude ?? 5,
      oscillationFrequency: h.oscillationFrequency ?? 6,
    }));
  };

  // Helper to normalize abstract objects from AI API responses with proper defaults
  const normalizeAbstracts = (abstracts: any[]): AbstractConfig[] => {
    if (!Array.isArray(abstracts)) return [];
    return abstracts.map((a: any) => ({
      id: a.id || `abstract-${Date.now()}-${Math.random()}`,
      enabled: a.enabled !== undefined ? a.enabled : true,
      type: (a.type || a.shape || 'line') as 'line' | 'sine' | 'zigzag' | 'fractal',
      arms: a.arms ?? 6,
      rotationOffset: a.rotationOffset ?? a.rotation ?? 0,
      innerRadius: a.innerRadius ?? 10,
      outerRadius: a.outerRadius ?? 50,
      amplitude: a.amplitude ?? 5,
      frequency: a.frequency ?? 1,
      thickness: a.thickness ?? a.strokeWidth ?? 1,
      mirrorEnabled: a.mirrorEnabled ?? false,
      mirrorOffset: a.mirrorOffset ?? 0,
    }));
  };

  const handleAiPolish = async (mode: '3d' | '2d' | 'fractal', reset: boolean = false) => {
  const apiKey = getApiKey();
  if (!apiKey) {
    setShortcutsModalTab('apikey');
    setShortcutsModalMessage('No API key found. Add your Gemini API key to use AI randomization.');
    setShowShortcutsModal(true);
    return;
  }

  // Load AI scope preferences
  const aiScope = loadAiScope();
  console.log('🔧 AI Scope loaded:', aiScope);

  // Feature switch guard: do not start fractal mode when fractals are disabled.
  if (mode === 'fractal' && !aiScope.abstractFractalsTabEnabled) {
    showNotification('Fractal mode is disabled in AI Controls, so generation was canceled.', 'warning');
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
    const ai = new GoogleGenAI({ apiKey });
    const model = 'gemini-3-flash-preview';

    const availableFonts = CURSIVE_FONTS.map(f => f.name).join(', ');

    let configContext = config;

    // Handle Reset: Clear to clean state but preserve layer structure
    if (reset) {
        const resetLayer1 = createDefaultLayer('layer-1', 'Base Plane', 0, 0, true);
        resetLayer1.slotType = 'half-back';

        const resetLayer2 = createDefaultLayer('layer-2', 'Cross Plane', 120, 0, true);
        resetLayer2.slotType = 'half-front';

        const resetLayer3 = createDefaultLayer('layer-4', 'Tilt Plane', 240, 0, true);
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

    // Build scope constraint instructions from user preferences
    const scopeLines: string[] = [];
    if (!aiScope.globalTabEnabled) {
      scopeLines.push('- Do NOT change color, extrusionDepth, globalStrokeWeight, or bevel settings. Keep them at their current values.');
    } else {
      if (!aiScope.color)              scopeLines.push('- Do NOT change the color field.');
      if (!aiScope.extrusionDepth)     scopeLines.push('- Do NOT change extrusionDepth.');
      if (!aiScope.globalStrokeWeight) scopeLines.push('- Do NOT change globalStrokeWeight.');
      if (!aiScope.bevelSettings)      scopeLines.push('- Do NOT change bevelEnabled, bevelType, bevelAmount, or bevelSegments.');
    }
    if (!aiScope.textTabEnabled) {
      scopeLines.push('- Do NOT modify any text/primary/secondary group properties. Keep them exactly as provided.');
    } else {
      if (!aiScope.textContent)    scopeLines.push('- Do NOT change the text content (primary.text / secondary.text).');
      if (!aiScope.fontFamily)     scopeLines.push('- Do NOT change fontFamily.');
      if (!aiScope.arms)           scopeLines.push('- Do NOT change the arms count.');
      if (!aiScope.innerRadius)    scopeLines.push('- Do NOT change textX (inner radius).');
      if (!aiScope.letterSpacing)  scopeLines.push('- Do NOT change letterSpacing.');
      if (!aiScope.boldness)       scopeLines.push('- Do NOT change thickness (per-text boldness).');
      if (!aiScope.mirrorEffect)   scopeLines.push('- Do NOT change mirrorEnabled or mirrorOffset.');
      if (!aiScope.rotationOffset) scopeLines.push('- Do NOT change rotationOffset.');
      if (!aiScope.underline)      scopeLines.push('- Do NOT change underline settings.');
      if (!aiScope.secondaryGroup) scopeLines.push('- Do NOT change the secondary text group. Keep it as-is.');
      
      // Filter to only enabled word candidates
      const enabledPrimaryWords = aiScope.textPrimaryWords.filter(w => aiScope.textPrimaryWordsEnabled[w] !== false);
      if (enabledPrimaryWords.length > 0) {
        scopeLines.push(`- Prefer using primary phrase candidates: ${enabledPrimaryWords.slice(0, 10).join(', ')}${enabledPrimaryWords.length > 10 ? ', ...' : ''}.`);
      }
      const enabledSecondaryWords = aiScope.textSecondaryWords.filter(w => aiScope.textSecondaryWordsEnabled[w] !== false);
      if (enabledSecondaryWords.length > 0) {
        scopeLines.push(`- Prefer using secondary phrase candidates: ${enabledSecondaryWords.slice(0, 10).join(', ')}${enabledSecondaryWords.length > 10 ? ', ...' : ''}.`);
      }
    }
    if (!aiScope.hubsTabEnabled) {
      scopeLines.push('- Do NOT add or modify any hubs. Set hubs to an empty array [].');
    } else {
      if (!aiScope.hubEnabled)    scopeLines.push('- Do NOT enable any hub (keep all hub enabled=false).');
      if (!aiScope.hubShape)      scopeLines.push('- Do NOT change hub shape.');
      if (!aiScope.hubRadius)     scopeLines.push('- Do NOT change hub outerRadius.');
      if (!aiScope.hubHollow)     scopeLines.push('- Do NOT change hub hollow setting.');
      if (!aiScope.hubOscillation)scopeLines.push('- Do NOT enable hub oscillation.');
    }
    if (!aiScope.abstractShapesTabEnabled) {
      scopeLines.push('- Do NOT add or modify any abstract shapes. Keep abstract shape definitions unchanged.');
    } else {
      if (!aiScope.abstractType)        scopeLines.push('- Do NOT change abstract type.');
      if (!aiScope.abstractInnerRadius) scopeLines.push('- Do NOT change abstract innerRadius.');
      if (!aiScope.abstractOuterRadius) scopeLines.push('- Do NOT change abstract outerRadius.');
      if (!aiScope.abstractBoldness)    scopeLines.push('- Do NOT change abstract thickness/boldness.');
      if (!aiScope.abstractArms)        scopeLines.push('- Do NOT change abstract arms count.');
      
      // Shape type restrictions
      const allowedShapeTypes: string[] = [];
      if (aiScope.abstractAllowLine) allowedShapeTypes.push('line');
      if (aiScope.abstractAllowSine) allowedShapeTypes.push('sine');
      if (aiScope.abstractAllowZigzag) allowedShapeTypes.push('zigzag');
      
      if (allowedShapeTypes.length === 0) {
        scopeLines.push('- Do NOT generate any non-fractal abstract shapes (no line, sine, or zigzag allowed).');
      } else if (allowedShapeTypes.length < 3) {
        scopeLines.push(`- For non-fractal abstracts, only use these shape types: ${allowedShapeTypes.join(', ')}.`);
      }
    }
    if (!aiScope.abstractFractalsTabEnabled) {
      scopeLines.push('- Do NOT add or modify any fractal abstract elements. Keep fractals disabled.');
    } else {
      if (!aiScope.fractalTrunkLength)    scopeLines.push('- Do NOT change fractal trunkLength.');
      if (!aiScope.fractalBranchesPerNode) scopeLines.push('- Do NOT change fractal branchesPerNode.');
      if (!aiScope.fractalRecursionDepth) scopeLines.push('- Do NOT change fractal recursionDepth.');
      if (!aiScope.fractalMinBranchLength) scopeLines.push('- Do NOT change fractal minBranchLength.');
      if (!aiScope.fractalBranchPattern) scopeLines.push('- Do NOT change fractal branchPattern.');
      if (!aiScope.fractalBranchAngle)   scopeLines.push('- Do NOT change fractal branchAngle.');
      if (!aiScope.fractalInitialLength) scopeLines.push('- Do NOT change fractal initialLength.');
      if (!aiScope.fractalLengthDecay)   scopeLines.push('- Do NOT change fractal lengthDecay.');
      if (!aiScope.fractalAngleVariation) scopeLines.push('- Do NOT change fractal angleVariation.');
      if (!aiScope.fractalLengthVariation) scopeLines.push('- Do NOT change fractal lengthVariation.');
      if (!aiScope.fractalThicknessDecay) scopeLines.push('- Do NOT change fractal thicknessDecay.');
      if (!aiScope.fractalRoundedTips)   scopeLines.push('- Do NOT change fractal roundedTips.');
      if (!aiScope.fractalRandomSeed)    scopeLines.push('- Do NOT change fractal randomSeed.');
    }

    if (!aiScope.abstractFractalsTabEnabled) {
      scopeLines.push('- Do NOT generate fractal abstracts.');
    }
    if (!aiScope.abstractShapesTabEnabled) {
      scopeLines.push('- Do NOT generate any hubs or abstract shapes.');
    }
    const scopeConstraints = scopeLines.length > 0
      ? `\n      **USER SCOPE RESTRICTIONS — YOU MUST FOLLOW THESE EXACTLY:**\n${scopeLines.map(l => `      ${l}`).join('\n')}\n`
      : '';
    console.log('🔧 AI Scope constraints built:', scopeLines);
    console.log('🔧 Feature toggles: enableShape=', aiScope.abstractShapesTabEnabled, 'enableFractals=', aiScope.abstractFractalsTabEnabled);

    const prompt = `
      Generate a randomized Snowflake Generator Configuration (JSON).

      **CRITICAL CONSTRAINTS:**
      1. **Only define the design for the FIRST layer (Base Plane).**
      2. The design will be automatically applied to the other 2 planes by the app.
      3. Set 'activeLayerIndex' to 0.
      ${mode !== 'fractal' ? `4. Use a random cursive font from this list: [${availableFonts}].` : ''}
      ${scopeConstraints}

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
    console.log('🤖 AI Prompt (first 500 chars):', prompt.substring(0, 500) + '...');

    const response = await ai.models.generateContent({
      model,
      contents: [
          { role: 'user', parts: [{ text: prompt }] },
          { role: 'user', parts: [{ 
              text: JSON.stringify({
                  // Send only essential context - reduces tokens by ~40%
                  // This optimization speeds up API calls by ~15-20%
                  color: configContext.color,
                  layers: [{
                      primary: configContext.layers[0]?.primary,
                      secondary: configContext.layers[0]?.secondary,
                  }],
                  syncAllLayers: configContext.syncAllLayers,
              })
          }] }
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
            hubs: normalizeHubs(generatedLayer.hubs || []),
            abstracts: normalizeAbstracts(generatedLayer.abstracts || [])
        };

        // Enforce AI scope overrides in case the model ignored instructions
        const originalLayer = configContext.layers[0];
        if (originalLayer) {
          // Global-level protection
          if (!aiScope.globalTabEnabled) {
            // reset all global fields
            configContext.color = configContext.color;
            configContext.extrusionDepth = configContext.extrusionDepth;
            configContext.globalStrokeWeight = configContext.globalStrokeWeight;
            configContext.bevelEnabled = configContext.bevelEnabled;
            configContext.bevelType = configContext.bevelType;
            configContext.bevelAmount = configContext.bevelAmount;
            configContext.bevelSegments = configContext.bevelSegments;
          } else {
            if (!aiScope.color)           configContext.color = configContext.color;
            if (!aiScope.extrusionDepth)  configContext.extrusionDepth = configContext.extrusionDepth;
            if (!aiScope.globalStrokeWeight) configContext.globalStrokeWeight = configContext.globalStrokeWeight;
            if (!aiScope.bevelSettings) {
              configContext.bevelEnabled = configContext.bevelEnabled;
              configContext.bevelType = configContext.bevelType;
              configContext.bevelAmount = configContext.bevelAmount;
              configContext.bevelSegments = configContext.bevelSegments;
            }
          }

          // Handle text controls
          if (!aiScope.textTabEnabled) {
            currentLayers[0].primary = originalLayer.primary;
            currentLayers[0].secondary = originalLayer.secondary;
          } else {
            if (!aiScope.textContent) {
              currentLayers[0].primary.text = originalLayer.primary.text;
              currentLayers[0].secondary.text = originalLayer.secondary.text;
            }
            if (!aiScope.fontFamily) {
              currentLayers[0].primary.fontFamily = originalLayer.primary.fontFamily;
              currentLayers[0].secondary.fontFamily = originalLayer.secondary.fontFamily;
            }
            if (!aiScope.arms) {
              currentLayers[0].primary.arms = originalLayer.primary.arms;
              currentLayers[0].secondary.arms = originalLayer.secondary.arms;
            }
            if (!aiScope.innerRadius) {
              currentLayers[0].primary.textX = originalLayer.primary.textX;
              currentLayers[0].secondary.textX = originalLayer.secondary.textX;
            }
            if (!aiScope.letterSpacing) {
              currentLayers[0].primary.letterSpacing = originalLayer.primary.letterSpacing;
              currentLayers[0].secondary.letterSpacing = originalLayer.secondary.letterSpacing;
            }
            if (!aiScope.boldness) {
              currentLayers[0].primary.thickness = originalLayer.primary.thickness;
              currentLayers[0].secondary.thickness = originalLayer.secondary.thickness;
            }
            if (!aiScope.mirrorEffect) {
              currentLayers[0].primary.mirrorEnabled = originalLayer.primary.mirrorEnabled;
              currentLayers[0].secondary.mirrorEnabled = originalLayer.secondary.mirrorEnabled;
              currentLayers[0].primary.mirrorOffset = originalLayer.primary.mirrorOffset;
              currentLayers[0].secondary.mirrorOffset = originalLayer.secondary.mirrorOffset;
            }
            if (!aiScope.rotationOffset) {
              currentLayers[0].primary.rotationOffset = originalLayer.primary.rotationOffset;
              currentLayers[0].secondary.rotationOffset = originalLayer.secondary.rotationOffset;
            }
            if (!aiScope.underline) {
              currentLayers[0].primary.underline = originalLayer.primary.underline;
              currentLayers[0].secondary.underline = originalLayer.secondary.underline;
            }
            if (!aiScope.secondaryGroup) {
              currentLayers[0].secondary = originalLayer.secondary;
            }
          }

          // Hubs controls
          if (!aiScope.hubsTabEnabled || !aiScope.hubEnabled || !aiScope.hubShape || !aiScope.hubRadius || !aiScope.hubHollow || !aiScope.hubOscillation) {
            currentLayers[0].hubs = originalLayer.hubs;
          }

          // Abstract controls
          if (!aiScope.abstractShapesTabEnabled || !aiScope.abstractType || !aiScope.abstractInnerRadius || !aiScope.abstractOuterRadius || !aiScope.abstractBoldness || !aiScope.abstractArms) {
            currentLayers[0].abstracts = originalLayer.abstracts;
          } else {
            // Filter out disallowed shape types
            const allowedShapeTypes = new Set<string>();
            if (aiScope.abstractAllowLine) allowedShapeTypes.add('line');
            if (aiScope.abstractAllowSine) allowedShapeTypes.add('sine');
            if (aiScope.abstractAllowZigzag) allowedShapeTypes.add('zigzag');
            
            if (allowedShapeTypes.size < 3) {
              // Some shape types are disallowed - filter them out
              currentLayers[0].abstracts = currentLayers[0].abstracts.filter((a: any) => 
                a.type === 'fractal' || allowedShapeTypes.has(a.type)
              );
            }
          }
          if (!aiScope.abstractFractalsTabEnabled || 
              !aiScope.fractalTrunkLength || !aiScope.fractalBranchesPerNode || !aiScope.fractalRecursionDepth || 
              !aiScope.fractalMinBranchLength || !aiScope.fractalBranchPattern || !aiScope.fractalBranchAngle || 
              !aiScope.fractalInitialLength || !aiScope.fractalLengthDecay || !aiScope.fractalAngleVariation || 
              !aiScope.fractalLengthVariation || !aiScope.fractalThicknessDecay || !aiScope.fractalRoundedTips || 
              !aiScope.fractalRandomSeed) {
            currentLayers[0].abstracts = currentLayers[0].abstracts.filter((a: any) => a.type !== 'fractal');
          }

          // Additional feature toggles
          if (!aiScope.abstractShapesTabEnabled) {
            currentLayers[0].hubs = originalLayer.hubs;
            currentLayers[0].abstracts = originalLayer.abstracts;
          }
          if (!aiScope.abstractFractalsTabEnabled) {
            currentLayers[0].abstracts = currentLayers[0].abstracts.filter((a: any) => a.type !== 'fractal');
          }

          // Prevent AI from enabling/altering secondary group if it was disabled
          if (!originalLayer.secondary.enabled) {
            currentLayers[0].secondary = originalLayer.secondary;
          }
        }

        // Debug: report which fields were allowed and which changed
        const allowedFields: string[] = [];
        const changedFields: string[] = [];
        const safeEqual = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);

        if (aiScope.globalTabEnabled) {
          if (aiScope.color) allowedFields.push('color');
          if (aiScope.extrusionDepth) allowedFields.push('extrusionDepth');
          if (aiScope.globalStrokeWeight) allowedFields.push('globalStrokeWeight');
          if (aiScope.bevelSettings) {
            allowedFields.push('bevelEnabled', 'bevelType', 'bevelAmount', 'bevelSegments');
          }
        }

        if (aiScope.textTabEnabled) {
          if (aiScope.textContent) allowedFields.push('primary.text', 'secondary.text');
          if (aiScope.fontFamily) allowedFields.push('primary.fontFamily', 'secondary.fontFamily');
          if (aiScope.arms) allowedFields.push('primary.arms', 'secondary.arms');
          if (aiScope.innerRadius) allowedFields.push('primary.textX', 'secondary.textX');
          if (aiScope.letterSpacing) allowedFields.push('primary.letterSpacing', 'secondary.letterSpacing');
          if (aiScope.boldness) allowedFields.push('primary.thickness', 'secondary.thickness');
          if (aiScope.mirrorEffect) allowedFields.push('primary.mirrorEnabled', 'secondary.mirrorEnabled', 'primary.mirrorOffset', 'secondary.mirrorOffset');
          if (aiScope.rotationOffset) allowedFields.push('primary.rotationOffset', 'secondary.rotationOffset');
          if (aiScope.underline) allowedFields.push('primary.underline', 'secondary.underline');
          if (aiScope.secondaryGroup) allowedFields.push('secondary');
        }

        if (aiScope.hubsTabEnabled && aiScope.hubEnabled && aiScope.hubShape && aiScope.hubRadius && aiScope.hubHollow && aiScope.hubOscillation) {
          allowedFields.push('hubs');
        }

        if (aiScope.abstractShapesTabEnabled && aiScope.abstractType && aiScope.abstractInnerRadius && aiScope.abstractOuterRadius && aiScope.abstractBoldness && aiScope.abstractArms && (aiScope.abstractAllowLine || aiScope.abstractAllowSine || aiScope.abstractAllowZigzag)) {
          allowedFields.push('abstracts');
        }
        if (aiScope.abstractFractalsTabEnabled && 
            aiScope.fractalTrunkLength && aiScope.fractalBranchesPerNode && aiScope.fractalRecursionDepth && 
            aiScope.fractalMinBranchLength && aiScope.fractalBranchPattern && aiScope.fractalBranchAngle && 
            aiScope.fractalInitialLength && aiScope.fractalLengthDecay && aiScope.fractalAngleVariation && 
            aiScope.fractalLengthVariation && aiScope.fractalThicknessDecay && aiScope.fractalRoundedTips && 
            aiScope.fractalRandomSeed) {
          allowedFields.push('abstracts');
        }
        if (aiScope.abstractShapesTabEnabled) {
          allowedFields.push('hubs', 'abstracts');
        }
        if (aiScope.abstractFractalsTabEnabled) {
          allowedFields.push('abstracts');
        }

        const finalLayer = currentLayers[0];
        const checkIfChanged = (path: string, before: any, after: any) => {
          if (!safeEqual(before, after)) {
            changedFields.push(path);
          }
        };

        if (allowedFields.includes('color')) checkIfChanged('color', configContext.color, configContext.color); // no change in this function
        if (allowedFields.includes('extrusionDepth')) checkIfChanged('extrusionDepth', configContext.extrusionDepth, configContext.extrusionDepth);
        if (allowedFields.includes('globalStrokeWeight')) checkIfChanged('globalStrokeWeight', configContext.globalStrokeWeight, configContext.globalStrokeWeight);
        if (allowedFields.includes('bevelEnabled')) checkIfChanged('bevelEnabled', configContext.bevelEnabled, configContext.bevelEnabled);
        if (allowedFields.includes('bevelType')) checkIfChanged('bevelType', configContext.bevelType, configContext.bevelType);
        if (allowedFields.includes('bevelAmount')) checkIfChanged('bevelAmount', configContext.bevelAmount, configContext.bevelAmount);
        if (allowedFields.includes('bevelSegments')) checkIfChanged('bevelSegments', configContext.bevelSegments, configContext.bevelSegments);

        const beforePrimary = originalLayer.primary;
        const beforeSecondary = originalLayer.secondary;

        const checkField = (flag: string, fieldName: string, beforeVal: any, afterVal: any) => {
          if (allowedFields.includes(flag)) checkIfChanged(fieldName, beforeVal, afterVal);
        };

        if (aiScope.textTabEnabled) {
          checkField('primary.text', 'primary.text', beforePrimary.text, finalLayer.primary.text);
          checkField('secondary.text', 'secondary.text', beforeSecondary.text, finalLayer.secondary.text);
          checkField('primary.fontFamily', 'primary.fontFamily', beforePrimary.fontFamily, finalLayer.primary.fontFamily);
          checkField('secondary.fontFamily', 'secondary.fontFamily', beforeSecondary.fontFamily, finalLayer.secondary.fontFamily);
          checkField('primary.arms', 'primary.arms', beforePrimary.arms, finalLayer.primary.arms);
          checkField('secondary.arms', 'secondary.arms', beforeSecondary.arms, finalLayer.secondary.arms);
          checkField('primary.textX', 'primary.textX', beforePrimary.textX, finalLayer.primary.textX);
          checkField('secondary.textX', 'secondary.textX', beforeSecondary.textX, finalLayer.secondary.textX);
          checkField('primary.letterSpacing', 'primary.letterSpacing', beforePrimary.letterSpacing, finalLayer.primary.letterSpacing);
          checkField('secondary.letterSpacing', 'secondary.letterSpacing', beforeSecondary.letterSpacing, finalLayer.secondary.letterSpacing);
          checkField('primary.thickness', 'primary.thickness', beforePrimary.thickness, finalLayer.primary.thickness);
          checkField('secondary.thickness', 'secondary.thickness', beforeSecondary.thickness, finalLayer.secondary.thickness);
          checkField('primary.mirrorEnabled', 'primary.mirrorEnabled', beforePrimary.mirrorEnabled, finalLayer.primary.mirrorEnabled);
          checkField('secondary.mirrorEnabled', 'secondary.mirrorEnabled', beforeSecondary.mirrorEnabled, finalLayer.secondary.mirrorEnabled);
          checkField('primary.mirrorOffset', 'primary.mirrorOffset', beforePrimary.mirrorOffset, finalLayer.primary.mirrorOffset);
          checkField('secondary.mirrorOffset', 'secondary.mirrorOffset', beforeSecondary.mirrorOffset, finalLayer.secondary.mirrorOffset);
          checkField('primary.rotationOffset', 'primary.rotationOffset', beforePrimary.rotationOffset, finalLayer.primary.rotationOffset);
          checkField('secondary.rotationOffset', 'secondary.rotationOffset', beforeSecondary.rotationOffset, finalLayer.secondary.rotationOffset);
          checkField('primary.underline', 'primary.underline', beforePrimary.underline, finalLayer.primary.underline);
          checkField('secondary.underline', 'secondary.underline', beforeSecondary.underline, finalLayer.secondary.underline);
          if (aiScope.secondaryGroup) {
            if (!safeEqual(beforeSecondary, finalLayer.secondary)) changedFields.push('secondary');
          }
        }

        if (allowedFields.includes('hubs')) {
          if (!safeEqual(originalLayer.hubs, finalLayer.hubs)) changedFields.push('hubs');
        }

        if (allowedFields.includes('abstracts')) {
          if (!safeEqual(originalLayer.abstracts, finalLayer.abstracts)) changedFields.push('abstracts');
        }

        console.log('🔍 AI scope debug: allowed fields', allowedFields);
        console.log('🔍 AI scope debug: changed fields', changedFields);

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
                hubs: JSON.parse(JSON.stringify(normalizeHubs(currentLayers[0].hubs))),
                abstracts: JSON.parse(JSON.stringify(normalizeAbstracts(currentLayers[0].abstracts))),
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

  } catch (err: any) {
    console.error("AI Polish error:", err);
    
    // Detailed error message based on error type
    let errorMessage = "AI generation failed. Please try again.";
    let errorDetails = "";
    
    // Check error message for specific issues
    const errorText = String(err?.message || err?.toString() || "").toLowerCase();
    
    // Invalid API Key
    if (errorText.includes('invalid') || errorText.includes('unauthorized') || errorText.includes('unauthenticated') || errorText.includes('api_key')) {
      errorMessage = "❌ Invalid API Key";
      errorDetails = "Your Gemini API key is invalid or expired. Please update it in Settings > API Key tab.";
      setShortcutsModalTab('apikey');
      setShortcutsModalMessage('The API key you provided is invalid or expired. Please update it.');
      setShowShortcutsModal(true);
    }
    // API Usage / Quota Exceeded
    else if (errorText.includes('quota') || errorText.includes('limit') || errorText.includes('rate') || errorText.includes('usage')) {
      errorMessage = "⚠️ API Limit Reached";
      errorDetails = "You've used up your free Gemini API quota for today. Try again tomorrow or upgrade your plan.";
    }
    // Timeout / Network Error
    else if (errorText.includes('timeout') || errorText.includes('deadline') || errorText.includes('network') || errorText.includes('econnrefused') || errorText.includes('enotfound')) {
      errorMessage = "⏱️ Connection Failed";
      errorDetails = "The AI service took too long to respond or your internet connection is unstable. Check your connection and try again.";
    }
    // Leaked or compromised API key
    else if (errorText.includes('leaked') || errorText.includes('compromised') || errorText.includes('exposed')) {
      errorMessage = "🔒 Security Alert";
      errorDetails = "Your API key appears to be compromised. Please regenerate it immediately from Google Cloud Console.";
      setShortcutsModalTab('apikey');
      setShortcutsModalMessage('Your API key has been flagged as compromised. You must regenerate it immediately.');
      setShowShortcutsModal(true);
    }
    // API Error / Service Issue
    else if (errorText.includes('error') && (errorText.includes('server') || errorText.includes('internal') || errorText.includes('api'))) {
      errorMessage = "🔧 AI Service Error";
      errorDetails = "The Gemini AI service is experiencing issues. This isn't your fault - try again in a few moments.";
    }
    // JSON parsing / Invalid response
    else if (errorText.includes('json') || errorText.includes('parse') || errorText.includes('unexpected') || errorText.includes('syntaxerror')) {
      errorMessage = "⚠️ Invalid AI Response";
      errorDetails = "The AI generated content that wasn't properly formatted. This happens sometimes - just try generating again.";
    }
    // No API key at all
    else if (errorText.includes('no api') || errorText.includes('missing api')) {
      errorMessage = "🔑 No API Key";
      errorDetails = "You need to add your Gemini API key to use AI features. Get one free from Google AI Studio.";
      setShortcutsModalTab('apikey');
      setShortcutsModalMessage('You need to add your Gemini API key to use AI randomization.');
      setShowShortcutsModal(true);
    }
    // Content policy violation
    else if (errorText.includes('policy') || errorText.includes('blocked') || errorText.includes('safety') || errorText.includes('inappropriate')) {
      errorMessage = "🚫 Content Blocked";
      errorDetails = "The AI couldn't generate content due to safety policies. Try different parameters or wording.";
    }
    // Model unavailable
    else if (errorText.includes('model') || errorText.includes('unavailable') || errorText.includes('deprecated')) {
      errorMessage = "🤖 AI Model Unavailable";
      errorDetails = "The AI model is temporarily unavailable or being updated. Try again in a few minutes.";
    }
    // Generic API errors
    else if (errorText.includes('400') || errorText.includes('bad request')) {
      errorMessage = "📝 Invalid Request";
      errorDetails = "The AI received an invalid request. This might be a bug - try different settings.";
    }
    else if (errorText.includes('500') || errorText.includes('internal server')) {
      errorMessage = "💥 Server Error";
      errorDetails = "The AI servers are having problems. This isn't your fault - try again later.";
    }
    else if (errorText.includes('503') || errorText.includes('service unavailable')) {
      errorMessage = "⚠️ Service Busy";
      errorDetails = "The AI service is overloaded with requests. Wait a moment and try again.";
    }
    
    // If we have specific error details, format them nicely
    const fullMessage = errorDetails ? `${errorMessage}: ${errorDetails}` : errorMessage;
    
    // Log full error details for debugging
    if (err?.status || err?.code) {
      console.error(`Error Code: ${err.status || err.code}`);
    }
    if (err?.error) {
      console.error(`API Error Details:`, err.error);
    }
    
    handleError(err, "AI Polish");
    showNotification(fullMessage, "error", 8000);  // Show for 8 seconds for better readability
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
    toggleView: () => {
      const newMode = viewMode === '2d' ? '3d' : '2d';
      setViewMode(newMode);
      // When switching to 3D view, immediately sync the current config to ensure changes are visible
      if (newMode === '3d') {
        // Clear any pending debounced updates to avoid conflicts
        if (debounceTimer.current) {
          clearTimeout(debounceTimer.current);
          debounceTimer.current = null;
        }
        setRendered3DIfChanged(config);
      }
    },
    forceRegenerate: () => {
        clearGeometryCache();
        setRendered3DIfChanged(config);
        showNotification("Models Regenerated", "info", 1000);
    },
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
    // switchToImagesTab is not defined in ShortcutConfig
    resetApp: handleResetApp,
    forceUpdate3D: () => {
        setRendered3DIfChanged(config);
        showNotification("3D Model Updated", "info", 1000);
    }
  });

  // Debug: Track render completion
  // (render logging removed — was calling performance.now() + console.log on every render)

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
                            onResetApp={handleResetApp}
                            // onAbout={handleAbout}  // Add About handler - Temporarily commented out
                            shortcuts={shortcuts}
                            onUpdateShortcuts={(s) => setShortcuts(s)}
                            onResetShortcuts={() => setShortcuts(DEFAULT_SHORTCUTS)}
                            language={language}
                            onLanguageChange={(lang) => setLanguage(lang)}
                            showTooltips={showTooltips}
                            onTooltipsChange={(show) => setShowTooltips(show)}
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
                        updateImages={updateImages}
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
                        setViewMode={setViewMode}
                        undo={undo}
                        redo={redo}
                        canUndo={canUndo}
                        canRedo={canRedo}
                        shortcuts={shortcuts}
                        onUpdateShortcuts={(s) => setShortcuts(s)}
                        onResetShortcuts={() => setShortcuts(DEFAULT_SHORTCUTS)}
                        onOpenShortcutsModal={(tab, message) => {
                            setShortcutsModalTab(tab);
                            if (message) setShortcutsModalMessage(message);
                            setShowShortcutsModal(true);
                        }}
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
                            fontsPreloaded={fontsPreloaded}
                        />
                    </div>
                    <div className={`absolute inset-0 w-full h-full transition-opacity duration-300 ${viewMode === '3d' ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}>
                        <Snowflake3D
                            config={config}
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
                            2D
                        </button>
                        <button
                            onClick={() => {
                              setRendered3DIfChanged(config);
                              setViewMode('3d');
                            }}
                            className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase transition-all ${viewMode === '3d' ? 'bg-sky-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                        >
                            3D
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

            {/* Shortcuts Modal */}
            <ShortcutsModal
                isOpen={showShortcutsModal}
                onClose={() => setShowShortcutsModal(false)}
                config={shortcuts}
                onSave={setShortcuts}
                onReset={() => setShortcuts(DEFAULT_SHORTCUTS)}
                activeTab={shortcutsModalTab}
                message={shortcutsModalMessage}
            />

            {/* Notifications */}
            <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
                {notifications.map(n => (
                    <div key={n.id} className={`pointer-events-auto px-4 py-3 rounded-lg shadow-xl border text-xs font-bold text-white animate-in slide-in-from-right duration-300 ${n.type === 'error' ? 'bg-rose-600 border-rose-500' : (n.type === 'success' ? 'bg-emerald-600 border-emerald-500' : 'bg-slate-800 border-white/10')}`}>
                        {n.message}
                    </div>
                ))}
            </div>

            {/* Update Notification */}
            <UpdateNotification currentVersion="1.0.4" />
        </div>
    );
  };

export default App;
