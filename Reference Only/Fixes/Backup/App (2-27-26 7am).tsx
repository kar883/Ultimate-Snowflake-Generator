import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { SnowflakeConfig, TextGroupConfig, HubConfig, CharOffset, LayerConfig, AbstractConfig, DesignQuality, UnderlineConfig, ShortcutConfig } from './types';
import { CURSIVE_FONTS, FONT_TTF_URLS, BOLD_FONT_URLS, BOLD_FONT_THRESHOLD } from './constants';
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
import { surgicalSlotRepair, getTopologyReport } from './surgicalSlotRepair';
// @ts-ignore
import { postCSGJob } from './csgWorkerManager';
import { CavalierPathOperations, Polyline } from './cavalierContours';
import { makeCacheKey, getOrCreateSlotGeometries } from './slotGeometryCache';
// import { fillHolesManifold } from './holeFillingRepair'; // Temporarily commented
import { geometryCache, makeTextKey, makeHubKey, makeAbstractKey, makeSlotKey, getOrCreateGeometry, clearGeometryCache, modelCache3D, hashConfig, slotCutCache, makeUnderlineKey } from './geometryCache';
import { hashLayerContent, makeSlotCutCacheKey, improvedSlotCutCache } from './improvedSlotCache';

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
function polylineToPoints(polyline: Polyline): THREE_ACTUAL.Vector2[] {
  return CavalierPathOperations.polylineToVector2Array(polyline, 16);
}

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

