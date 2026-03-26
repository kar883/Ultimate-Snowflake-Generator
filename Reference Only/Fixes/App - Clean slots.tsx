
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { SnowflakeConfig, TextGroupConfig, HubConfig, CharOffset, LayerConfig, AbstractConfig, DesignQuality, UnderlineConfig } from './types';
import { CURSIVE_FONTS, FONT_TTF_URLS } from './constants';
import ControlPanel from './components/ControlPanel';
import SnowflakePreview from './components/SnowflakePreview';
import Snowflake3D from './components/Snowflake3D';
import Header from './components/Header';
import { GoogleGenAI } from "@google/genai";
import * as THREE_ACTUAL from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils';
import opentype from 'opentype.js';
import JSZip from 'jszip';

// @ts-ignore
import { Brush, Evaluator, SUBTRACTION, ADDITION } from 'three-bvh-csg';

const MAX_HISTORY = 50;

/**
 * Heuristic repair for mesh issues before and after CSG.
 */
const repairGeometry = (geometry: THREE_ACTUAL.BufferGeometry | null, tolerance: number = 0.001): THREE_ACTUAL.BufferGeometry | null => {
  if (!geometry || !geometry.attributes.position) return null;
  try {
    let repaired = BufferGeometryUtils.mergeVertices(geometry, tolerance);
    if (repaired) {
      repaired.computeVertexNormals();
      return repaired;
    }
  } catch (e) {
    console.warn("Geometry repair failed:", e);
  }
  return geometry;
};

/**
 * Checks if the mesh is a single connected component using BFS.
 */
const checkConnectivity = (geometry: THREE_ACTUAL.BufferGeometry): boolean => {
    const mergedGeo = BufferGeometryUtils.mergeVertices(geometry, 0.1);
    const index = mergedGeo.index;
    const position = mergedGeo.attributes.position;

    if (!index) return true; 

    const vertexCount = position.count;
    if (vertexCount > 100000) return true; 

    const adj: number[][] = new Array(vertexCount).fill(null).map(() => []);
    for (let i = 0; i < index.count; i += 3) {
        const a = index.getX(i);
        const b = index.getX(i + 1);
        const c = index.getX(i + 2);
        adj[a].push(b, c);
        adj[b].push(a, c);
        adj[c].push(a, b);
    }

    const visited = new Uint8Array(vertexCount);
    let visitedCount = 0;
    const queue = [0]; 
    visited[0] = 1;
    visitedCount++;

    let head = 0;
    while(head < queue.length) {
        const u = queue[head++];
        const neighbors = adj[u];
        for(let i = 0; i < neighbors.length; i++) {
            const v = neighbors[i];
            if(visited[v] === 0) {
                visited[v] = 1;
                visitedCount++;
                queue.push(v);
            }
        }
    }

    return visitedCount === vertexCount;
};

/**
 * Creates radial slots for proper 3-plane interlocking assembly
 */
