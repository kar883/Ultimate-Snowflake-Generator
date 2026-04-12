import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
// @ts-ignore
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
// @ts-ignore
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils';
import { SnowflakeConfig, ShortcutConfig, DesignQuality } from '../types';

const SLOT_DEBUG_OVERLAY_ENABLED = true;

function createSlotDebugCuttersForLayer(
  layer: SnowflakeConfig['layers'][number],
  layerIndex: number,
  enabledLayers: SnowflakeConfig['layers'],
  config: SnowflakeConfig,
  materialThickness: number,
  centerZ: number
): THREE.BufferGeometry[] {
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

  const cutters: THREE.BufferGeometry[] = [];
  const addCutter = (
    nearX: number,
    length: number,
    slotThickness: number,
    rotXDeg: number,
    rotZDeg: number,
    yOffset = 0
  ) => {
    if (length <= 0.01 || slotThickness <= 0.01) return;
    const g = new THREE.BoxGeometry(length, fullPunch, slotThickness);
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
    addCutter(-drawLength, tipInLength, halfChannel, 240, -(armAngle + 180), -((bridge / 2) + (halfChannel / 2)));
    return cutters;
  }

  if (layerIndex === 2) {
    addCutter(0, adjLength, halfChannel, 120, -armAngle, -((bridge / 2) + (halfChannel / 2)));
    addCutter(-drawLength, tipInLength, Math.max(0.12, halfChannel * 0.8), 120, -(armAngle + 180), (bridge / 2) + (halfChannel / 2));
    return cutters;
  }

  return cutters;
}

// ─────────────────────────────────────────────────────────────────────────────
// Identify disconnected mesh bodies for the "ID Bodies" diagnostic tool.
//
// The geometry is a set of flat extruded slabs (all at the same Z range).
// Adjacent shapes that overlap or touch in XY have zero vertex proximity —
// their outline vertices sit on their own perimeters and never coincide.
// Vertex-welding or vertex-proximity bridging cannot connect them.
//
// Correct approach — three phases:
//
//  1. BFS on triangle adjacency (standard connected components per mesh island).
//     This correctly separates things like a unicorn body from a floating eye.
//
//  2. 2D overlap test: for each raw body, sample the XY centroid of every Nth
//     triangle.  For each sample, test whether it falls inside any triangle of
//     any other raw body (ignoring Z).  If yes → the two bodies physically
//     overlap/touch and should be treated as one connected piece.
//     Uses union-find to propagate transitivity (A∩B, B∩C → A=B=C).
//
//  3. Remap raw body IDs through union-find and paint vertex colors.
// ─────────────────────────────────────────────────────────────────────────────

// Point-in-triangle (2D, sign test)
function ptInTri2D(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number
): boolean {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function findConnectedBodies(geo: THREE.BufferGeometry): {
  bodyPerVertex: Int32Array;
  bodyCount: number;
} {
  const origPos   = geo.attributes.position;
  const origCount = origPos.count;
  const idx       = geo.index;
  const triCount  = idx ? idx.count / 3 : origCount / 3;

  const vi = (t: number, k: number) =>
    idx ? idx.getX(t * 3 + k) : t * 3 + k;

  // ── Phase 1: BFS on triangle adjacency ───────────────────────────────────
  // Build compact linked-list adjacency (avoids Set<> GC pressure).
  const adjHead = new Int32Array(origCount).fill(-1);
  const adjNext: number[] = [];
  const adjDest: number[] = [];
  const addEdge = (a: number, b: number) => {
    adjNext.push(adjHead[a]); adjDest.push(b); adjHead[a] = adjNext.length - 1;
    adjNext.push(adjHead[b]); adjDest.push(a); adjHead[b] = adjNext.length - 1;
  };
  for (let t = 0; t < triCount; t++) {
    const a = vi(t, 0), b = vi(t, 1), c = vi(t, 2);
    if (a === b || b === c || a === c) continue;
    addEdge(a, b); addEdge(b, c); addEdge(a, c);
  }

  const bpv = new Int32Array(origCount).fill(-1);
  let rawCount = 0;
  const queue = new Int32Array(origCount);
  for (let start = 0; start < origCount; start++) {
    if (bpv[start] !== -1) continue;
    let head = 0, tail = 0;
    queue[tail++] = start;
    bpv[start] = rawCount;
    while (head < tail) {
      const cur = queue[head++];
      for (let e = adjHead[cur]; e !== -1; e = adjNext[e]) {
        const nb = adjDest[e];
        if (bpv[nb] === -1) { bpv[nb] = rawCount; queue[tail++] = nb; }
      }
    }
    rawCount++;
  }

  if (rawCount <= 1) {
    return { bodyPerVertex: bpv.map(v => Math.max(v, 0)) as unknown as Int32Array, bodyCount: rawCount };
  }

  // ── Phase 2: 2D overlap union-find ───────────────────────────────────────
  // For each raw body collect its triangles' XY data.
  // We sample every SAMPLE_STRIDE-th triangle centroid of each body and test
  // whether it sits inside any triangle of any other body.
  const SAMPLE_STRIDE = 4; // check 1 in 4 triangles as probe points

  // bodyTris[b] = flat array [ax,ay, bx,by, cx,cy, ...] for body b
  const bodyTris: Float32Array[] = new Array(rawCount);
  const bodyTriBufs: number[][] = Array.from({ length: rawCount }, () => []);

  for (let t = 0; t < triCount; t++) {
    const a = vi(t, 0), b = vi(t, 1), c = vi(t, 2);
    const body = bpv[a];
    if (body < 0) continue;
    bodyTriBufs[body].push(
      origPos.getX(a), origPos.getY(a),
      origPos.getX(b), origPos.getY(b),
      origPos.getX(c), origPos.getY(c),
    );
  }
  for (let b = 0; b < rawCount; b++) {
    bodyTris[b] = new Float32Array(bodyTriBufs[b]);
  }

  // Grid-accelerate lookups: bucket each body's triangles by cell.
  // Cell size = rough triangle size estimate.
  const CELL = 5; // mm — coarse grid, fine enough for typical ornament features
  // For each body build a map: cellKey → [triIndex, triIndex, ...]
  type Grid = Map<number, number[]>;
  const bodyGrid: Grid[] = new Array(rawCount);
  for (let b = 0; b < rawCount; b++) {
    const tris = bodyTris[b];
    const grid: Grid = new Map();
    const n = tris.length / 6;
    for (let t = 0; t < n; t++) {
      const o = t * 6;
      const minX = Math.min(tris[o], tris[o+2], tris[o+4]);
      const maxX = Math.max(tris[o], tris[o+2], tris[o+4]);
      const minY = Math.min(tris[o+1], tris[o+3], tris[o+5]);
      const maxY = Math.max(tris[o+1], tris[o+3], tris[o+5]);
      const x0 = Math.floor(minX / CELL), x1 = Math.floor(maxX / CELL);
      const y0 = Math.floor(minY / CELL), y1 = Math.floor(maxY / CELL);
      for (let gx = x0; gx <= x1; gx++) {
        for (let gy = y0; gy <= y1; gy++) {
          const key = gx * 100000 + gy;
          let bucket = grid.get(key);
          if (!bucket) { bucket = []; grid.set(key, bucket); }
          bucket.push(t);
        }
      }
    }
    bodyGrid[b] = grid;
  }

  // Test whether point (px,py) is inside any triangle of body b via grid
  const pointInBody = (px: number, py: number, b: number): boolean => {
    const gx = Math.floor(px / CELL);
    const gy = Math.floor(py / CELL);
    const tris = bodyTris[b];
    const grid = bodyGrid[b];
    // Check the point's cell and 8 neighbours
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = grid.get((gx + dx) * 100000 + (gy + dy));
        if (!bucket) continue;
        for (const t of bucket) {
          const o = t * 6;
          if (ptInTri2D(px, py,
            tris[o], tris[o+1],
            tris[o+2], tris[o+3],
            tris[o+4], tris[o+5])) return true;
        }
      }
    }
    return false;
  };

  // Union-Find
  const parent = Int32Array.from({ length: rawCount }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  };
  const union = (a: number, b: number) => {
    a = find(a); b = find(b); if (a !== b) parent[a] = b;
  };

  // For each body A, sample every SAMPLE_STRIDE-th triangle centroid and test
  // whether it's inside any other body B.
  for (let a = 0; a < rawCount; a++) {
    const trisA = bodyTris[a];
    const nA = trisA.length / 6;
    for (let t = 0; t < nA; t += SAMPLE_STRIDE) {
      const o = t * 6;
      // centroid of this triangle
      const px = (trisA[o] + trisA[o+2] + trisA[o+4]) / 3;
      const py = (trisA[o+1] + trisA[o+3] + trisA[o+5]) / 3;
      for (let b = 0; b < rawCount; b++) {
        if (find(a) === find(b)) continue; // already merged
        if (pointInBody(px, py, b)) { union(a, b); break; }
      }
    }
  }

  // ── Phase 3: remap raw IDs → merged IDs ──────────────────────────────────
  const rootToId = new Map<number, number>();
  let bodyCount = 0;
  const remap = new Int32Array(rawCount);
  for (let b = 0; b < rawCount; b++) {
    const r = find(b);
    if (!rootToId.has(r)) rootToId.set(r, bodyCount++);
    remap[b] = rootToId.get(r)!;
  }
  const bodyPerVertex = new Int32Array(origCount);
  for (let i = 0; i < origCount; i++) {
    bodyPerVertex[i] = bpv[i] >= 0 ? remap[bpv[i]] : 0;
  }

  return { bodyPerVertex, bodyCount };
}