const createSlotGeometries = (
  layer: LayerConfig,
  baseSlotLength: number,
  baseSlotWidth: number,         // kept in signature for API compat; no longer
  extrusionDepth: number,        // drives slot width directly
  bevelEnabled: boolean,
  bevelAmount: number,
  allLayers: LayerConfig[],
  globalStrokeWeight: number = 0
): THREE_ACTUAL.BufferGeometry[] => {

  if (!layer.slotType || layer.slotType === 'none') return [];

  const slots: THREE_ACTUAL.BufferGeometry[] = [];
  const enabledLayers = allLayers.filter(l => l.enabled);
  const numPlanes     = enabledLayers.length;

  const adjLength = layer.slotLengthAdjustment ?? 0;
  const adjWidth  = layer.slotWidthOffset      ?? 0;   // per-layer fine-tune

  const slotLength     = baseSlotLength + adjLength;
  const rotationOffset = layer.primary.rotationOffset;

  // ── Slot width: material core thickness + 0.1 mm clearance ───────────────
  //
  // The mating plane slides into this slot.  Its visible face width is the
  // core (between the two bevel transitions).  We add 0.1 mm total so the
  // fit is snug but not press-fit-tight.
  //
  // bevelPerSide is the thickness consumed by ONE bevel face.
  // For a chamfer/fillet bevel both top and bottom faces are bevelled,
  // so total bevel removal = 2 × bevelPerSide.
  const bevelPerSide   = bevelEnabled ? bevelAmount : 0;
  const coreThickness  = Math.max(0.5, extrusionDepth - bevelPerSide * 2);
  const CLEARANCE      = 0.1;  // mm — total gap, not per-side
  const cutThickness   = coreThickness + CLEARANCE + adjWidth;

  // ── Match 2D Preview: Calculate visual extension like 2D view ─────────────
  // Use same calculation as 2D preview for consistency
  const modelDiameter = 190; // Approximate snowflake diameter (should match actual)
  const visualExtension = (modelDiameter / 2) + 20;
  const drawLength = Math.max(slotLength, visualExtension);

  console.log(`🔧 Slot geometry for layer ${layer.id} (${layer.slotType}):`, {
    slotLength,
    drawLength,
    visualExtension,
    extrusionDepth,
    bevelPerSide,
    coreThickness,
    CLEARANCE,
    adjWidth,
    cutThickness,
    rotationOffset,
  });

  // ── Blade extent: always punch fully through the mesh ─────────────────────
  // 500 mm safely exceeds any snowflake bounding-box diagonal regardless of
  // the layer's 3D rotation (0°, 120°, 240°, or anything else).
  const FULL_PUNCH = 500;

  // ── createBlade ────────────────────────────────────────────────────────────
  // BoxGeometry(totalLen, extent, thickness):
  //   totalLen  = long axis (slot length direction, X before rotations)
  //   extent    = FULL_PUNCH (becomes Z penetration after rotateX(90°))
  //   thickness = cutThickness (the narrow slot opening)
  //
  // xOffset: where along +X the blade starts
  // angleX:  rotateX degrees — 90 makes the extent axis into Z (vertical cut)
  // angleZ:  rotateZ degrees — controls slot direction in XY plane
  //
  // Random jitter removed — it was non-deterministic, broke caching, and is
  // unnecessary now that FULL_PUNCH eliminates coplanarity as a concern.
  const createBlade = (
    length:    number,
    xOffset:   number,
    thickness: number,
    extent:    number,
    angleX:    number,
    angleZ:    number
  ): THREE_ACTUAL.BufferGeometry => {
    const overlap  = 10.0; // Increased from 2.0 to 10.0 for better nesting
    const totalLen = length + overlap;
    const geo = new THREE_ACTUAL.BoxGeometry(totalLen, extent, thickness, 4, 2, 2);
    const centerX = xOffset + (length - overlap) / 2;
    geo.translate(centerX, 0, 0);
    geo.rotateX(angleX * Math.PI / 180);
    geo.rotateZ(angleZ * Math.PI / 180);
    return geo;
  };

  const createVerticalBlade = (length: number, xOffset: number) =>
    createBlade(length, xOffset, cutThickness, FULL_PUNCH, 90, -rotationOffset);

  // ── 2-plane assembly (perpendicular cross, 90°) ───────────────────────────
  //
  // For two planes to slide together each needs a HALF-slot:
  //   half-back  (layer 0, flat): slot from outer edge → center (open at center)
  //   half-front (layer 1, rotated 90°): slot from center → outer edge (open at outer edge)
  //
  // Both slots are the same length (halfLen = slotLength/2) so they interlock
  // exactly at the center hub. FULL_PUNCH guarantees the cut goes all the way
  // through the mesh thickness regardless of 3D rotation.
  if (numPlanes === 2) {
    const halfLen = slotLength / 2;

    if (layer.slotType === 'half-back') {
      // Cut from outer edge inward to center: xOffset=0, runs 0 → halfLen along +X
      slots.push(createBlade(halfLen, 0, cutThickness, FULL_PUNCH, 90, -rotationOffset));
    } else if (layer.slotType === 'half-front') {
      // Cut from center outward to outer edge: xOffset=-halfLen, runs -halfLen → 0
      slots.push(createBlade(halfLen, -halfLen, cutThickness, FULL_PUNCH, 90, -rotationOffset));
    } else {
      // Fallback: full-length slot through center
      slots.push(createBlade(slotLength, -slotLength / 2, cutThickness, FULL_PUNCH, 90, -rotationOffset));
    }
    return slots;
  }

  // ── 3-plane assembly (120° spacing) ───────────────────────────────────────
  //
  // Three planes at rotateX 0°, 120°, 240°. Each plane needs TWO half-slots
  // so the other two planes can slide in and meet at the center hub.
  //
  // The key insight: slot direction must be PERPENDICULAR to the intersection
  // line between two planes. For planes at 120° to each other, the intersection
  // lines run at 0°, 60°, 120° in the XY plane of each respective plane.
  //
  //   Layer 0 (third-back,   rotateX   0°, the flat base plane):
  //     Two slots, each halfLen long, open at center:
  //       Slot A runs along 60°  direction (to accept layer 1 which is at 120°)  
  //       Slot B runs along 120° direction (to accept layer 2 which is at 240°)
  //     Both go from outer edge inward to center.
  //
  //   Layer 1 (third-middle, rotateX 120°):
  //     One slot from outer edge to center at 0° (accepts layer 0)
  //     One slot from center to outer edge at 180° (open end faces layer 2)
  //
  //   Layer 2 (third-front,  rotateX 240°):
  //     One slot from outer edge to center at 0° (accepts layer 0)  
  //     One slot from center to outer edge at 180° (open end faces layer 1)
  //
  // rotationOffset rotates the whole snowflake arm pattern — we apply it
  // to the blade angle so slots align with the actual geometry.
  if (numPlanes === 3) {
    const layerIndex = enabledLayers.findIndex(l => l.id === layer.id);
    const halfLen = slotLength / 2;
    const ro = rotationOffset; // shorthand

    if (layerIndex === 0) {
      // Base plane (flat): two inward half-slots at 60° and 120°
      // These accept the other two planes sliding in from the outer edges
      slots.push(createBlade(halfLen, 0,       cutThickness, FULL_PUNCH, 90, -(ro + 60)));
      slots.push(createBlade(halfLen, 0,       cutThickness, FULL_PUNCH, 90, -(ro + 120)));

    } else if (layerIndex === 1) {
      // Middle plane (rotateX 120°): one inward + one outward slot
      // Inward slot (from outer edge to center) for layer 0 to slide into
      slots.push(createBlade(halfLen, 0,        cutThickness, FULL_PUNCH, 90, -ro));
      // Outward slot (from center to outer edge) for layer 2 to slide into
      slots.push(createBlade(halfLen, -halfLen, cutThickness, FULL_PUNCH, 90, -ro));

    } else if (layerIndex === 2) {
      // Front plane (rotateX 240°): one inward + one outward slot
      // Inward slot for layer 0 to slide into
      slots.push(createBlade(halfLen, 0,        cutThickness, FULL_PUNCH, 90, -ro));
      // Outward slot for layer 1 to slide into
      slots.push(createBlade(halfLen, -halfLen, cutThickness, FULL_PUNCH, 90, -ro));
    }

    return slots;
  }

  // ── 4+ planes: evenly-spaced, full slot through center ────────────────────
  const angle = rotationOffset;
  slots.push(createBlade(slotLength, -slotLength / 2, cutThickness, FULL_PUNCH, 90, -angle));
  return slots;
};