const createSlotGeometries = (
  layer: LayerConfig,
  slotLength: number,
  extrusionDepth: number,
  bevelEnabled: boolean,
  bevelAmount: number,
  allLayers: LayerConfig[]
): THREE_ACTUAL.BufferGeometry[] => {
  if (!layer.slotType || layer.slotType === 'none') return [];

  const slots: THREE_ACTUAL.BufferGeometry[] = [];
  const enabledLayers = allLayers.filter(l => l.enabled);
  const numPlanes = enabledLayers.length;
  
  const rotationOffset = layer.primary.rotationOffset;
  const materialThickness = extrusionDepth + (bevelEnabled ? bevelAmount * 2 : 0);
  const cutThickness = materialThickness + 0.2; 
  const cutDepth = materialThickness + 5.0;

  const createBlade = (length: number, xOffset: number, thickness: number, extent: number, angleX: number, angleZ: number) => {
    const overlap = 1.5; 
    const totalLen = length + overlap;
    const geo = new THREE_ACTUAL.BoxGeometry(totalLen, extent, thickness);
    const centerX = xOffset + (length - overlap) / 2;
    geo.translate(centerX, 0, 0);
    geo.rotateX(angleX * Math.PI / 180);
    geo.rotateZ(angleZ * Math.PI / 180);
    return geo;
  };

  const createVerticalBlade = (length: number, xOffset: number) => {
    return createBlade(length, xOffset, cutThickness, cutDepth, 90, -rotationOffset);
  };

  if (numPlanes === 2) {
    slots.push(createVerticalBlade(slotLength, 0));
    return slots;
  }

  if (numPlanes === 3) {
    const layerIndex = enabledLayers.findIndex(l => l.id === layer.id);
    if (layerIndex === 0) {
      slots.push(createBlade(slotLength, 0, cutThickness, cutDepth, 120, -rotationOffset));
      slots.push(createBlade(slotLength, 0, cutThickness, cutDepth, 240, -rotationOffset));
    } else if (layerIndex === 1) {
      const extendedLength = slotLength * 1.75;
      const xOffset = -(slotLength * 0.75);
      slots.push(createBlade(extendedLength, xOffset, cutThickness, cutDepth, 240, -rotationOffset));
      slots.push(createBlade(extendedLength, xOffset, cutThickness, cutDepth, 120, -rotationOffset));
    } else if (layerIndex === 2) {
      slots.push(createBlade(slotLength, 0, cutThickness, cutDepth, 240, -rotationOffset));
      const tipOvershoot = 15;
      const shortLength = (slotLength * 0.25) + tipOvershoot;
      const xOffsetShort = slotLength * 0.75; 
      slots.push(createBlade(shortLength, xOffsetShort, cutThickness, cutDepth, 120, -rotationOffset + 180));
    }
    return slots;
  }
  slots.push(createVerticalBlade(slotLength, 0));
  return slots;
};

const performCSGSubtraction = (
  baseGeo: THREE_ACTUAL.BufferGeometry,
  slotGeo: THREE_ACTUAL.BufferGeometry,
  evaluator: Evaluator
): THREE_ACTUAL.BufferGeometry => {
  try {
    const repairedBase = repairGeometry(baseGeo, 0.001);
    const repairedSlot = repairGeometry(slotGeo, 0.001);
    if (!repairedBase || !repairedSlot) return baseGeo;
    const baseBrush = new Brush(repairedBase);
    const slotBrush = new Brush(repairedSlot);
    baseBrush.updateMatrixWorld();
    slotBrush.updateMatrixWorld();
    const result = evaluator.evaluate(baseBrush, slotBrush, SUBTRACTION);
    const finalGeo = repairGeometry(result.geometry, 0.001);
    result.geometry.dispose();
    return finalGeo || baseGeo;
  } catch (error) {
    return baseGeo;
  }
};

const applySlotCuts = (
  layerGeo: THREE_ACTUAL.BufferGeometry,
  layer: LayerConfig,
  slotLength: number,
  extrusionDepth: number,
  bevelEnabled: boolean,
  bevelAmount: number,
  allLayers: LayerConfig[],
  evaluator: Evaluator
): THREE_ACTUAL.BufferGeometry => {
  const slotGeometries = createSlotGeometries(layer, slotLength, extrusionDepth, bevelEnabled, bevelAmount, allLayers);
  if (slotGeometries.length === 0) return layerGeo;
  let result = layerGeo;
  slotGeometries.forEach((slotGeo) => {
    const rotatedSlotGeo = slotGeo.clone();
    rotatedSlotGeo.rotateX(layer.rotation3D.x * Math.PI / 180);
    rotatedSlotGeo.rotateY(layer.rotation3D.y * Math.PI / 180);
    result = performCSGSubtraction(result, rotatedSlotGeo, evaluator);
    rotatedSlotGeo.dispose();
  });
  return result;
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
  underline: {
    enabled: false,
    thickness: 1.5,
    startXOffset: 0,
    length: 50,
    yOffset: -5,
    capType: 'none',
    capWidth: 10
  }
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
});