// Build per-vertex colour attribute.
// The largest connected body gets the design color; each isolated floating body
// gets a stark, high-contrast color so it's immediately obvious.
const FLOAT_PALETTE = [
  '#ff1744', // red
  '#ffea00', // yellow
  '#00e676', // green
  '#e040fb', // purple
  '#ff6d00', // orange
  '#00b0ff', // light blue
  '#f50057', // pink
  '#76ff03', // lime
  '#1de9b6', // teal
  '#ff9100', // amber
];

function buildBodyColors(
  geo: THREE.BufferGeometry,
  bpv: Int32Array,
  bodyCount: number,
  designColor: string
): THREE.BufferAttribute {
  const posCount = geo.attributes.position.count;

  // Find the largest body — that's the "main" connected mesh
  const sizes = new Int32Array(bodyCount);
  for (let i = 0; i < posCount; i++) if (bpv[i] >= 0) sizes[bpv[i]]++;
  let mainBody = 0;
  for (let b = 1; b < bodyCount; b++) if (sizes[b] > sizes[mainBody]) mainBody = b;

  // Map: main body → design color, all others → distinct stark palette colors
  const bodyToColor = new Array<THREE.Color>(bodyCount);
  const mainCol = new THREE.Color(designColor);
  const pal = FLOAT_PALETTE.map(h => new THREE.Color(h));
  let slot = 0;
  for (let b = 0; b < bodyCount; b++) {
    bodyToColor[b] = (b === mainBody) ? mainCol : pal[slot++ % pal.length];
  }

  const arr = new Float32Array(posCount * 3);
  for (let i = 0; i < posCount; i++) {
    const c = bpv[i] >= 0 ? bodyToColor[bpv[i]] : mainCol;
    arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
  }
  return new THREE.BufferAttribute(arr, 3);
}

