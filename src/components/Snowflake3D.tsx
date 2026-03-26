import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
// @ts-ignore
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
// @ts-ignore
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
// @ts-ignore
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
// @ts-ignore
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
// @ts-ignore
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils';
import { SnowflakeConfig, ShortcutConfig, DesignQuality } from '../types';

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
const XYZGizmo: React.FC<{ camQ: THREE.Quaternion | null }> = ({ camQ }) => {
  if (!camQ) return (
    <svg width="60" height="60">
      <circle cx="30" cy="30" r="28" fill="rgba(15,23,42,0.6)" />
      <line x1="30" y1="30" x2="50" y2="30" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" />
      <text x="53" y="34" fill="#ef4444" fontSize="9" fontWeight="bold">X</text>
      <line x1="30" y1="30" x2="30" y2="10" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" />
      <text x="26" y="7"  fill="#22c55e" fontSize="9" fontWeight="bold">Y</text>
      <line x1="30" y1="30" x2="44" y2="16" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" />
      <text x="45" y="13" fill="#3b82f6" fontSize="9" fontWeight="bold">Z</text>
      <circle cx="30" cy="30" r="2.5" fill="white" opacity="0.9" />
    </svg>
  );

  const R  = 20;
  const cx = 30, cy = 30;
  const axes = [
    { label: 'X', dir: new THREE.Vector3(1, 0, 0), col: '#ef4444' },
    { label: 'Y', dir: new THREE.Vector3(0, 1, 0), col: '#22c55e' },
    { label: 'Z', dir: new THREE.Vector3(0, 0, 1), col: '#3b82f6' },
  ].map(({ label, dir, col }) => {
    const v = dir.clone().applyQuaternion(camQ);
    return { label, col, x: cx + v.x * R, y: cy - v.y * R, depth: v.z };
  }).sort((a, b) => a.depth - b.depth); // draw back → front

  return (
    <svg width="60" height="60" className="select-none">
      <circle cx="30" cy="30" r="28" fill="rgba(15,23,42,0.6)" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      {axes.map(({ label, x, y, col, depth }) => {
        const op = 0.35 + 0.65 * ((depth + 1) / 2);
        return (
          <g key={label} opacity={op}>
            <line x1="30" y1="30" x2={x} y2={y} stroke={col} strokeWidth="2.5" strokeLinecap="round" />
            <text
              x={x + (x - 30) * 0.5} y={y + (y - 30) * 0.5 + 3.5}
              fill={col} fontSize="9" fontWeight="900" textAnchor="middle"
              style={{ fontFamily: 'ui-monospace, monospace' }}
            >{label}</text>
          </g>
        );
      })}
      <circle cx="30" cy="30" r="2.5" fill="white" opacity="0.9" />
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
  const composerRef   = useRef<EffectComposer | null>(null);
  const sceneRef      = useRef<THREE.Scene | null>(null);
  const cameraRef     = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef   = useRef<OrbitControls | null>(null);
  const meshGroupRef  = useRef<THREE.Group | null>(null);
  const isVisibleRef  = useRef(isVisible);
  const frameRef      = useRef(0);

  const [loading, setLoading]   = useState(false);
  const [camQ, setCamQ]         = useState<THREE.Quaternion | null>(null);
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

      // Standard appearance (ID Bodies disabled)
      const ghost = planeTransparencyEnabled[lid] ?? false;
      const mat = new THREE.MeshStandardMaterial({
        vertexColors:     false,
        color:            new THREE.Color(color || '#38bdf8'),
        emissive:         new THREE.Color(color || '#38bdf8'),
        emissiveIntensity: 0.02,  // reduced to minimize flare artifacts
        metalness:        0.45,
        roughness:        0.25,
        envMapIntensity:  1.2,
        transparent:      ghost,
        opacity:          ghost ? (planeTransparency[lid] ?? 0.12) : 1.0,
        side:             THREE.DoubleSide,
      });
      child.material = mat;
    });
  }, [planeVisibility, planeTransparency, planeTransparencyEnabled, color]);

  useEffect(() => { applyAppearance(); },
    [planeVisibility, planeTransparency, planeTransparencyEnabled, applyAppearance]);

  // Stable ref to the launch function so it can be called from both
  // the bodyMode toggle effect and the mesh load effect without stale closures.
  // const launchBodiesWorkerRef = useRef<(() => void) | null>(null);

  // ── ID Bodies worker DISABLED ────────────────────────────────────
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
    renderer.toneMappingExposure = 1.2;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;
    Object.assign(renderer.domElement.style, {
      width: '100%', height: '100%', display: 'block',
      position: 'absolute', top: '0', left: '0',
    });
    containerRef.current.appendChild(renderer.domElement);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    // Very subtle bloom — only the absolute brightest specular highlights glow.
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.12, 0.8, 1.2));
    composerRef.current = composer;

    // ── Three-point studio lighting ──────────────────────────────────────────
    // Designed for a flat snowflake ornament viewed mostly face-on.
    // Key: strong warm-white from upper-left-front (main definition)
    // Fill: soft cool from lower-right-front (lifts shadows, adds depth)
    // Back/rim: narrow cold blue from behind (separates from background)
    // Ambient: very low so shadows read clearly
    scene.add(new THREE.AmbientLight(0xffffff, 0.15));

    const key = new THREE.DirectionalLight(0xfff8f0, 2.8);  // warm white
    key.position.set(-120, 200, 400);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 2000;
    key.shadow.bias = -0.0005;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xe8f4ff, 0.9);  // cool blue-white
    fill.position.set(300, -80, 350);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0x88bbff, 1.4);   // cold blue rim
    rim.position.set(60, 40, -500);
    scene.add(rim);

    // Env map
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envS = new THREE.Scene();
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
    panel.position.z = 500; envS.add(panel);
    scene.environment = pmrem.fromScene(envS).texture;
    pmrem.dispose();

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controlsRef.current = controls;

    const animate = () => {
      requestAnimationFrame(animate);
      if (!isVisibleRef.current) return;
      controls.update();
      // Use the EffectComposer so the UnrealBloomPass is actually applied.
      // Fall back to the raw renderer only if the composer isn't ready.
      if (composerRef.current) {
        composerRef.current.render();
      } else if (rendererRef.current && sceneRef.current && cameraRef.current) {
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
      composer.setSize(nw, nh);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
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

        const baseMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(color || '#38bdf8'),
          metalness: 0.45,   // enough metalness to catch the rim light crisply
          roughness: 0.25,   // low roughness = tight, clean specular highlights
          emissive: new THREE.Color(color || '#38bdf8'),
          emissiveIntensity: 0.02,  // reduced to minimize flare artifacts
          envMapIntensity: 1.2,
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

        sceneRef.current.add(group);
        meshGroupRef.current = group;
        // Apply current appearance state after a short defer
        setTimeout(() => {
          applyAppearance();
          // If body mode is already on, re-run analysis against the new mesh
          if (bodyMode) launchBodiesWorkerRef.current?.();
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
  const enabledLayers = config.layers.filter(l => l.enabled);
  const dotColors     = ['#38bdf8', '#a78bfa', '#34d399'];

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

        {/* Plane visibility/transparency — commented out (single-plane mode)
        {enabledLayers.length > 0 && (
          <div className="bg-slate-900/85 backdrop-blur px-3 py-2.5 rounded-lg border border-white/10 shadow-xl">
            ...
          </div>
        )}
        */}
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
        <div className="bg-slate-900/80 backdrop-blur p-2 rounded-xl border border-white/10 shadow-xl">
          <XYZGizmo camQ={camQ} />
          <p className="text-center text-[8px] font-bold uppercase tracking-widest text-slate-500 mt-0.5">
            View
          </p>
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