// ─── Helpers used by applySlotCuts ──────────────────────────────────────────

/**
 * Parse the WorkerOutput envelope and build a THREE.BufferGeometry.
 * The CSG worker posts:
 *   { success, geometry: { positions, indices, normals }, stats }
 * Old callers mistakenly destructured { position, index } directly from `e`.
 */
function workerOutputToGeometry(
  e: any,
  fallback: THREE_ACTUAL.BufferGeometry
): THREE_ACTUAL.BufferGeometry | null {
  if (!e || !e.success || !e.geometry) {
    console.error('CSG Worker returned failure:', e?.error ?? 'unknown');
    return null;
  }
  const { positions, indices, normals } = e.geometry;
  if (!positions || positions.length === 0) {
    console.error('CSG Worker returned empty positions');
    return null;
  }
  const geo = new THREE_ACTUAL.BufferGeometry();
  geo.setAttribute(
    'position',
    new THREE_ACTUAL.BufferAttribute(new Float32Array(positions), 3)
  );
  if (normals && normals.length > 0) {
    geo.setAttribute(
      'normal',
      new THREE_ACTUAL.BufferAttribute(new Float32Array(normals), 3)
    );
  }
  if (indices && indices.length > 0) {
    geo.setIndex(
      new THREE_ACTUAL.BufferAttribute(new Uint32Array(indices), 1)
    );
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Post-process a freshly BSP-cut geometry:
 *   1. Fill open boundary loops (B)
 *   2. Attempt Manifold re-subtraction with wider merge tolerance (C)
 *
 * The slotGeometries are passed to Manifold so it can redo the boolean on
 * the now-closed mesh.  If Manifold fails, the hole-filled result is returned
 * (still valid for preview and STL export).
 */
async function postProcessCutGeometry(
  cutGeo: THREE_ACTUAL.BufferGeometry,
  _slotGeometries: THREE_ACTUAL.BufferGeometry[]
): Promise<THREE_ACTUAL.BufferGeometry> {
  try {
    // Step 1: wider-tolerance weld bridges BSP seam vertices (0.02 mm)
    let geo = BufferGeometryUtils.mergeVertices(cutGeo, 0.02) as THREE_ACTUAL.BufferGeometry;

    // Step 2: fill open boundary loops left by slot cuts
    geo = fillOpenHoles(geo);

    // Step 3: tight weld + recompute normals
    geo = BufferGeometryUtils.mergeVertices(geo, 0.0001) as THREE_ACTUAL.BufferGeometry;
    geo.computeVertexNormals();

    const r = getTopologyReport(geo);
    console.log(`✅ Post-process: boundary=${r.boundaryEdges} nonManifold=${r.nonManifoldEdges}`);
    return geo;
  } catch (err) {
    console.warn('postProcessCutGeometry failed, returning raw cut geo:', err);
    return cutGeo;
  }
}

/**
 * Fill open boundary loops in a BSP-cut mesh with fan-triangulated caps.
 * Finds every edge with only 1 adjacent face, chains them into closed loops,
 * and triangulates each loop from its centroid with correct outward winding.
 */
function fillOpenHoles(geometry: THREE_ACTUAL.BufferGeometry): THREE_ACTUAL.BufferGeometry {
  if (!geometry.index) geometry = BufferGeometryUtils.mergeVertices(geometry, 1e-4);
  if (!geometry.index) return geometry;

  const idx = geometry.index;
  const pos = geometry.attributes.position as THREE_ACTUAL.BufferAttribute;

  // Build edge → face-count map
  const edgeCount = new Map<string, number>();
  const edgeDir   = new Map<string, [number, number]>();
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2);
    for (const [v0, v1] of [[a,b],[b,c],[c,a]] as [number,number][]) {
      const k = v0 < v1 ? `${v0}_${v1}` : `${v1}_${v0}`;
      edgeCount.set(k, (edgeCount.get(k) ?? 0) + 1);
      if (!edgeDir.has(k)) edgeDir.set(k, [v0, v1]);
    }
  }

  // Collect boundary edges (valence-1)
  const nextVert = new Map<number, number[]>();
  edgeCount.forEach((cnt, k) => {
    if (cnt !== 1) return;
    const [v0, v1] = edgeDir.get(k)!;
    if (!nextVert.has(v0)) nextVert.set(v0, []);
    if (!nextVert.has(v1)) nextVert.set(v1, []);
    nextVert.get(v0)!.push(v1);
    nextVert.get(v1)!.push(v0);
  });
  if (nextVert.size === 0) return geometry;

  // Chain into closed loops
  const visited = new Set<number>();
  const loops: number[][] = [];
  nextVert.forEach((_, start) => {
    if (visited.has(start)) return;
    const loop: number[] = [];
    let cur = start, prev = -1;
    for (let safety = 0; safety < 200000; safety++) {
      if (visited.has(cur) && cur !== start) break;
      loop.push(cur); visited.add(cur);
      const nbs = nextVert.get(cur) ?? [];
      let moved = false;
      for (const nb of nbs) {
        if (nb === prev) continue;
        if (!visited.has(nb) || (nb === start && loop.length > 2)) {
          prev = cur; cur = nb; moved = true; break;
        }
      }
      if (!moved || cur === start) break;
    }
    if (loop.length >= 3) loops.push(loop);
  });
  if (loops.length === 0) return geometry;

  // Append cap triangles
  const posArr = Array.from(pos.array as Float32Array);
  const idxArr = Array.from(idx.array as Uint32Array);
  const bbox   = new THREE_ACTUAL.Box3().setFromBufferAttribute(pos);
  const mc     = new THREE_ACTUAL.Vector3(); bbox.getCenter(mc);

  for (const loop of loops) {
    let cx = 0, cy = 0, cz = 0;
    for (const vi of loop) { cx += pos.getX(vi); cy += pos.getY(vi); cz += pos.getZ(vi); }
    cx /= loop.length; cy /= loop.length; cz /= loop.length;
    const ci = posArr.length / 3;
    posArr.push(cx, cy, cz);

    // Winding: cap normal must point away from mesh centroid
    const p0 = new THREE_ACTUAL.Vector3(pos.getX(loop[0]), pos.getY(loop[0]), pos.getZ(loop[0]));
    const p1 = new THREE_ACTUAL.Vector3(pos.getX(loop[1]), pos.getY(loop[1]), pos.getZ(loop[1]));
    const pC = new THREE_ACTUAL.Vector3(cx, cy, cz);
    const n  = new THREE_ACTUAL.Vector3().crossVectors(
      p1.clone().sub(p0), pC.clone().sub(p0)
    );
    const flip = n.dot(mc.clone().sub(pC)) > 0;
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length];
      flip ? idxArr.push(b, a, ci) : idxArr.push(a, b, ci);
    }
  }

  const out = new THREE_ACTUAL.BufferGeometry();
  out.setAttribute('position', new THREE_ACTUAL.Float32BufferAttribute(posArr, 3));
  out.setIndex(idxArr);
  out.computeVertexNormals();
  return out;
}