// ─────────────────────────────────────────────────────────────────────────────
// Dynamic XYZ orientation gizmo
// ─────────────────────────────────────────────────────────────────────────────
const XYZGizmo: React.FC<{
  camQ: THREE.Quaternion | null;
  onSnapDirection?: (direction: THREE.Vector3) => void;
  onRotateStep?: (dir: 'left' | 'right' | 'up' | 'down') => void;
}> = ({ camQ, onSnapDirection, onRotateStep }) => {
  const [hovered, setHovered] = useState<{ kind: 'face' | 'edge' | 'corner' | 'arrow'; key: string; label: string } | null>(null);
  const size = 115;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 64.0625;

  if (!camQ) {
    return (
      <svg width={size} height={size} className="select-none">
        <circle cx={cx} cy={cy} r={52.5} fill="rgba(15,23,42,0.72)" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
      </svg>
    );
  }

  const keyFrom = (x: number, y: number, z: number) => `${x > 0 ? 'p' : 'n'}${y > 0 ? 'p' : 'n'}${z > 0 ? 'p' : 'n'}`;
  const parseKey = (k: string) => ({
    x: k[0] === 'p' ? 1 : -1,
    y: k[1] === 'p' ? 1 : -1,
    z: k[2] === 'p' ? 1 : -1,
  });

  const corners3D = [
    new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, -1), new THREE.Vector3(1, -1, 1), new THREE.Vector3(1, -1, -1),
    new THREE.Vector3(-1, 1, 1), new THREE.Vector3(-1, 1, -1), new THREE.Vector3(-1, -1, 1), new THREE.Vector3(-1, -1, -1),
  ];

  const projected = new Map<string, { x: number; y: number; depth: number; world: THREE.Vector3 }>();
  corners3D.forEach(v => {
    const vr = v.clone().normalize().applyQuaternion(camQ);
    projected.set(keyFrom(v.x, v.y, v.z), {
      x: cx + vr.x * radius,
      y: cy - vr.y * radius,
      depth: vr.z,
      world: v.clone(),
    });
  });

  const faceDefs = [
    { key: 'px', normal: new THREE.Vector3(1, 0, 0), corners: ['ppp', 'ppn', 'pnn', 'pnp'], color: 'rgba(239,68,68,0.34)' },
    { key: 'nx', normal: new THREE.Vector3(-1, 0, 0), corners: ['npp', 'npn', 'nnn', 'nnp'], color: 'rgba(239,68,68,0.18)' },
    { key: 'py', normal: new THREE.Vector3(0, 1, 0), corners: ['ppp', 'ppn', 'npn', 'npp'], color: 'rgba(34,197,94,0.34)' },
    { key: 'ny', normal: new THREE.Vector3(0, -1, 0), corners: ['pnp', 'pnn', 'nnn', 'nnp'], color: 'rgba(34,197,94,0.18)' },
    { key: 'pz', normal: new THREE.Vector3(0, 0, 1), corners: ['ppp', 'npp', 'nnp', 'pnp'], color: 'rgba(59,130,246,0.34)' },
    { key: 'nz', normal: new THREE.Vector3(0, 0, -1), corners: ['ppn', 'npn', 'nnn', 'pnn'], color: 'rgba(59,130,246,0.18)' },
  ].map(f => {
    const points = f.corners.map(k => projected.get(k)!);
    const depth = points.reduce((sum, p) => sum + p.depth, 0) / points.length;
    return { ...f, points, depth };
  }).sort((a, b) => a.depth - b.depth);

  const edgeDefs: Array<[string, string]> = [
    ['ppp', 'ppn'], ['ppp', 'pnp'], ['ppp', 'npp'], ['ppn', 'pnn'],
    ['ppn', 'npn'], ['pnp', 'pnn'], ['pnp', 'nnp'], ['pnn', 'nnn'],
    ['npp', 'npn'], ['npp', 'nnp'], ['npn', 'nnn'], ['nnp', 'nnn'],
  ];

  const faceLabelByKey: Record<string, string> = {
    px: 'Snap Right Face',
    nx: 'Snap Left Face',
    py: 'Snap Top Face',
    ny: 'Snap Bottom Face',
    pz: 'Snap Front Face',
    nz: 'Snap Back Face',
  };

  const edgeItems = edgeDefs.map(([a, b], i) => {
    const pa = projected.get(a)!;
    const pb = projected.get(b)!;
    const aa = parseKey(a);
    const bb = parseKey(b);
    const snapVec = new THREE.Vector3(
      aa.x + bb.x,
      aa.y + bb.y,
      aa.z + bb.z,
    ).normalize();
    const key = `${a}-${b}`;
    return { key, i, pa, pb, snapVec };
  });

  const cornerItems = Array.from(projected.entries()).map(([key, p]) => {
    const s = parseKey(key);
    const cornerVec = new THREE.Vector3(s.x, s.y, s.z).normalize();
    return { key, p, cornerVec };
  });

  return (
    <svg width={size} height={size} className="select-none">
      <defs>
        <radialGradient id="gizmoBg" cx="35%" cy="30%">
          <stop offset="0%" stopColor="rgba(30,41,59,0.95)" />
          <stop offset="100%" stopColor="rgba(2,6,23,0.92)" />
        </radialGradient>
      </defs>

      <circle cx={cx} cy={cy} r={52.5} fill="url(#gizmoBg)" stroke="rgba(148,163,184,0.25)" strokeWidth="1" />

      {faceDefs.map(face => (
        <polygon
          key={face.key}
          points={face.points.map(p => `${p.x},${p.y}`).join(' ')}
          fill={face.color}
          stroke="rgba(148,163,184,0.28)"
          strokeWidth="0.9"
          className="cursor-pointer"
          data-gizmo-interactive="true"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            onSnapDirection?.(face.normal.clone());
          }}
        />
      ))}

      {/* Base cube edge wireframe (subtle, always visible) */}
      {edgeItems.map(({ key, pa, pb }) => (
        <line
          key={`edge-base-${key}`}
          x1={pa.x}
          y1={pa.y}
          x2={pb.x}
          y2={pb.y}
          stroke="rgba(203,213,225,0.35)"
          strokeWidth="0.95"
        />
      ))}

      {/* Hover highlight overlays */}
      {hovered?.kind === 'face' && (() => {
        const face = faceDefs.find(f => f.key === hovered.key);
        if (!face) return null;
        return (
          <polygon
            points={face.points.map(p => `${p.x},${p.y}`).join(' ')}
            fill="rgba(248,250,252,0.08)"
            stroke="rgba(248,250,252,0.9)"
            strokeWidth="1.5"
          />
        );
      })()}
      {hovered?.kind === 'edge' && (() => {
        const edge = edgeItems.find(e => e.key === hovered.key);
        if (!edge) return null;
        return (
          <line
            x1={edge.pa.x}
            y1={edge.pa.y}
            x2={edge.pb.x}
            y2={edge.pb.y}
            stroke="rgba(248,250,252,0.95)"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        );
      })()}
      {hovered?.kind === 'corner' && (() => {
        const corner = cornerItems.find(c => c.key === hovered.key);
        if (!corner) return null;
        return (
          <circle
            cx={corner.p.x}
            cy={corner.p.y}
            r="5.1"
            fill="none"
            stroke="rgba(248,250,252,0.95)"
            strokeWidth="1.6"
          />
        );
      })()}

      {/* Face hit zones */}
      {faceDefs.map(face => (
        <polygon
          key={`hot-${face.key}`}
          points={face.points.map(p => `${p.x},${p.y}`).join(' ')}
          fill="transparent"
          className="cursor-pointer"
          data-gizmo-interactive="true"
          onMouseEnter={() => setHovered({ kind: 'face', key: face.key, label: faceLabelByKey[face.key] || 'Face' })}
          onMouseLeave={() => setHovered(null)}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            onSnapDirection?.(face.normal.clone());
          }}
        />
      ))}

      {/* Edge hit zones (invisible until hovered) */}
      {edgeItems.map(({ key, pa, pb, snapVec }) => (
        <line
          key={`edge-hit-${key}`}
          x1={pa.x}
          y1={pa.y}
          x2={pb.x}
          y2={pb.y}
          stroke="rgba(0,0,0,0)"
          strokeWidth="8"
          className="cursor-pointer"
          data-gizmo-interactive="true"
          onMouseEnter={() => setHovered({ kind: 'edge', key, label: 'Snap Edge View' })}
          onMouseLeave={() => setHovered(null)}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            onSnapDirection?.(snapVec.clone());
          }}
        />
      ))}

      {/* Corner hit zones (invisible until hovered) */}
      {cornerItems.map(({ key, p, cornerVec }) => (
        <circle
          key={`corner-hit-${key}`}
          cx={p.x}
          cy={p.y}
          r="6.4"
          fill="rgba(0,0,0,0)"
          className="cursor-pointer"
          data-gizmo-interactive="true"
          onMouseEnter={() => setHovered({ kind: 'corner', key, label: 'Snap Corner View' })}
          onMouseLeave={() => setHovered(null)}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            onSnapDirection?.(cornerVec.clone());
          }}
        />
      ))}

      {/* Curved step-rotation arrows around the cube */}
      <g>
        <g
          className="cursor-pointer"
          data-gizmo-interactive="true"
          onMouseEnter={() => setHovered({ kind: 'arrow', key: 'left', label: 'Rotate Left' })}
          onMouseLeave={() => setHovered(null)}
          onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={(e) => { e.stopPropagation(); onRotateStep?.('left'); }}
        >
          <circle cx="10" cy={cy} r="8" fill="rgba(15,23,42,0.88)" stroke="rgba(148,163,184,0.45)" strokeWidth="0.9" />
          <path d={`M 13.2 ${cy - 3.8} A 4.8 4.8 0 1 0 13.2 ${cy + 3.8}`} fill="none" stroke="rgba(226,232,240,0.92)" strokeWidth="1.2" strokeLinecap="round" />
          <path d={`M 10.5 ${cy - 2.7} L 12.9 ${cy - 3.4} L 12.3 ${cy - 1.0} Z`} fill="rgba(226,232,240,0.92)" />
        </g>

        <g
          className="cursor-pointer"
          data-gizmo-interactive="true"
          onMouseEnter={() => setHovered({ kind: 'arrow', key: 'right', label: 'Rotate Right' })}
          onMouseLeave={() => setHovered(null)}
          onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={(e) => { e.stopPropagation(); onRotateStep?.('right'); }}
        >
          <circle cx={size - 10} cy={cy} r="8" fill="rgba(15,23,42,0.88)" stroke="rgba(148,163,184,0.45)" strokeWidth="0.9" />
          <path d={`M ${size - 13.2} ${cy + 3.8} A 4.8 4.8 0 1 0 ${size - 13.2} ${cy - 3.8}`} fill="none" stroke="rgba(226,232,240,0.92)" strokeWidth="1.2" strokeLinecap="round" />
          <path d={`M ${size - 10.5} ${cy + 2.7} L ${size - 12.9} ${cy + 3.4} L ${size - 12.3} ${cy + 1.0} Z`} fill="rgba(226,232,240,0.92)" />
        </g>

        <g
          className="cursor-pointer"
          data-gizmo-interactive="true"
          onMouseEnter={() => setHovered({ kind: 'arrow', key: 'up', label: 'Rotate Up' })}
          onMouseLeave={() => setHovered(null)}
          onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={(e) => { e.stopPropagation(); onRotateStep?.('up'); }}
        >
          <circle cx={cx} cy="10" r="8" fill="rgba(15,23,42,0.88)" stroke="rgba(148,163,184,0.45)" strokeWidth="0.9" />
          <path d={`M ${cx - 3.8} 13.2 A 4.8 4.8 0 1 1 ${cx + 3.8} 13.2`} fill="none" stroke="rgba(226,232,240,0.92)" strokeWidth="1.2" strokeLinecap="round" />
          <path d={`M ${cx - 2.7} 10.5 L ${cx - 3.4} 12.9 L ${cx - 1.0} 12.3 Z`} fill="rgba(226,232,240,0.92)" />
        </g>

        <g
          className="cursor-pointer"
          data-gizmo-interactive="true"
          onMouseEnter={() => setHovered({ kind: 'arrow', key: 'down', label: 'Rotate Down' })}
          onMouseLeave={() => setHovered(null)}
          onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={(e) => { e.stopPropagation(); onRotateStep?.('down'); }}
        >
          <circle cx={cx} cy={size - 10} r="8" fill="rgba(15,23,42,0.88)" stroke="rgba(148,163,184,0.45)" strokeWidth="0.9" />
          <path d={`M ${cx + 3.8} ${size - 13.2} A 4.8 4.8 0 1 1 ${cx - 3.8} ${size - 13.2}`} fill="none" stroke="rgba(226,232,240,0.92)" strokeWidth="1.2" strokeLinecap="round" />
          <path d={`M ${cx + 2.7} ${size - 10.5} L ${cx + 3.4} ${size - 12.9} L ${cx + 1.0} ${size - 12.3} Z`} fill="rgba(226,232,240,0.92)" />
        </g>
      </g>

      {hovered?.label && (
        <g>
          <rect x={cx - 36} y={size - 20} width="72" height="14" rx="3" fill="rgba(2,6,23,0.95)" stroke="rgba(148,163,184,0.45)" strokeWidth="0.8" />
          <text x={cx} y={size - 10.2} textAnchor="middle" fill="rgba(226,232,240,0.98)" fontSize="7.8" fontWeight="800">{hovered.label}</text>
        </g>
      )}
    </svg>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