const calculateOptimalSlots = (layers: LayerConfig[]): LayerConfig[] => {
  const updatedLayers = JSON.parse(JSON.stringify(layers)) as LayerConfig[];
  const enabled = updatedLayers.filter(l => l.enabled);
  const count = enabled.length;

  if (count === 2) {
    enabled[0].rotation3D = { x: 0, y: 0 };
    enabled[0].slotType = 'half-back';
    enabled[1].rotation3D = { x: 90, y: 0 };
    enabled[1].slotType = 'half-front';
  } else if (count === 3) {
    enabled[0].rotation3D = { x: 0, y: 0 };
    enabled[0].slotType = 'third-back';
    enabled[1].rotation3D = { x: 120, y: 0 };
    enabled[1].slotType = 'third-middle';
    enabled[2].rotation3D = { x: 240, y: 0 };
    enabled[2].slotType = 'third-front';
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
    bevelEnabled: true,
    bevelType: 'fillet',
    bevelAmount: 0.4,
    bevelSegments: 2, 
    slotEnabled: false,
    slotLength: 95, 
    slotWidth: defaultDepth + 0.2,
    quality: 'low',
    syncAllLayers: true
  };

  const [config, setConfig] = useState<SnowflakeConfig>(initialState);
  const [config3D, setConfig3D] = useState<SnowflakeConfig>(initialState);
  const [history, setHistory] = useState<SnowflakeConfig[]>([initialState]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const [aiLoading, setAiLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d'); 
  const [dynamicFonts, setDynamicFonts] = useState<Record<string, string>>(FONT_TTF_URLS);
  
  const svgRef = useRef<SVGSVGElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csgEvaluator = useRef(new Evaluator());

  useEffect(() => {
    csgEvaluator.current.attributes = ['position', 'normal'];
    csgEvaluator.current.useGroups = false;
  }, []);

  const handleUpdateConfig = (updates: Partial<SnowflakeConfig>, commitTo3D: boolean = false) => {
    setConfig(prev => {
      const next = { ...prev, ...updates };
      if (commitTo3D) {
        setConfig3D(next);
        setHistory(h => [...h.slice(0, historyIndex + 1), JSON.parse(JSON.stringify(next))]);
        setHistoryIndex(i => i + 1);
      }
      return next;
    });
  };

  const updateGroup = (group: 'primary' | 'secondary', updates: Partial<TextGroupConfig>, commitTo3D: boolean = false) => {
    handleUpdateConfig({
      layers: config.layers.map((layer, idx) => {
        if (idx === config.activeLayerIndex || config.syncAllLayers) {
            return { ...layer, [group]: { ...layer[group], ...updates } };
        }
        return layer;
      })
    }, commitTo3D);
  };

  const updateCharOffset = (group: 'primary' | 'secondary', charIndex: number, offset: Partial<CharOffset>, commitTo3D: boolean = false) => {
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
  };

  const updateHubs = (newHubs: HubConfig[], commitTo3D: boolean = false) => {
    handleUpdateConfig({
        layers: config.layers.map((layer, idx) => {
            if (idx === config.activeLayerIndex) {
                return { ...layer, hubs: newHubs };
            }
            return layer;
        })
    }, commitTo3D);
  };

  const updateAbstracts = (newAbstracts: AbstractConfig[], commitTo3D: boolean = false) => {
    handleUpdateConfig({
        layers: config.layers.map((layer, idx) => {
            if (idx === config.activeLayerIndex) {
                return { ...layer, abstracts: newAbstracts };
            }
            return layer;
        })
    }, commitTo3D);
  };

  const undo = () => {
    if (historyIndex > 0) {
        setHistoryIndex(i => i - 1);
        const prev = history[historyIndex - 1];
        setConfig(prev);
        setConfig3D(prev);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
        setHistoryIndex(i => i + 1);
        const next = history[historyIndex + 1];
        setConfig(next);
        setConfig3D(next);
    }
  };

  const generateMesh = useCallback(async (onProgress: (p: number) => void, overrideQuality?: DesignQuality): Promise<THREE_ACTUAL.Group> => {
    const qualityToUse = overrideQuality || config3D.quality;
    const curveSegments = qualityToUse === 'low' ? 3 : (qualityToUse === 'med' ? 6 : 12);
    const extrudeSettings = {
      depth: config3D.extrusionDepth,
      bevelEnabled: config3D.bevelEnabled,
      bevelThickness: config3D.bevelAmount,
      bevelSize: config3D.bevelAmount,
      bevelSegments: config3D.bevelSegments,
      curveSegments: curveSegments,
    };

    const group = new THREE_ACTUAL.Group();
    const enabledLayers = config3D.layers.filter(l => l.enabled);

    for (let lIdx = 0; lIdx < enabledLayers.length; lIdx++) {
      const layer = enabledLayers[lIdx];
      const layerGeometries: THREE_ACTUAL.BufferGeometry[] = [];
      
      const processTextGroup = async (textGroup: TextGroupConfig) => {
        if (!textGroup.enabled) return;
        
        // Text Processing
        const fontName = textGroup.fontFamily.replace(/'/g, '').split(',')[0].trim();
        const url = dynamicFonts[fontName] || FONT_TTF_URLS[fontName];
        
        const font = await new Promise<opentype.Font | null>(r => opentype.load(url, (e, f) => r(f || null)));
        if (font) {
          const scale = textGroup.fontSize / font.unitsPerEm;
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

          // Text Extrusion
          const groupGeo = new THREE_ACTUAL.ExtrudeGeometry(shapes, extrudeSettings);
          
          // Underline Processing
          const uConf = textGroup.underline;
          let underlineShapes: THREE_ACTUAL.Shape[] = [];
          
          if (uConf && uConf.enabled) {
              const t = uConf.thickness;
              const halfT = t / 2;
              const startX = textGroup.textX + uConf.startXOffset;
              const endX = startX + uConf.length;
              const topY = (textGroup.mirrorOffset / 2) + uConf.yOffset;
              
              if (!textGroup.mirrorEnabled) {
                  const shape = new THREE_ACTUAL.Shape();
                  shape.moveTo(startX, topY + halfT);
                  shape.lineTo(endX, topY + halfT);
                  shape.lineTo(endX, topY - halfT);
                  shape.lineTo(startX, topY - halfT);
                  shape.closePath();
                  underlineShapes.push(shape);
              } else {
                  const botY = -(textGroup.mirrorOffset / 2) - uConf.yOffset;
                  const shape = new THREE_ACTUAL.Shape();
                  
                  if (uConf.capType === 'none') {
                      // Two separate rects
                      shape.moveTo(startX, topY + halfT);
                      shape.lineTo(endX, topY + halfT);
                      shape.lineTo(endX, topY - halfT);
                      shape.lineTo(startX, topY - halfT);
                      shape.closePath();
                      underlineShapes.push(shape);

                      const shape2 = new THREE_ACTUAL.Shape();
                      shape2.moveTo(startX, botY + halfT);
                      shape2.lineTo(endX, botY + halfT);
                      shape2.lineTo(endX, botY - halfT);
                      shape2.lineTo(startX, botY - halfT);
                      shape2.closePath();
                      underlineShapes.push(shape2);
                  } else {
                      // Connected shape
                      // 1. Top Outer Line
                      shape.moveTo(startX, topY + halfT);
                      shape.lineTo(endX, topY + halfT);

                      // 2. Cap Outer
                      if (uConf.capType === 'square') {
                           const cx = endX + uConf.capWidth;
                           shape.lineTo(cx, topY + halfT);
                           shape.lineTo(cx, botY - halfT);
                           shape.lineTo(endX, botY - halfT);
                      } else if (uConf.capType === 'round') {
                           // Arcing away from origin
                           const r = (topY + halfT - (botY - halfT)) / 2;
                           const cy = (topY + halfT + botY - halfT) / 2;
                           shape.absarc(endX, cy, r, Math.PI/2, -Math.PI/2, true);
                      } else if (uConf.capType === 'chevron') {
                           const cx = endX + uConf.capWidth;
                           shape.lineTo(cx, 0);
                           shape.lineTo(endX, botY - halfT);
                      }

                      // 3. Bottom Outer Line Return
                      shape.lineTo(startX, botY - halfT);
                      // 4. Bottom Inner Start
                      shape.lineTo(startX, botY + halfT);
                      // 5. Bottom Inner Line
                      shape.lineTo(endX, botY + halfT);

                      // 6. Cap Inner
                      if (uConf.capType === 'square') {
                           const cx = endX + uConf.capWidth - t;
                           const effCX = Math.max(endX, cx);
                           shape.lineTo(effCX, botY + halfT);
                           shape.lineTo(effCX, topY - halfT);
                           shape.lineTo(endX, topY - halfT);
                      } else if (uConf.capType === 'round') {
                           const r = (topY - halfT - (botY + halfT)) / 2;
                           const cy = (topY - halfT + botY + halfT) / 2;
                           if (r > 0) shape.absarc(endX, cy, r, -Math.PI/2, Math.PI/2, false);
                           else shape.lineTo(endX, topY - halfT);
                      } else if (uConf.capType === 'chevron') {
                           const cx = endX + uConf.capWidth - (t * 1.5); 
                           const effCX = Math.max(endX, cx);
                           shape.lineTo(effCX, 0);
                           shape.lineTo(endX, topY - halfT);
                      }

                      // 7. Top Inner Return
                      shape.lineTo(startX, topY - halfT);
                      shape.closePath();
                      underlineShapes.push(shape);
                  }
              }
          }
          
          let underlineGeo = null;
          if (underlineShapes.length > 0) {
              underlineGeo = new THREE_ACTUAL.ExtrudeGeometry(underlineShapes, extrudeSettings);
          }

          const angleStep = (Math.PI * 2) / textGroup.arms;
          for (let i = 0; i < textGroup.arms; i++) {
            const angle = i * angleStep + (textGroup.rotationOffset * Math.PI / 180);
            
            // Text Instances
            const inst = groupGeo.clone();
            inst.translate(textGroup.textX, textGroup.mirrorOffset / 2, -extrudeSettings.depth / 2);
            inst.rotateX(Math.PI); inst.rotateZ(-angle);
            layerGeometries.push(inst);
            if (textGroup.mirrorEnabled) {
              const mirrored = groupGeo.clone();
              mirrored.translate(textGroup.textX, -textGroup.mirrorOffset / 2, -extrudeSettings.depth / 2);
              mirrored.rotateZ(-angle); layerGeometries.push(mirrored);
            }
            
            // Underline Instances
            if (underlineGeo) {
                const uInst = underlineGeo.clone();
                // Underline coords are already computed relative to textX and mirrorOffset in createUnderlineShape logic? 
                // Wait, my logic above computed absolute local coords relative to arm origin.
                // startX was `textGroup.textX + uConf.startXOffset`.
                // Ys were `+/- mirrorOffset/2 + offset`.
                // So I just need to rotateZ and translate Z. No extra translation needed.
                uInst.translate(0, 0, -extrudeSettings.depth/2);
                uInst.rotateZ(angle); // Z rotation is standard
                // But wait, text is `rotateX(Math.PI)` then `rotateZ(-angle)`. 
                // The standard coord system here has X along radius.
                // `groupGeo` (text) is naturally Y-up. `textX` translates in X.
                // `inst.rotateX(Math.PI)` flips it so text reads correctly on ground?
                // `inst.rotateZ(-angle)` rotates arm.
                
                // For underline, we built it in X/Y plane.
                // We want it flat. 
                // So just rotateZ(angle).
                layerGeometries.push(uInst);
            }
          }
        }
      };

      const processHubs = (hubs: HubConfig[]) => {
         hubs.filter(h => h.enabled).forEach(hub => {
             const shape = new THREE_ACTUAL.Shape();
             const sides = hub.shape === 'star' ? Math.floor(hub.sides * 2) : (hub.shape === 'polygon' ? Math.floor(hub.sides) : 64);
             const isOsc = hub.shape === 'circle' && hub.oscillationEnabled;
             
             // Dynamic resolution based on oscillation frequency to ensure smoothness
             // Base 128, plus enough points to cover high frequency waves (48 points per wave cycle)
             const res = isOsc ? Math.max(360, hub.oscillationFrequency * 48) : (hub.shape === 'circle' ? 128 : sides);
             
             // Outer Path
             for(let i=0; i<=res; i++) {
                 const angle = (i/res) * Math.PI * 2;
                 let r = hub.outerRadius;
                 if (hub.shape === 'star') r = (i%2 === 0) ? r : r * hub.starRatio;
                 if (isOsc) r += Math.sin(angle * hub.oscillationFrequency) * hub.oscillationAmplitude;
                 const x = Math.cos(angle) * r;
                 const y = Math.sin(angle) * r;
                 if (i===0) shape.moveTo(x,y); else shape.lineTo(x,y);
             }

             // Inner Path (Hole)
             if (hub.hollow) {
                 const hole = new THREE_ACTUAL.Path();
                 for(let i=0; i<=res; i++) {
                     const angle = (i/res) * Math.PI * 2;
                     let r = hub.outerRadius - hub.wallThickness;
                     if (r < 0) r = 0.1; // Safety
                     if (hub.shape === 'star') r = (i%2 === 0) ? r : r * hub.starRatio;
                     if (isOsc) r += Math.sin(angle * hub.oscillationFrequency) * hub.oscillationAmplitude;
                     const x = Math.cos(angle) * r;
                     const y = Math.sin(angle) * r;
                     if (i===0) hole.moveTo(x,y); else hole.lineTo(x,y);
                 }
                 shape.holes.push(hole);
             }

             const geo = new THREE_ACTUAL.ExtrudeGeometry(shape, extrudeSettings);
             geo.rotateZ(hub.rotationOffset * Math.PI / 180);
             geo.translate(0, 0, -extrudeSettings.depth / 2);
             // Ensure we clone if needed, but new Geometry is fresh
             layerGeometries.push(geo);
         });
      };

      const processAbstracts = (abstracts: AbstractConfig[]) => {
          abstracts.filter(a => a.enabled).forEach(abs => {
               // Generate base path points
               const shapePoints: THREE_ACTUAL.Vector2[] = [];
               const steps = 200;
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
                   shapePoints.push(new THREE_ACTUAL.Vector2(rCurrent, yVal));
               }

               const createAbstractShape = (pts: THREE_ACTUAL.Vector2[]) => {
                   const s = new THREE_ACTUAL.Shape();
                   const halfThick = abs.thickness / 2;
                   pts.forEach((pt, i) => {
                       if (i === 0) s.moveTo(pt.x, pt.y + halfThick);
                       else s.lineTo(pt.x, pt.y + halfThick);
                   });
                   for(let i = pts.length-1; i >= 0; i--) {
                       s.lineTo(pts[i].x, pts[i].y - halfThick);
                   }
                   s.lineTo(pts[0].x, pts[0].y + halfThick);
                   return s;
               };

               // Normal Shape
               const normalShape = createAbstractShape(shapePoints);
               const normalGeo = new THREE_ACTUAL.ExtrudeGeometry(normalShape, extrudeSettings);
               
               // Mirrored Shape
               const mirroredPoints = shapePoints.map((pt) => new THREE_ACTUAL.Vector2(pt.x, -pt.y));
               const mirroredShape = createAbstractShape(mirroredPoints);
               const mirroredGeo = new THREE_ACTUAL.ExtrudeGeometry(mirroredShape, extrudeSettings);

               const angleStep = (Math.PI * 2) / abs.arms;
               for(let i=0; i<abs.arms; i++) {
                   const angle = i * angleStep + (abs.rotationOffset * Math.PI / 180);
                   
                   // Normal Instance
                   const absInst = normalGeo.clone();
                   absInst.translate(0, abs.mirrorOffset/2, -extrudeSettings.depth/2);
                   absInst.rotateZ(angle);
                   layerGeometries.push(absInst);

                   // Mirrored Instance
                   if (abs.mirrorEnabled) {
                       const mir = mirroredGeo.clone();
                       mir.translate(0, -abs.mirrorOffset/2, -extrudeSettings.depth/2);
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

      if (layerGeometries.length > 0) {
        let layerMerged = BufferGeometryUtils.mergeGeometries(layerGeometries);
        if (layerMerged) {
          layerMerged.rotateX(layer.rotation3D.x * Math.PI / 180);
          layerMerged.rotateY(layer.rotation3D.y * Math.PI / 180);
          if (config3D.slotEnabled) {
            layerMerged = applySlotCuts(
                layerMerged, 
                layer, 
                config3D.slotLength, 
                config3D.extrusionDepth, 
                config3D.bevelEnabled, 
                config3D.bevelAmount, 
                config3D.layers, 
                csgEvaluator.current
            );
            if (lIdx === 0) {
               layerMerged.rotateZ(Math.PI);
            }
          }
          // Extra manifold repair at the end
          const finalRepaired = repairGeometry(layerMerged, 0.001);
          const mesh = new THREE_ACTUAL.Mesh(finalRepaired || layerMerged);
          mesh.userData.layerId = layer.id;
          mesh.name = layer.name;
          group.add(mesh);
        }
      }
    }
    return group;
  }, [config3D, dynamicFonts]);

  // Download Helper
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
                // ALWAYS alert if floating bodies are detected
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
    } catch (e) { console.error("Export Failed", e); }
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
            // Check connectivity for single layer too
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
    } catch(e) { console.error(e); }
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
      } catch(e) { console.error(e); }
      setExportLoading(false);
  };

  // 2D Export Logic
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
      // DXF storage
      let dxfEntities = '';
      
      // Helper for DXF: Tessellate bezier curves into line segments
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
                  // Quadratic bezier tessellation
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
                  // Cubic bezier tessellation
                  const steps = 10;
                  for (let t = 1; t <= steps; t++) {
                      const tt = t / steps;
                      const u = 1 - tt;
                      const x = u*u*u*currentX + 3*u*u*tt*cmd.x1 + 3*u*tt*tt*cmd.x2 + tt*tt*tt*cmd.x;
                      const y = u*u*u*currentY + 3*u*u*tt*cmd.y1 + 3*u*tt*tt*cmd.y2 + tt*tt*tt*cmd.y;
                      points.push({x, y});
                  }
                  currentX = cmd.x; currentY = cmd.y;
              } else if (cmd.type === 'Z') {
                  // Close loop handled by polygon logic
              }
          });
          return points;
      };

      const addPathSVG = (d: string, transform: string) => {
         svgContent += `<path d="${d}" fill="none" stroke="black" stroke-width="1" transform="${transform}" />`;
      };

      const addPolyDXF = (pts: {x:number,y:number}[], transform: {x:number, y:number, rotation:number, scaleX:number, scaleY:number}) => {
          if (pts.length < 2) return;
          
          dxfEntities += "0\nLWPOLYLINE\n8\n0\n"; // Layer 0
          dxfEntities += `90\n${pts.length}\n`; // Number of vertices
          dxfEntities += "70\n1\n"; // Closed flag (assuming closed loops for text)
          
          const rad = transform.rotation * Math.PI / 180;
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);

          pts.forEach(p => {
              // Apply transform manually
              const sx = p.x * transform.scaleX;
              const sy = p.y * transform.scaleY;
              // Rotate then translate
              const rx = sx * cos - sy * sin;
              const ry = sx * sin + sy * cos;
              
              const finalX = rx + transform.x;
              const finalY = ry + transform.y;
              
              dxfEntities += `10\n${finalX.toFixed(4)}\n20\n${finalY.toFixed(4)}\n`;
          });
          dxfEntities += "0\n"; // End attributes for this entity? No, just next entity or seqend if polyline. LWPOLYLINE doesn't use SEQEND.
      };

      // Helper to generate path data
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
                 // DXF
                 // Normal
                 addPolyDXF(points, { 
                     x: group.textX, y: group.mirrorOffset/2, 
                     rotation: angle, scaleX: 1, scaleY: -1 // Font y-up vs usual y-down, keeping consistency
                 });
                 // Mirror
                 if (group.mirrorEnabled) {
                     addPolyDXF(points, { 
                         x: group.textX, y: -group.mirrorOffset/2, 
                         rotation: angle, scaleX: 1, scaleY: 1
                     });
                 }
             }
         }
      };

      processGroup(layer.primary);
      if (layer.secondaryEnabled) processGroup(layer.secondary);

      if (format === 'svg') {
         const finalSvg = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="-250 -250 500 500" width="500mm" height="500mm">
               <g transform="scale(1, -1)">
                  ${svgContent}
               </g>
            </svg>
         `;
         const blob = new Blob([finalSvg], { type: 'image/svg+xml' });
         downloadBlob(blob, `${config.projectName}_${layer.name}.svg`);
      } 
      else if (format === 'dxf') {
          let dxf = `0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n`;
          dxf += dxfEntities;
          dxf += `0\nENDSEC\n0\nEOF\n`;
          
          const blob = new Blob([dxf], { type: 'application/dxf' });
          downloadBlob(blob, `${config.projectName}_${layer.name}.dxf`);
      }

    } catch (e) { console.error(e); }
    setExportLoading(false);
  };

  const handleSaveProject = () => {
    const json = JSON.stringify(config, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    downloadBlob(blob, `${config.projectName}.json`);
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
        setHistory([loaded]);
        setHistoryIndex(0);
      } catch (err) {
        console.error(err);
        alert("Failed to load project file.");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const effectiveSlotWidth = config.extrusionDepth + (config.bevelEnabled ? config.bevelAmount * 2 : 0) + 0.2;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-sky-500/30">
      <div className="max-w-[1800px] mx-auto p-6 h-screen flex flex-col gap-6">
        <Header 
          projectName={config.projectName} 
          onProjectNameChange={(n) => handleUpdateConfig({ projectName: n }, true)} 
          onSaveConfig={handleSaveProject} 
          onLoadConfig={handleLoadProject} 
        />
        <div className="flex gap-6 flex-1 min-h-0">
          <div className="w-[420px] h-full flex flex-col bg-slate-900/50 backdrop-blur-sm rounded-2xl border border-white/5 overflow-hidden shadow-2xl">
            <ControlPanel 
              config={config} 
              onUpdate={handleUpdateConfig} 
              updateGroup={updateGroup}
              updateCharOffset={updateCharOffset}
              updateHubs={updateHubs}
              updateAbstracts={updateAbstracts}
              onAiPolish={() => {}} 
              aiLoading={aiLoading} 
              onExportSTL={handleExportSTL} 
              onExportLayerSTL={handleExportLayerSTL} 
              onExportAllLayersZip={handleExportAllLayersZip} 
              onExport2D={handleExport2D}
              exportLoading={exportLoading} 
              onFetchFont={async () => true} 
              onFontUpload={() => {}} 
              dynamicFonts={dynamicFonts} 
              onAutoConfigureSlots={() => handleUpdateConfig({ layers: calculateOptimalSlots(config.layers), slotEnabled: true }, true)} 
              undo={undo} 
              redo={redo} 
              canUndo={canUndo} 
              canRedo={canRedo} 
            />
          </div>
          <div className="flex-1 relative bg-slate-900/30 rounded-2xl border border-white/5 overflow-hidden shadow-inner">
            <div className="absolute top-6 right-6 z-50">
               <div className="flex bg-slate-950/80 backdrop-blur rounded-lg p-1 border border-white/10 shadow-xl">
                 <button 
                    onClick={() => setViewMode('2d')} 
                    className={`px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all ${viewMode === '2d' ? 'bg-sky-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                  >
                    2D Design
                 </button>
                 <button 
                    onClick={() => setViewMode('3d')} 
                    className={`px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all ${viewMode === '3d' ? 'bg-sky-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                  >
                    3D Preview
                 </button>
               </div>
            </div>
            <div className="w-full h-full">
               {viewMode === '2d' ? <SnowflakePreview config={config} globalColor={config.color} globalBevel={config.bevelEnabled} globalBevelAmount={config.bevelAmount} globalThickness={config.extrusionDepth} slotEnabled={config.slotEnabled} slotLength={config.slotLength} slotWidth={effectiveSlotWidth} svgRef={svgRef} dynamicFonts={dynamicFonts} undo={undo} redo={redo} canUndo={canUndo} canRedo={canRedo} /> : <Snowflake3D config={config3D} generateMesh={generateMesh} />}
            </div>
          </div>
        </div>
      </div>
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept=".json" 
        onChange={handleFileLoad} 
      />
    </div>
  );
};

export default App;