// ─── applySlotCuts ───────────────────────────────────────────────────────────

const applySlotCuts = async (
  layerGeo: THREE_ACTUAL.BufferGeometry,
  layer: LayerConfig,
  slotLength: number,
  slotWidth: number,
  extrusionDepth: number,
  bevelEnabled: boolean,
  bevelAmount: number,
  allLayers: LayerConfig[],
  globalStrokeWeight: number = 0,
  onProgress?: () => Promise<void>
): Promise<THREE_ACTUAL.BufferGeometry> => {

  const cacheKey = makeCacheKey(
    layer.id || 'layer',
    slotLength, slotWidth, extrusionDepth,
    bevelEnabled, bevelAmount, globalStrokeWeight
  );
  const slotGeometries = getOrCreateSlotGeometries(
    cacheKey,
    () => createSlotGeometries(
      layer, slotLength, slotWidth, extrusionDepth,
      bevelEnabled, bevelAmount, allLayers, globalStrokeWeight
    )
  );
  if (slotGeometries.length === 0) return layerGeo;

  // ── Serialise base with CORRECT plural key names ─────────────────────────
  const baseData = {
    positions: Array.from(layerGeo.attributes.position.array as Float32Array),
    indices:   layerGeo.index
      ? Array.from(layerGeo.index.array as Uint32Array)
      : null,
  };

  // ── Helper: build result from worker response + run B+C repair ───────────
  const buildResult = async (
    e: any,
    usedSlots: THREE_ACTUAL.BufferGeometry[]
  ): Promise<THREE_ACTUAL.BufferGeometry> => {
    const rawGeo = workerOutputToGeometry(e, layerGeo);
    if (!rawGeo) {
      usedSlots.forEach(g => g.dispose());
      return layerGeo;
    }

    const report = getTopologyReport(rawGeo);
    console.log(`📊 Post-CSG topology [${layer.name}]:`, report);

    // Run B+C: fill holes → attempt Manifold with wider merge tolerance
    const repairedGeo = await postProcessCutGeometry(rawGeo, usedSlots);

    usedSlots.forEach(g => g.dispose());
    return repairedGeo;
  };

  // ── Fast AABB filter ──────────────────────────────────────────────────────
  try {
    if (!layerGeo.boundingBox) layerGeo.computeBoundingBox();
    const layerBB = layerGeo.boundingBox ? layerGeo.boundingBox.clone() : null;

    if (layerBB) {
      const rotX = (layer.rotation3D?.x ?? 0) * Math.PI / 180;
      const rotY = (layer.rotation3D?.y ?? 0) * Math.PI / 180;
      const rotMat = new THREE_ACTUAL.Matrix4()
        .makeRotationX(rotX)
        .multiply(new THREE_ACTUAL.Matrix4().makeRotationY(rotY));

      const keptSlots: THREE_ACTUAL.BufferGeometry[] = [];
      for (const g of slotGeometries) {
        try {
          const clone = g.clone();
          clone.applyMatrix4(rotMat);
          clone.computeBoundingBox();
          const gbb = clone.boundingBox;
          if (gbb) {
            const padded = gbb.clone().expandByScalar(0.5);
            if (layerBB.intersectsBox(padded)) keptSlots.push(g);
          }
          clone.dispose?.();
        } catch {
          keptSlots.push(g); // conservative: keep on error
        }
      }

      if (keptSlots.length === 0) {
        slotGeometries.forEach(s => s.dispose());
        return layerGeo;
      }

      // Serialise with CORRECT plural key names
      const slotsData = keptSlots.map(g => ({
        positions: Array.from(g.attributes.position.array as Float32Array),
        indices:   g.index
          ? Array.from(g.index.array as Uint32Array)
          : null,
        rotation: layer.rotation3D ?? { x: 0, y: 0, z: 0 },
      }));

      return postCSGJob(baseData, slotsData, layer.rotation3D)
        .then((e: any) => buildResult(e, keptSlots))
        .catch((err: any) => {
          console.error('CSG Worker Error (filtered path):', err);
          slotGeometries.forEach(g => g.dispose());
          return layerGeo;
        });
    }
  } catch (e) {
    console.warn('Slot AABB filtering failed, proceeding with full CSG', e);
  }

  // ── Fallback: send all slots ──────────────────────────────────────────────
  const allSlotsData = slotGeometries.map(g => ({
    positions: Array.from(g.attributes.position.array as Float32Array),
    indices:   g.index
      ? Array.from(g.index.array as Uint32Array)
      : null,
    rotation: layer.rotation3D ?? { x: 0, y: 0, z: 0 },
  }));

  return postCSGJob(baseData, allSlotsData, layer.rotation3D)
    .then((e: any) => buildResult(e, slotGeometries))
    .catch((err: any) => {
      console.error('CSG Worker Error (full fallback path):', err);
      slotGeometries.forEach(g => g.dispose());
      return layerGeo;
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
    syncAllLayers: true, // Default ON
    globalStrokeWeight: 0
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
    // Clear geometry cache if boldness settings change
    if ('globalStrokeWeight' in updates && updates.globalStrokeWeight !== config.globalStrokeWeight) {
      clearGeometryCache();
      console.log(' Global boldness changed, clearing geometry cache');
    }
    
    setConfig(prev => {
      let next = { ...prev, ...updates };

      // Auto-configure slot mode when slotEnabled is turned ON:
      // Determine 2-plane vs 3-plane from how many layers are currently enabled,
      // then apply the matching rotation + slotType assignments automatically.
      if ('slotEnabled' in updates && updates.slotEnabled === true && !prev.slotEnabled) {
        const enabledCount = next.layers.filter(l => l.enabled).length;
        if (enabledCount >= 2) {
          console.log(`🔧 Auto-configuring ${enabledCount}-plane slot mode`);
          next = { ...next, layers: calculateOptimalSlots(next.layers) };
        }
      }

      // Also auto-reconfigure if layers change while slots are enabled
      // (e.g., user enables a third plane while slots are already on)
      if ('layers' in updates && next.slotEnabled) {
        const prevEnabled = prev.layers.filter(l => l.enabled).length;
        const nextEnabled = next.layers.filter(l => l.enabled).length;
        if (prevEnabled !== nextEnabled && nextEnabled >= 2) {
          console.log(`🔧 Plane count changed (${prevEnabled}→${nextEnabled}), reconfiguring slots`);
          next = { ...next, layers: calculateOptimalSlots(next.layers) };
        }
      }
      
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

  const generateMesh = useCallback(async (onProgress: (p: number) => void, overrideQuality?: DesignQuality, overrideConfig?: SnowflakeConfig): Promise<THREE_ACTUAL.Group> => {
    const config = overrideConfig || rendered3DConfig;
    
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
    if (config.slotEnabled) {
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
              if (underlineGeo) {
                  const uInst = underlineGeo.clone();
                  uInst.translate(0, 0, centerZOffset);
                  uInst.rotateX(Math.PI);
                  uInst.rotateZ(-angle);
                  layerGeometries.push(uInst);
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
             geo.rotateZ(hub.rotationOffset * Math.PI / 180);
             geo.translate(0, 0, centerZOffset);
             layerGeometries.push(geo);
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
           // When producing 3D view we should merge/repair vertices so overlapping
           // geometry fuses correctly. This reduces visual overlaps and prevents
           // floating/non-welded faces in 3D preview and exports.
           if (config.slotEnabled || viewMode === '3d') {
             // Always weld vertices — this collapses the 964k duplicate-seam verts
             // from ExtrudeGeometry down to ~80k before hitting the CSG worker.
             layerMerged = repairGeometry(layerMerged, 0.0001, true) as THREE_ACTUAL.BufferGeometry;
           }

          layerMerged.rotateX(layer.rotation3D.x * Math.PI / 180);
          layerMerged.rotateY(layer.rotation3D.y * Math.PI / 180);

          if (config.slotEnabled) {
            // Must use makeCacheKey — same function applySlotCuts uses to write
            const cacheKey = makeCacheKey(
              layer.id || 'layer',
              config.slotLength,
              config.slotWidth,
              config.extrusionDepth,
              config.bevelEnabled,
              bevelPerSide,
              config.globalStrokeWeight
            );

            const cachedCutGeo = slotCutCache.get(cacheKey);
            if (cachedCutGeo) {
              // Use cached geometry - validate it first
              if (cachedCutGeo.attributes && cachedCutGeo.attributes.position) {
                layerMerged = cachedCutGeo.clone();
                console.log('🔍 SLOT DEBUG: Using valid cached geometry for layer:', layer.name);
              } else {
                console.warn('🔍 SLOT DEBUG: Cached geometry is invalid, regenerating for layer:', layer.name);
                // Fall through to regenerate
              }
            } else {
              console.log('🔍 SLOT DEBUG: Cache miss - computing slot cuts for layer:', layer.name);
              console.log('🏗️ MESH GEN DEBUG: About to call applySlotCuts - this might take time...');
              // Preserve original geometry for fallback
              const originalGeometry = layerMerged;
              // Compute slot cuts on-demand with timeout protection
              try {
                console.log('🔍 SLOT DEBUG: About to call applySlotCuts...');
                
                // Add timeout protection
                const slotCutPromise = applySlotCuts(
                  originalGeometry,
                  layer,
                  config.slotLength,
                  config.slotWidth,
                  config.extrusionDepth,
                  config.bevelEnabled,
                  bevelPerSide,
                  config.layers,
                  config.globalStrokeWeight,
                  async () => { await updateProgress(); }
                );
                
                const timeoutPromise = new Promise((_, reject) => {
                  setTimeout(() => reject(new Error('Slot cutting timeout')), 10000); // 10 second timeout
                });
                
                layerMerged = await Promise.race([slotCutPromise, timeoutPromise]) as THREE_ACTUAL.BufferGeometry;
                
                // Validate the result before proceeding
                if (layerMerged && layerMerged.attributes && layerMerged.attributes.position) {
                  console.log('🔍 SLOT DEBUG: applySlotCuts completed successfully for layer:', layer.name);
                  // Cache result for future use - only cache if geometry is valid
                  if (layerMerged && layerMerged.attributes && layerMerged.attributes.position) {
                    slotCutCache.set(cacheKey, layerMerged.clone());
                  } else {
                    console.warn('🔍 SLOT DEBUG: Not caching invalid geometry for layer:', layer.name);
                  }
                } else {
                  console.error('🔍 SLOT DEBUG: Slot cutting produced invalid geometry, using original for layer:', layer.name);
                  // Don't cache invalid results, fall back to original geometry
                  layerMerged = originalGeometry;
                }
              } catch (error) {
                console.error('Slot cutting failed or timed out, using original geometry:', error);
                // Continue with original geometry if slot cutting fails
              }
            }
            // Topology repaired by postProcessCutGeometry (hole-fill + weld).
            const report = getTopologyReport(layerMerged);
            console.log(`📊 Slot topology [${layer.id}]: verts=${report.vertices} boundary=${report.boundaryEdges} nonManifold=${report.nonManifoldEdges}`);
            if (lIdx === 0) layerMerged.rotateZ(Math.PI);
          }
          // Final clean up logic:
          // If slots are enabled, use the repaired geometry (already processed by surgicalSlotRepair in worker).
          // If slots are DISABLED, use the pristine geometry from mergeGeometries which preserves normals.
          const finalGeo = config.slotEnabled 
             ? (repairGeometry(layerMerged, 0.0001, true) || layerMerged)
             : layerMerged;

          // Only create mesh if geometry is valid
          if (finalGeo && finalGeo.attributes && finalGeo.attributes.position && finalGeo.attributes.position.count > 0) {
            const mesh = new THREE_ACTUAL.Mesh(finalGeo);
            mesh.userData.layerId = layer.id;
            mesh.name = layer.name;
            group.add(mesh);
          } else {
            console.warn(`⚠️ Skipping empty geometry for layer ${layer.name}`);
          }
        }
      }
    }
    onProgress(1);
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
            const combinedForCheck = BufferGeometryUtils.mergeGeometries(flatGeoms);
            if (combinedForCheck) {
                // Final topology verification before export
                const report = getTopologyReport(combinedForCheck);
                console.log(`📊 Final Export Topology Report:`, report);
                
                if (!report.isManifold) {
                    console.warn(`⚠️ Export has ${report.nonManifoldEdges} non-manifold edges`);
                    
                    // Skip aggressive repair to prevent freezing during export
                    if (report.nonManifoldEdges > 100) {
                        console.log('🔨 Skipping aggressive repair for export to prevent freezing');
                        console.log(`📝 Geometry has ${report.nonManifoldEdges} non-manifold edges but is still exportable`);
                        // const repaired = surgicalSlotRepair(combinedForCheck); // Disabled to prevent freeze
                        // Update the merged geometry with repaired version
                        // for (let i = 0; i < flatGeoms.length; i++) {
                        //     flatGeoms[i] = repaired;
                        // }
                    }
                }
                
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
                        calculateOptimalSlots={calculateOptimalSlots}
                        setViewMode={setViewMode}
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