interface Snowflake3DProps {
  config: SnowflakeConfig;
  generateMesh: (onProgress: (p: number) => void, overrideQuality?: DesignQuality, overrideConfig?: SnowflakeConfig) => Promise<THREE.Group>;
  color: string;
  undo?: () => void;
  redo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  initialDiameter?: number;
  shortcuts?: ShortcutConfig;
  isVisible: boolean;
}

// Worker code at module scope — array of lines avoids Babel TSX template-literal parsing.
const BODIES_WORKER_CODE = [
  "",
  "// ------ Fast connected-bodies analysis ---------------------------------------------------------------------------------------------------------------------------",
  "// Approach:",
  "//  1. Deduplicate vertices at tight tolerance (0.01mm) to collapse only",
  "//     true duplicates from ExtrudeGeometry, reducing 600k --- ~50k nodes.",
  "//  2. BFS on deduplicated triangle adjacency --- raw topological islands.",
  "//     Flat extruded shapes that overlap in XY but share no vertices will",
  "//     remain separate islands here --- that's expected.",
  "//  3. Per-island: compute XY centroid and AABB.",
  "//  4. Union-find merge: for each island A, test if its centroid lands inside",
  "//     any other island B's triangles (AABB pre-filter, then point-in-tri).",
  "//     Also test B's centroid against A --- bidirectional catches asymmetric overlaps.",
  "//  5. Guard: if rawCount > MAX_ISLANDS after BFS, skip overlap phase entirely",
  "//     (geometry is pathologically fragmented; report each island separately).",
  "//  6. Remap and colorize.",
  "",
  "function ptInTri2D(px,py,ax,ay,bx,by,cx,cy){",
  "  const d1=(px-bx)*(ay-by)-(ax-bx)*(py-by);",
  "  const d2=(px-cx)*(by-cy)-(bx-cx)*(py-cy);",
  "  const d3=(px-ax)*(cy-ay)-(cx-ax)*(py-ay);",
  "  return !((d1<0||d2<0||d3<0)&&(d1>0||d2>0||d3>0));",
  "}",
  "",
  "self.onmessage = function(e) {",
  "  const {positions, indices, designColor} = e.data;",
  "  try {",
  "    const origCount = positions.length / 3;",
  "    const triCount  = indices ? indices.length / 3 : origCount / 3;",
  "    const vi = (t,k) => indices ? indices[t*3+k] : t*3+k;",
  "",
  "    // ------------ Step 1: tight vertex dedup (0.001mm) ----------------------------------------------------------------------------------",
  "    // Only collapse true duplicates ------ keeps distinct outline vertices separate.",
  "    // Use string keys to avoid integer overflow in hash arithmetic.",
  "    const DEDUP_CELL = 0.001;",
  "    const posToCanon = new Int32Array(origCount);",
  "    const hashMap = new Map();",
  "    let canonCount = 0;",
  "    for (let i = 0; i < origCount; i++) {",
  "      const x=positions[i*3], y=positions[i*3+1], z=positions[i*3+2];",
  "      const key = Math.round(x/DEDUP_CELL)+','",
  "                + Math.round(y/DEDUP_CELL)+','",
  "                + Math.round(z/DEDUP_CELL);",
  "      let c = hashMap.get(key);",
  "      if (c === undefined) { c = canonCount++; hashMap.set(key, c); }",
  "      posToCanon[i] = c;",
  "    }",
  "",
  "    // ------------ Step 2: BFS on deduplicated triangle adjacency ------------------------------------------------------------------------------------------------------------------------------------------------",
  "    const adjHead = new Int32Array(canonCount).fill(-1);",
  "    const adjNext = []; const adjDest = [];",
  "    const addEdge = (a,b) => {",
  "      adjNext.push(adjHead[a]); adjDest.push(b); adjHead[a]=adjNext.length-1;",
  "      adjNext.push(adjHead[b]); adjDest.push(a); adjHead[b]=adjNext.length-1;",
  "    };",
  "    for (let t = 0; t < triCount; t++) {",
  "      const a=posToCanon[vi(t,0)], b=posToCanon[vi(t,1)], c=posToCanon[vi(t,2)];",
  "      if(a===b||b===c||a===c) continue;",
  "      addEdge(a,b); addEdge(b,c); addEdge(a,c);",
  "    }",
  "    const canonBody = new Int32Array(canonCount).fill(-1);",
  "    let rawCount = 0;",
  "    const queue = new Int32Array(canonCount);",
  "    for (let s = 0; s < canonCount; s++) {",
  "      if (canonBody[s] !== -1) continue;",
  "      let head=0,tail=0; queue[tail++]=s; canonBody[s]=rawCount;",
  "      while(head<tail){",
  "        const cur=queue[head++];",
  "        for(let e=adjHead[cur];e!==-1;e=adjNext[e]){",
  "          const nb=adjDest[e];",
  "          if(canonBody[nb]===-1){canonBody[nb]=rawCount;queue[tail++]=nb;}",
  "        }",
  "      }",
  "      rawCount++;",
  "    }",
  "    const origBody = new Int32Array(origCount);",
  "    for (let i = 0; i < origCount; i++) origBody[i] = canonBody[posToCanon[i]] ?? 0;",
  "",
  "    // Guard: too many raw islands means something pathological ------ skip overlap phase",
  "    const MAX_ISLANDS = 2000;",
  "    console.log('[Worker] origCount=' + origCount + ' canonCount=' + canonCount + ' rawCount=' + rawCount);",
  "    if (rawCount <= 1 || rawCount > MAX_ISLANDS) {",
  "      const colorArr = buildBodyColors(origBody, Math.min(rawCount,MAX_ISLANDS), designColor, origCount);",
  "      self.postMessage({success:true,bodyPerVertex:origBody,bodyCount:rawCount,colorArr},",
  "        [origBody.buffer,colorArr.buffer]); return;",
  "    }",
  "",
  "    // ------------ Step 3: Check for shared vertices (physical connection) ------",
  "    // Two bodies are connected if they share any deduplicated (canonical) vertices.",
  "    // This correctly identifies touching/overlapping geometry.",
  "    const bodyCanonVerts = Array.from({length:rawCount},()=>new Set());",
  "    const bodyEdges = Array.from({length:rawCount},()=>new Set());",
  "    for(let i=0;i<origCount;i++){",
  "      const b=origBody[i];",
  "      const cv=posToCanon[i];",
  "      bodyCanonVerts[b].add(cv);",
  "    }",
  "    // Build edge list per body: for each triangle, add its three edges",
  "    for(let t=0;t<triCount;t++){",
  "      const a=posToCanon[vi(t,0)], b_v=posToCanon[vi(t,1)], c=posToCanon[vi(t,2)];",
  "      if(a===b_v || b_v===c || a===c) continue;",
  "      const b=origBody[vi(t,0)];",
  "      // Create edge hashes (order-invariant)",
  "      const e1=a<b_v ? a+','+b_v : b_v+','+a;",
  "      const e2=b_v<c ? b_v+','+c : c+','+b_v;",
  "      const e3=a<c ? a+','+c : c+','+a;",
  "      bodyEdges[b].add(e1); bodyEdges[b].add(e2); bodyEdges[b].add(e3);",
  "    }",
  "",
  "    // ------------ Step 4: Union-Find merge on shared edges ------",
  "    const parent=Int32Array.from({length:rawCount},(_,i)=>i);",
  "    const find=x=>{while(parent[x]!==x){parent[x]=parent[parent[x]];x=parent[x];}return x;};",
  "    const union=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent[a]=b;};",
  "",
  "    for(let a=0;a<rawCount;a++){",
  "      const aEdges=bodyEdges[a];",
  "      for(let b=a+1;b<rawCount;b++){",
  "        if(find(a)===find(b)) continue;",
  "        const bEdges=bodyEdges[b];",
  "        // Check if the two bodies share any edges (which means they touch)",
  "        let sharesEdge=false;",
  "        for(const e of aEdges){if(bEdges.has(e)){sharesEdge=true;break;}}",
  "        if(sharesEdge) union(a,b);",
  "      }",
  "    }",
  "",
  "    // ------------ Step 5: remap ------",
  "    const rootToId=new Map(); let bodyCount=0;",
  "    const remap=new Int32Array(rawCount);",
  "    for(let b=0;b<rawCount;b++){",
  "      const r=find(b);",
  "      if(!rootToId.has(r))rootToId.set(r,bodyCount++);",
  "      remap[b]=rootToId.get(r);",
  "    }",
  "    const bodyPerVertex=new Int32Array(origCount);",
  "    for(let i=0;i<origCount;i++) bodyPerVertex[i]=remap[origBody[i]]??0;",
  "",
  "    const colorArr=buildBodyColors(bodyPerVertex,bodyCount,designColor,origCount);",
  "    console.log('[Worker] Final bodyCount=' + bodyCount + ' after merge');",
  "    self.postMessage({success:true,bodyPerVertex,bodyCount,colorArr},",
  "      [bodyPerVertex.buffer,colorArr.buffer]);",
  "",
  "  } catch(err) {",
  "    self.postMessage({success:false,error:String(err)});",
  "  }",
  "};",
  "",
  "function buildBodyColors(bpv,bodyCount,designColor,origCount){",
  "  const PALETTE=['#ff1744','#ffea00','#00e676','#e040fb','#ff6d00',",
  "                 '#00b0ff','#f50057','#76ff03','#1de9b6','#ff9100'];",
  "  const hexToRgb=h=>{const n=parseInt(h.replace('#',''),16);",
  "    return[(n>>16&255)/255,(n>>8&255)/255,(n&255)/255];};",
  "  const sizes=new Int32Array(bodyCount);",
  "  for(let i=0;i<origCount;i++) if(bpv[i]>=0&&bpv[i]<bodyCount) sizes[bpv[i]]++;",
  "  let mainBody=0;",
  "  for(let b=1;b<bodyCount;b++) if(sizes[b]>sizes[mainBody]) mainBody=b;",
  "  const colors=[];let slot=0;",
  "  for(let b=0;b<bodyCount;b++)",
  "    colors.push(b===mainBody?hexToRgb(designColor):hexToRgb(PALETTE[slot++%PALETTE.length]));",
  "  const arr=new Float32Array(origCount*3);",
  "  for(let i=0;i<origCount;i++){",
  "    const idx=bpv[i]>=0&&bpv[i]<bodyCount?bpv[i]:0;",
  "    const c=colors[idx];",
  "    arr[i*3]=c[0];arr[i*3+1]=c[1];arr[i*3+2]=c[2];",
  "  }",
  "  return arr;",
  "}"
].join("\n");



const Snowflake3D: React.FC<Snowflake3DProps> = ({
  config, generateMesh, color,
  undo, redo, canUndo, canRedo,
  initialDiameter, isVisible,
}) => {
  const containerRef  = useRef<HTMLDivElement>(null);
  const rendererRef   = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef      = useRef<THREE.Scene | null>(null);
  const cameraRef     = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef   = useRef<OrbitControls | null>(null);
  const meshGroupRef  = useRef<THREE.Group | null>(null);
  const miniHostRef   = useRef<HTMLDivElement>(null);
  const miniRendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const miniSceneRef  = useRef<THREE.Scene | null>(null);
  const miniCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const miniModelGroupRef = useRef<THREE.Group | null>(null);
  const miniAnimRef = useRef<number | null>(null);
  const isVisibleRef  = useRef(isVisible);
  const frameRef      = useRef(0);
  const snapAnimRef   = useRef<number | null>(null);
  const gizmoDragRef  = useRef<{ active: boolean; moved: boolean; pointerId: number | null; x: number; y: number }>({
    active: false,
    moved: false,
    pointerId: null,
    x: 0,
    y: 0,
  });
  const gizmoLastDragAtRef = useRef(0);

  const [loading, setLoading]   = useState(false);
  const [camQ, setCamQ]         = useState<THREE.Quaternion | null>(null);
  const [isGizmoDragging, setIsGizmoDragging] = useState(false);
  // const [bodyMode, setBodyMode] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  // const [isAnalyzing, setIsAnalyzing] = useState(false);
  // Bump this counter to trigger applyAppearance after worker completes
  // const [bodyResultKey, setBodyResultKey] = useState(0);

  // Ref to the in-flight inline worker so we can terminate it on unmount / re-run
  // const bodiesWorkerRef = useRef<Worker | null>(null);

  // ── Per-layer visibility / transparency state ─────────────────────────────
  // Initialise once from config.layers.
  const [planeVisibility, setPlaneVisibility] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {};
    config.layers.forEach(l => { m[l.id] = l.enabled; });
    return m;
  });
  const [planeTransparency, setPlaneTransparency] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    config.layers.forEach(l => { m[l.id] = 1.0; });
    return m;
  });
  const [planeTransparencyEnabled, setPlaneTransparencyEnabled] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {};
    config.layers.forEach(l => { m[l.id] = false; });
    return m;
  });

  useEffect(() => { isVisibleRef.current = isVisible; }, [isVisible]);

  // Sync visibility state with config:
  //  • New layer IDs → default to layer.enabled
  //  • Existing IDs that become disabled in config → force hidden
  //  • Existing IDs that are (re-)enabled in config → show them
  //  • Manual user toggle is only reset when the layer's enabled state changes
  useEffect(() => {
    setPlaneVisibility(prev => {
      const next = { ...prev };
      config.layers.forEach(layer => {
        if (!(layer.id in prev)) {
          // Brand-new layer — default to its enabled state
          next[layer.id] = layer.enabled;
        } else {
          // Layer exists — track enabled state from config directly
          // If the plane is enabled in config → show it (respect what the planes tab says)
          // If the plane is disabled in config → hide it always
          if (layer.enabled && !prev[layer.id]) {
            // Was hidden, now config says enabled → turn it on
            next[layer.id] = true;
          } else if (!layer.enabled) {
            // Config says disabled → force off
            next[layer.id] = false;
          }
          // else: was visible and still enabled → leave user toggle alone
        }
      });
      return next;
    });
    setPlaneTransparencyEnabled(prev => {
      const next = { ...prev };
      config.layers.forEach(l => { if (!(l.id in prev)) next[l.id] = false; });
      return next;
    });
    setPlaneTransparency(prev => {
      const next = { ...prev };
      config.layers.forEach(l => { if (!(l.id in prev)) next[l.id] = 1.0; });
      return next;
    });
  }, [config.layers]);

  const togglePlaneVisibility = (layerId: string) => {
    setPlaneVisibility(prev => ({ ...prev, [layerId]: !prev[layerId] }));
  };

  const togglePlaneTransparency = (layerId: string) => {
    setPlaneTransparencyEnabled(prev => {
      const on = !prev[layerId];
      setPlaneTransparency(t => ({ ...t, [layerId]: on ? 0.12 : 1.0 }));
      return { ...prev, [layerId]: on };
    });
  };

  const viewportLayers = config.layers.filter(l => l.enabled);

  const handleGizmoPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!controlsRef.current) return;

    const targetEl = e.target as Element | null;
    if (targetEl?.closest('[data-gizmo-interactive="true"]')) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    gizmoDragRef.current = {
      active: true,
      moved: false,
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
    };
    setIsGizmoDragging(true);
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  }, []);

  const handleGizmoPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = gizmoDragRef.current;
    const controls = controlsRef.current;
    if (!drag.active || drag.pointerId !== e.pointerId || !controls) return;

    e.preventDefault();
    e.stopPropagation();

    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) drag.moved = true;

    const camera = cameraRef.current;
    if (!camera) return;

    const offset = camera.position.clone().sub(controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    const rotateScale = 0.0085;
    spherical.theta -= dx * rotateScale;
    spherical.phi -= dy * rotateScale;
    spherical.phi = THREE.MathUtils.clamp(spherical.phi, 0.05, Math.PI - 0.05);

    offset.setFromSpherical(spherical);
    camera.position.copy(controls.target).add(offset);
    camera.lookAt(controls.target);
    controls.update();
    if (cameraRef.current) setCamQ(cameraRef.current.quaternion.clone());
  }, []);

  const handleGizmoPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = gizmoDragRef.current;
    if (!drag.active || drag.pointerId !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    if (drag.moved) gizmoLastDragAtRef.current = performance.now();
    gizmoDragRef.current = { active: false, moved: false, pointerId: null, x: 0, y: 0 };
    setIsGizmoDragging(false);
    (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
  }, []);

  const snapToDirection = useCallback((direction: THREE.Vector3, up?: THREE.Vector3) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    if (snapAnimRef.current) {
      cancelAnimationFrame(snapAnimRef.current);
      snapAnimRef.current = null;
    }

    const startPos = camera.position.clone();
    const target = controls.target.clone();
    const radius = startPos.distanceTo(target);
    const endPos = target.clone().add(direction.clone().normalize().multiplyScalar(radius));
    const startUp = camera.up.clone();
    const endUp = (up ? up.clone() : camera.up.clone()).normalize();

    const start = performance.now();
    const duration = 260;
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const e = easeOut(t);

      camera.position.lerpVectors(startPos, endPos, e);
      camera.up.copy(startUp).lerp(endUp, e).normalize();
      camera.lookAt(target);
      controls.update();
      setCamQ(camera.quaternion.clone());

      if (t < 1) {
        snapAnimRef.current = requestAnimationFrame(tick);
      } else {
        snapAnimRef.current = null;
      }
    };

    snapAnimRef.current = requestAnimationFrame(tick);
  }, []);

  const handleSnapDirection = useCallback((direction: THREE.Vector3) => {
    if (performance.now() - gizmoLastDragAtRef.current < 140) return;
    const dir = direction.clone().normalize();
    const yDot = Math.abs(dir.dot(new THREE.Vector3(0, 1, 0)));
    const up = yDot > 0.95
      ? new THREE.Vector3(0, 0, dir.y >= 0 ? -1 : 1)
      : new THREE.Vector3(0, 1, 0);
    snapToDirection(dir, up);
  }, [snapToDirection]);

  const handleRotateStep = useCallback((dir: 'left' | 'right' | 'up' | 'down') => {
    if (performance.now() - gizmoLastDragAtRef.current < 140) return;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    if (snapAnimRef.current) {
      cancelAnimationFrame(snapAnimRef.current);
      snapAnimRef.current = null;
    }

    const startPos = camera.position.clone();
    const target = controls.target.clone();
    const startUp = camera.up.clone();
    const offset = startPos.clone().sub(target);
    const startSph = new THREE.Spherical().setFromVector3(offset);
    const endSph = startSph.clone();
    const step = THREE.MathUtils.degToRad(15);

    if (dir === 'left') endSph.theta += step;
    if (dir === 'right') endSph.theta -= step;
    if (dir === 'up') endSph.phi -= step;
    if (dir === 'down') endSph.phi += step;
    endSph.phi = THREE.MathUtils.clamp(endSph.phi, 0.05, Math.PI - 0.05);

    const endPos = target.clone().add(new THREE.Vector3().setFromSpherical(endSph));

    const start = performance.now();
    const duration = 180;
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const e = easeOut(t);
      camera.position.lerpVectors(startPos, endPos, e);
      camera.up.copy(startUp);
      camera.lookAt(target);
      controls.update();
      setCamQ(camera.quaternion.clone());

      if (t < 1) {
        snapAnimRef.current = requestAnimationFrame(tick);
      } else {
        snapAnimRef.current = null;
      }
    };

    snapAnimRef.current = requestAnimationFrame(tick);
  }, []);

  const disposeMiniObject = useCallback((obj: THREE.Object3D) => {
    obj.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      child.geometry?.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach(m => m.dispose());
      } else {
        child.material?.dispose();
      }
    });
  }, []);

  const syncMiniModel = useCallback(() => {
    const miniGroup = miniModelGroupRef.current;
    const source = meshGroupRef.current;
    if (!miniGroup) return;

    while (miniGroup.children.length) {
      const child = miniGroup.children[0];
      miniGroup.remove(child);
      disposeMiniObject(child);
    }
    if (!source) return;

    const clone = source.clone(true);
    clone.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      child.geometry = child.geometry.clone();
      const fixedMiniMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
      if (Array.isArray(child.material)) {
        child.material.forEach(m => m.dispose());
      } else {
        child.material.dispose();
      }
      child.material = fixedMiniMat;
      child.castShadow = false;
      child.receiveShadow = false;
    });

    clone.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(clone);
    if (!box.isEmpty()) {
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const safeRadius = Math.max(sphere.radius, 1e-6);
      const targetRadius = 29.296875;
      const scale = targetRadius / safeRadius;

      clone.position.copy(sphere.center).multiplyScalar(-1);
      clone.scale.setScalar(scale);
    }

    miniGroup.add(clone);
  }, [disposeMiniObject]);

  useEffect(() => {
    const host = miniHostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    miniSceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 600);
    camera.position.set(0, 0, 134);
    miniCameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(115, 115, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    miniRendererRef.current = renderer;
    Object.assign(renderer.domElement.style, {
      width: '100%',
      height: '100%',
      display: 'block',
      position: 'absolute',
      inset: '0',
    });
    host.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 1));

    const miniGroup = new THREE.Group();
    miniGroup.position.set(0, 0, 0);
    miniSceneRef.current.add(miniGroup);
    miniModelGroupRef.current = miniGroup;

    syncMiniModel();

    const animate = () => {
      renderer.render(scene, camera);
      miniAnimRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      if (miniAnimRef.current) {
        cancelAnimationFrame(miniAnimRef.current);
        miniAnimRef.current = null;
      }

      if (miniModelGroupRef.current) {
        while (miniModelGroupRef.current.children.length) {
          const child = miniModelGroupRef.current.children[0];
          miniModelGroupRef.current.remove(child);
          disposeMiniObject(child);
        }
      }

      renderer.dispose();
      if (renderer.domElement.parentNode === host) {
        host.removeChild(renderer.domElement);
      }

      miniRendererRef.current = null;
      miniSceneRef.current = null;
      miniCameraRef.current = null;
      miniModelGroupRef.current = null;
    };
  }, [disposeMiniObject, syncMiniModel]);

  useEffect(() => {
    if (!camQ || !miniModelGroupRef.current) return;
    miniModelGroupRef.current.quaternion.copy(camQ).invert();
  }, [camQ]);

  // ── Apply appearance whenever visibility/transparency changes ────
  const applyAppearance = useCallback(() => {
    if (!meshGroupRef.current) return;
    meshGroupRef.current.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      const lid: string = child.userData.layerId;
      if (!lid) return;

      child.visible = planeVisibility[lid] ?? true;

      // Guard: only dispose if material is valid and not already disposed
      const old = child.material as THREE.MeshStandardMaterial;
      if (old && !old.disposed) old.dispose();

      if (child.userData.slotDebug) {
        child.material = new THREE.MeshBasicMaterial({
          color: 0x10e8a8,
          wireframe: true,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
        });
        child.renderOrder = 999;
        return;
      }

      // Standard appearance (ID Bodies disabled)
      const ghost = planeTransparencyEnabled[lid] ?? false;
      const baseColor = new THREE.Color(color || '#38bdf8');
      const accentEmissive = baseColor.clone().multiplyScalar(0.35);
      const mat = new THREE.MeshStandardMaterial({
        vertexColors:     false,
        color:            baseColor,
        emissive:         accentEmissive,
        emissiveIntensity: 0.015,
        metalness:        0.14,
        roughness:        0.44,
        envMapIntensity:  0.36,
        transparent:      ghost,
        opacity:          ghost ? (planeTransparency[lid] ?? 0.12) : 1.0,
        side:             THREE.DoubleSide,
      });
      child.material = mat;
    });
    syncMiniModel();
  }, [planeVisibility, planeTransparency, planeTransparencyEnabled, color, syncMiniModel]);

  useEffect(() => { applyAppearance(); },
    [planeVisibility, planeTransparency, planeTransparencyEnabled, applyAppearance]);

  // Stable ref to the launch function so it can be called from both
  // the bodyMode toggle effect and the mesh load effect without stale closures.
  // const launchBodiesWorkerRef = useRef<(() => void) | null>(null);

  /*
  const runBodiesWorker = useCallback(() => {
    if (!meshGroupRef.current) return;

    // Terminate any previous run
    if (bodiesWorkerRef.current) {
      bodiesWorkerRef.current.terminate();
      bodiesWorkerRef.current = null;
    }

    const meshes: THREE.Mesh[] = [];
    meshGroupRef.current.traverse(child => {
      if (child instanceof THREE.Mesh && child.userData.layerId) meshes.push(child);
    });
    if (meshes.length === 0) return;

    meshes.forEach(mesh => {
      const geo = mesh.geometry;
      const posAttr = geo.attributes.position;
      const idxAttr = geo.index;
      if (!posAttr) return;

      const positions = new Float32Array(posAttr.array);
      const indices = idxAttr
        ? (idxAttr.array instanceof Uint16Array
            ? new Uint32Array(idxAttr.array)
            : new Uint32Array(idxAttr.array))
        : null;

      const workerCode = BODIES_WORKER_CODE;
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const url  = URL.createObjectURL(blob);
      const worker = new Worker(url);
      bodiesWorkerRef.current = worker;
      setIsAnalyzing(true);
      console.log(`[ID Bodies] Worker started. Mesh: ${mesh.name}, verts: ${positions.length/3}, indices: ${indices ? indices.length/3 : 'none'} tris`);

      worker.onmessage = (ev) => {
        URL.revokeObjectURL(url);
        setIsAnalyzing(false);
        bodiesWorkerRef.current = null;
        if (!ev.data.success) {
          console.warn('[ID Bodies] Worker error:', ev.data.error);
          return;
        }
        const { bodyPerVertex: bpv, bodyCount: bc, colorArr } = ev.data;
        console.log(`[ID Bodies] Result: bodyCount=${bc}, colorArr length=${colorArr?.length}`);
        mesh.userData.bodyPerVertex = bpv;
        mesh.userData.bodyCount     = bc;
        mesh.userData.bfsAnalysed   = true;
        if (bc > 1) {
          mesh.geometry.setAttribute('color', new THREE.BufferAttribute(colorArr, 3));
          mesh.geometry.attributes.color.needsUpdate = true;
          console.log(`[ID Bodies] Set vertex colors on geometry. bc=${bc}`);
        } else {
          console.log(`[ID Bodies] Only 1 body found — no color change needed`);
        }
        setBodyResultKey(k => k + 1);
      };

      worker.onerror = (err) => {
        URL.revokeObjectURL(url);
        setIsAnalyzing(false);
        bodiesWorkerRef.current = null;
        console.warn('Bodies worker failed:', err);
        mesh.userData.bodyCount   = 1;
        mesh.userData.bfsAnalysed = true;
        setBodyResultKey(k => k + 1);
      };

      const transferList: Transferable[] = [positions.buffer];
      if (indices) transferList.push(indices.buffer);
      worker.postMessage({ positions, indices, designColor: color || '#38bdf8' }, transferList);
    });
  }, [color]);
  */

  // Keep the ref up to date so the mesh load effect can call the latest version
  // launchBodiesWorkerRef.current = runBodiesWorker;

  // Fire when bodyMode turns on
  /*
  useEffect(() => {
    if (bodyMode) runBodiesWorker();
    else {
      // Cancel any running analysis when turning off
      if (bodiesWorkerRef.current) {
        bodiesWorkerRef.current.terminate();
        bodiesWorkerRef.current = null;
        // setIsAnalyzing(false);
      }
    }
  }, []);//[bodyMode, runBodiesWorker]);
  */

  // Terminate worker on unmount
  /*
  useEffect(() => {
    return () => { bodiesWorkerRef.current?.terminate(); };
  }, []);
  */

  // ── Three.js scene (runs once) ───────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const w = containerRef.current.clientWidth;
    const h = containerRef.current.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020617);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 2000);
    camera.position.set(0, 0, 500);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(w, h);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.78;
    renderer.setClearColor(0x020617, 1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;
    Object.assign(renderer.domElement.style, {
      width: '100%', height: '100%', display: 'block',
      position: 'absolute', top: '0', left: '0',
    });
    containerRef.current.appendChild(renderer.domElement);

    // ── Three-point studio lighting ──────────────────────────────────────────
    // Designed for a flat snowflake ornament viewed mostly face-on.
    // Key: strong warm-white from upper-left-front (main definition)
    // Fill: soft cool from lower-right-front (lifts shadows, adds depth)
    // Back/rim: narrow cold blue from behind (separates from background)
    // Slightly higher ambient light keeps faces closer to 2D color while preserving depth.
    scene.add(new THREE.AmbientLight(0xffffff, 0.16));

    const key = new THREE.DirectionalLight(0xf9fbff, 1.05);
    key.position.set(-120, 200, 400);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 2000;
    key.shadow.bias = -0.0005;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xecf4ff, 0.34);
    fill.position.set(300, -80, 350);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0x9fc2ff, 0.24);
    rim.position.set(60, 70, -460);
    scene.add(rim);

    scene.environment = null;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    const onControlStart = () => {
      renderer.shadowMap.autoUpdate = false;
    };
    const onControlEnd = () => {
      renderer.shadowMap.autoUpdate = true;
      renderer.shadowMap.needsUpdate = true;
    };
    controls.addEventListener('start', onControlStart);
    controls.addEventListener('end', onControlEnd);

    controlsRef.current = controls;

    const animate = () => {
      requestAnimationFrame(animate);
      if (!isVisibleRef.current) return;
      controls.update();
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
      // Update gizmo every 2 frames to avoid React overhead
      if (frameRef.current++ % 2 === 0 && cameraRef.current) {
        setCamQ(cameraRef.current.quaternion.clone());
      }
    };
    animate();

    const onResize = () => {
      if (!containerRef.current) return;
      const nw = containerRef.current.clientWidth;
      const nh = containerRef.current.clientHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      controls.removeEventListener('start', onControlStart);
      controls.removeEventListener('end', onControlEnd);
      renderer.dispose();
      containerRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  // ── Mesh loading (re-runs when config or generateMesh changes) ────────────
  const LAYER_BASE_COLORS = ['#38bdf8', '#a78bfa', '#34d399'];
  
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const group = await generateMesh(() => {}, undefined, config);
        if (cancelled || !sceneRef.current) return;

        if (meshGroupRef.current) {
          sceneRef.current.remove(meshGroupRef.current);
          
          // Dispose all geometries and materials to prevent memory leaks
          meshGroupRef.current.traverse(child => {
            if (child instanceof THREE.Mesh) {
              child.geometry?.dispose();
              if (child.material instanceof THREE.Material) {
                child.material.dispose();
              } else if (Array.isArray(child.material)) {
                child.material.forEach(mat => mat.dispose());
              }
            }
          });
        }

        const baseColor = new THREE.Color(color || '#38bdf8');
        const accentEmissive = baseColor.clone().multiplyScalar(0.35);
        const baseMat = new THREE.MeshStandardMaterial({
          color: baseColor,
          metalness: 0.14,
          roughness: 0.44,
          emissive: accentEmissive,
          emissiveIntensity: 0.015,
          envMapIntensity: 0.3,
          side: THREE.DoubleSide,
          transparent: true, opacity: 1.0,
        });

        const enabledLayers = config.layers.filter(l => l.enabled);

        group.traverse(child => {
          if (!(child instanceof THREE.Mesh)) return;
          child.material = baseMat.clone();
          child.castShadow = true;
          child.receiveShadow = true;
          child.frustumCulled = false;
          child.geometry.computeVertexNormals();

          const lid: string = child.userData.layerId;

          // Reset BFS state — worker will re-run if bodyMode is on
          if (lid) {
            child.userData.bodyCount     = undefined;
            child.userData.bodyPerVertex = undefined;
            child.userData.bfsAnalysed   = false;
          }
        });

        // Centre on Z only — the snowflake geometry is already designed around
        // XY origin (arms radiate from 0,0), so subtracting the full 3D centroid
        // would shift the piece off-centre when arms are asymmetric.
        // We only need to zero out the Z offset introduced by centerZOffset.
        const box = new THREE.Box3().setFromObject(group);
        const ctr = new THREE.Vector3();
        box.getCenter(ctr);
        group.position.set(0, 0, -ctr.z); // XY stays at 0, only Z is centred

        if (SLOT_DEBUG_OVERLAY_ENABLED && config.slotEnabled) {
          const enabledLayers = config.layers.filter(l => l.enabled);
          const materialThickness = config.extrusionDepth + (config.bevelEnabled ? Math.min(config.bevelAmount, config.extrusionDepth / 2) * 2 : 0);

          enabledLayers.forEach((layer, layerIndex) => {
            let layerMesh: THREE.Mesh | null = null;
            group.traverse(child => {
              if (layerMesh || !(child instanceof THREE.Mesh)) return;
              if (child.userData.layerId === layer.id && !child.userData.slotDebug) {
                layerMesh = child;
              }
            });

            if (!layerMesh) return;

            const layerBounds = new THREE.Box3().setFromObject(layerMesh);
            if (layerBounds.isEmpty()) return;

            const layerCenterZ = (layerBounds.min.z + layerBounds.max.z) * 0.5;
            const debugCutters = createSlotDebugCuttersForLayer(
              layer,
              layerIndex,
              enabledLayers,
              config,
              materialThickness,
              layerCenterZ
            );

            debugCutters.forEach((geo, cutterIndex) => {
              const debugMesh = new THREE.Mesh(
                geo,
                new THREE.MeshBasicMaterial({
                  color: 0x10e8a8,
                  wireframe: true,
                  transparent: true,
                  opacity: 0.9,
                  depthWrite: false,
                })
              );
              debugMesh.userData.layerId = layer.id;
              debugMesh.userData.slotDebug = true;
              debugMesh.userData.slotDebugIndex = cutterIndex;
              debugMesh.name = `${layer.name} Slot Debug ${cutterIndex + 1}`;
              debugMesh.renderOrder = 999;
              group.add(debugMesh);
            });
          });
        }

        sceneRef.current.add(group);
        meshGroupRef.current = group;
        // Apply current appearance state after a short defer
        setTimeout(() => {
          applyAppearance();
          // If body mode is already on, re-run analysis against the new mesh
          // if (bodyMode) launchBodiesWorkerRef.current?.();
        }, 50);
      } catch (err) {
        console.error('Snowflake3D: mesh gen failed', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const t = setTimeout(load, 100);
    return () => { cancelled = true; clearTimeout(t); };
  }, [config, generateMesh, refreshKey]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full bg-slate-950 rounded-xl overflow-hidden" />

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 rounded-xl pointer-events-none z-50">
          <div className="text-white text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-400 mx-auto mb-2" />
            <div className="text-sm text-slate-300">Generating…</div>
          </div>
        </div>
      )}

      {/* ── TOP-LEFT: diameter + plane controls ─────────────────────────── */}
      <div className="absolute top-4 left-4 z-40 flex flex-col gap-2">
        {/* Diameter */}
        <div className="bg-slate-900/85 backdrop-blur px-3 py-2 rounded-lg border border-white/10 shadow-xl">
          <span className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500 block leading-none mb-0.5">Diameter</span>
          <span className="text-lg font-bold text-white leading-none">
            {(initialDiameter ?? 0).toFixed(1)}
            <span className="text-xs text-sky-400 ml-1">mm</span>
          </span>
        </div>

        {viewportLayers.length > 0 && (
          <div className="bg-slate-900/85 backdrop-blur px-3 py-2.5 rounded-lg border border-white/10 shadow-xl min-w-[220px]">
            <div className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500 mb-2">Planes</div>
            <div className="space-y-1.5">
              {viewportLayers.map((layer) => {
                const isShown = planeVisibility[layer.id] ?? true;
                const isGhost = planeTransparencyEnabled[layer.id] ?? false;
                return (
                  <div key={layer.id} className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-slate-200 truncate">{layer.name}</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => togglePlaneVisibility(layer.id)}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                          isShown
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30 hover:bg-emerald-500/30'
                            : 'bg-slate-700/60 text-slate-300 border-slate-500/40 hover:bg-slate-600/70'
                        }`}
                        title={isShown ? 'Hide plane' : 'Show plane'}
                      >
                        {isShown ? 'ON' : 'OFF'}
                      </button>
                      <button
                        onClick={() => togglePlaneTransparency(layer.id)}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                          isGhost
                            ? 'bg-sky-500/20 text-sky-300 border-sky-400/30 hover:bg-sky-500/30'
                            : 'bg-slate-700/60 text-slate-300 border-slate-500/40 hover:bg-slate-600/70'
                        }`}
                        title={isGhost ? 'Disable ghost mode' : 'Enable ghost mode'}
                      >
                        Ghost
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── BOTTOM-LEFT: undo / redo ──────────────────────────────────────── */}
      {(canUndo || canRedo) && (
        <div className="absolute bottom-4 left-4 z-40 flex gap-2">
          <button onClick={undo} disabled={!canUndo}
            className="p-2 bg-slate-800/80 backdrop-blur rounded-lg text-white disabled:opacity-30 hover:bg-sky-500 transition-all shadow-lg border border-white/5">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          </button>
          <button onClick={redo} disabled={!canRedo}
            className="p-2 bg-slate-800/80 backdrop-blur rounded-lg text-white disabled:opacity-30 hover:bg-sky-500 transition-all shadow-lg border border-white/5">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
            </svg>
          </button>
        </div>
      )}

      {/* ── BOTTOM-RIGHT: gizmo + home + ID Bodies ────────────────────────
           All placed bottom-right, well clear of the 2D/3D toggle
           which lives top-right of the parent container. */}
      <div className="absolute bottom-4 right-4 z-40 flex flex-col items-end gap-2">

        {/* Dynamic orientation gizmo */}
        <div
          className={`relative w-[115px] h-[115px] p-0 select-none flex items-center justify-center ${isGizmoDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          style={{ touchAction: 'none' }}
          onPointerDownCapture={handleGizmoPointerDown}
          onPointerMoveCapture={handleGizmoPointerMove}
          onPointerUpCapture={handleGizmoPointerUp}
          onPointerCancelCapture={handleGizmoPointerUp}
        >
          <div
            ref={miniHostRef}
            className="absolute inset-0 pointer-events-none rounded-full overflow-hidden"
          />
          <XYZGizmo
            camQ={camQ}
            onSnapDirection={handleSnapDirection}
            onRotateStep={handleRotateStep}
          />
        </div>

        {/* Reset camera home + force refresh — side by side */}
        <div className="flex gap-2">
          <button
            onClick={() => controlsRef.current?.reset()}
            title="Reset camera"
            className="p-2.5 bg-slate-900/85 backdrop-blur hover:bg-sky-500 text-slate-300 hover:text-white rounded-xl border border-white/10 shadow-xl transition-all active:scale-90"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </button>

          <button
            onClick={() => setRefreshKey(k => k + 1)}
            title="Force refresh 3D model"
            className="p-2.5 bg-slate-900/85 backdrop-blur hover:bg-emerald-500 text-slate-300 hover:text-white rounded-xl border border-white/10 shadow-xl transition-all active:scale-90"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        {/* ID Bodies button DISABLED - needs complete rewrite
        <button
          onClick={() => setBodyMode(b => !b)}
          title={bodyMode
            ? 'Exit body mode (show normal snowflake)'
            : 'Identify disconnected mesh bodies (useful for 3D printing diagnostics)'}
          className={`px-3 py-2 rounded-lg font-black text-[10px] uppercase transition-all flex items-center gap-2 min-w-[120px] justify-center ${
            bodyMode
              ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/25'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-white/10'
          }`}
        >
          {isAnalyzing ? (
            <>
              <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
              <span>Analyzing…</span>
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="1" width="6" height="6" rx="1" fill={bodyMode ? '#ef4444' : '#64748b'} opacity="0.95" />
                <rect x="9" y="1" width="6" height="6" rx="1" fill={bodyMode ? '#22c55e' : '#64748b'} opacity="0.95" />
                <rect x="1" y="9" width="6" height="6" rx="1" fill={bodyMode ? '#60a5fa' : '#64748b'} opacity="0.95" />
                <rect x="9" y="9" width="6" height="6" rx="1" fill={bodyMode ? '#fbbf24' : '#64748b'} opacity="0.95" />
              </svg>
              {bodyMode ? 'Bodies ON' : 'ID Bodies'}
            </>
          )}
        </button>
        */}
      </div>
    </div>
  );
};

export default Snowflake3D;
