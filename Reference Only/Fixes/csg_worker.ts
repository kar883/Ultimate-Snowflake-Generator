/**
 * CSG Worker — Pure JS Convex Subtraction
 *
 * This worker uses a pure-JS BSP algorithm for Boolean subtraction.
 * No WASM dependencies = no loading issues in workers.
 *
 * Output: Clean slot cuts with open boundaries.
 * For closed meshes: use holeFillingRepair.ts on the main thread for manifold output.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

interface Vec3 { x: number; y: number; z: number }
interface Triangle { a: Vec3; b: Vec3; c: Vec3 }
interface Plane { nx: number; ny: number; nz: number; d: number }

interface WorkerInput {
  base: { positions: number[]; indices: number[] | null };
  slots: Array<{ positions: number[]; indices: number[] | null; rotation: [number,number,number] }>;
}
interface WorkerOutput {
  success: boolean;
  geometry?: { positions: number[]; indices: number[]; normals: number[] | null };
  stats?: { vertices: number; faces: number; isWatertight: boolean };
  error?: string; stack?: string;
}

// ─── Vector math ─────────────────────────────────────────────────────────────

const v3 = {
  sub:   (a: Vec3, b: Vec3): Vec3 => ({ x: a.x-b.x, y: a.y-b.y, z: a.z-b.z }),
  scale: (a: Vec3, s: number): Vec3 => ({ x: a.x*s, y: a.y*s, z: a.z*s }),
  cross: (a: Vec3, b: Vec3): Vec3 => ({
    x: a.y*b.z - a.z*b.y, y: a.z*b.x - a.x*b.z, z: a.x*b.y - a.y*b.x,
  }),
  dot:  (a: Vec3, b: Vec3): number => a.x*b.x + a.y*b.y + a.z*b.z,
  len:  (a: Vec3): number => Math.sqrt(a.x*a.x + a.y*a.y + a.z*a.z),
  norm: (a: Vec3): Vec3 => { const l = v3.len(a)||1; return v3.scale(a, 1/l); },
  lerp: (a: Vec3, b: Vec3, t: number): Vec3 => ({
    x: a.x+t*(b.x-a.x), y: a.y+t*(b.y-a.y), z: a.z+t*(b.z-a.z),
  }),
};

// ─── Geometry helpers ─────────────────────────────────────────────────────────

function extractTriangles(pos: Float32Array, idx: Uint32Array): Triangle[] {
  const tris: Triangle[] = [];
  for (let i = 0; i < idx.length; i += 3) {
    const ai=idx[i]*3, bi=idx[i+1]*3, ci=idx[i+2]*3;
    tris.push({
      a:{x:pos[ai],   y:pos[ai+1], z:pos[ai+2]},
      b:{x:pos[bi],   y:pos[bi+1], z:pos[bi+2]},
      c:{x:pos[ci],   y:pos[ci+1], z:pos[ci+2]},
    });
  }
  return tris;
}

/**
 * Convert triangles to an indexed buffer with properly SHARED vertices.
 * Uses a spatial hash to deduplicate vertices within MERGE_EPS so that
 * adjacent triangles share indices — enabling correct boundary-edge detection.
 */
function trianglesToBuffers(tris: Triangle[]): { positions: Float32Array; indices: Uint32Array } {
  const MERGE_EPS = 1e-4;
  const INV_EPS   = 1 / MERGE_EPS;

  const vertMap = new Map<string, number>();
  const posOut: number[] = [];
  const idxOut: number[] = [];

  const addVert = (v: Vec3): number => {
    const gx = Math.round(v.x * INV_EPS);
    const gy = Math.round(v.y * INV_EPS);
    const gz = Math.round(v.z * INV_EPS);
    const key = `${gx},${gy},${gz}`;
    let idx = vertMap.get(key);
    if (idx === undefined) {
      idx = posOut.length / 3;
      vertMap.set(key, idx);
      posOut.push(gx * MERGE_EPS, gy * MERGE_EPS, gz * MERGE_EPS);
    }
    return idx;
  };

  for (const { a, b, c } of tris) {
    const ia = addVert(a);
    const ib = addVert(b);
    const ic = addVert(c);
    if (ia === ib || ib === ic || ia === ic) continue; // skip degenerate
    idxOut.push(ia, ib, ic);
  }

  return {
    positions: new Float32Array(posOut),
    indices:   new Uint32Array(idxOut),
  };
}

function makeSequentialIndices(n: number): Uint32Array {
  const idx = new Uint32Array(n);
  for (let i=0; i<n; i++) idx[i]=i;
  return idx;
}

// ─── AABB ─────────────────────────────────────────────────────────────────────

type AABB = { minX:number; minY:number; minZ:number; maxX:number; maxY:number; maxZ:number };

function computeAABB(tris: Triangle[]): AABB {
  let minX=Infinity, minY=Infinity, minZ=Infinity;
  let maxX=-Infinity, maxY=-Infinity, maxZ=-Infinity;
  for (const t of tris) for (const v of [t.a,t.b,t.c]) {
    if(v.x<minX)minX=v.x; if(v.x>maxX)maxX=v.x;
    if(v.y<minY)minY=v.y; if(v.y>maxY)maxY=v.y;
    if(v.z<minZ)minZ=v.z; if(v.z>maxZ)maxZ=v.z;
  }
  return {minX,minY,minZ,maxX,maxY,maxZ};
}

function triAABB(t: Triangle): AABB {
  return {
    minX:Math.min(t.a.x,t.b.x,t.c.x), maxX:Math.max(t.a.x,t.b.x,t.c.x),
    minY:Math.min(t.a.y,t.b.y,t.c.y), maxY:Math.max(t.a.y,t.b.y,t.c.y),
    minZ:Math.min(t.a.z,t.b.z,t.c.z), maxZ:Math.max(t.a.z,t.b.z,t.c.z),
  };
}

function aabbsOverlap(a: AABB, b: AABB, pad=0.05): boolean {
  return a.minX-pad<=b.maxX && a.maxX+pad>=b.minX &&
         a.minY-pad<=b.maxY && a.maxY+pad>=b.minY &&
         a.minZ-pad<=b.maxZ && a.maxZ+pad>=b.minZ;
}

// ─── Extract unique outward face planes from a convex mesh ───────────────────

function extractConvexPlanes(tris: Triangle[]): Plane[] {
  const map = new Map<string, Plane>();
  const SNAP = 100;
  for (const t of tris) {
    const n = v3.norm(v3.cross(v3.sub(t.b,t.a), v3.sub(t.c,t.a)));
    if (!isFinite(n.x)||!isFinite(n.y)||!isFinite(n.z)) continue;
    const key = `${Math.round(n.x*SNAP)},${Math.round(n.y*SNAP)},${Math.round(n.z*SNAP)}`;
    const d = v3.dot(n, t.a);
    const ex = map.get(key);
    if (!ex || d > ex.d) map.set(key, {nx:n.x, ny:n.y, nz:n.z, d});
  }
  return Array.from(map.values());
}

function planeDist(p: Plane, v: Vec3): number {
  return p.nx*v.x + p.ny*v.y + p.nz*v.z - p.d;
}

// ─── Per-plane triangle split ─────────────────────────────────────────────────

const SPLIT_EPS = 1e-6;

function toTris(pts: Vec3[]): Triangle[] {
  if (pts.length < 3) return [];
  if (pts.length === 3) return [{a:pts[0], b:pts[1], c:pts[2]}];
  return [{a:pts[0],b:pts[1],c:pts[2]}, {a:pts[0],b:pts[2],c:pts[3]}];
}

function splitByPlane(
  tri: Triangle, plane: Plane
): { inside: Triangle[]; outside: Triangle[] } {
  const verts = [tri.a, tri.b, tri.c];
  const d = verts.map(v => planeDist(plane, v));

  if (d[0] >= -SPLIT_EPS && d[1] >= -SPLIT_EPS && d[2] >= -SPLIT_EPS)
    return { inside: [], outside: [tri] };
  if (d[0] <= SPLIT_EPS && d[1] <= SPLIT_EPS && d[2] <= SPLIT_EPS)
    return { inside: [tri], outside: [] };

  const inPts: Vec3[] = [], outPts: Vec3[] = [];
  for (let i = 0; i < 3; i++) {
    const j = (i+1) % 3;
    if (d[i] >= -SPLIT_EPS) outPts.push(verts[i]);
    if (d[i] <=  SPLIT_EPS)  inPts.push(verts[i]);
    if ((d[i] > SPLIT_EPS && d[j] < -SPLIT_EPS) ||
        (d[i] < -SPLIT_EPS && d[j] > SPLIT_EPS)) {
      const t = d[i] / (d[i] - d[j]);
      const pt = v3.lerp(verts[i], verts[j], t);
      inPts.push(pt); outPts.push(pt);
    }
  }
  return { inside: toTris(inPts), outside: toTris(outPts) };
}

// ─── Core subtraction ─────────────────────────────────────────────────────────

function subtractMesh(baseTris: Triangle[], subTris: Triangle[]): Triangle[] {
  if (!baseTris.length || !subTris.length) return baseTris;

  const subAABB  = computeAABB(subTris);
  const baseAABB = computeAABB(baseTris);
  if (!aabbsOverlap(baseAABB, subAABB)) return baseTris;

  const planes = extractConvexPlanes(subTris);
  if (planes.length < 4) return baseTris;

  const result: Triangle[] = [];

  for (const tri of baseTris) {
    if (!aabbsOverlap(triAABB(tri), subAABB)) {
      result.push(tri);
      continue;
    }

    let candidates: Triangle[] = [tri];
    for (const plane of planes) {
      if (!candidates.length) break;
      const nextCandidates: Triangle[] = [];
      for (const frag of candidates) {
        const { inside, outside } = splitByPlane(frag, plane);
        result.push(...outside);
        nextCandidates.push(...inside);
      }
      candidates = nextCandidates;
    }
    // Triangles fully inside all planes are removed (subtracted)
  }

  return result;
}

// ─── Main CSG entry ───────────────────────────────────────────────────────────

async function performCSG(
  basePositions: Float32Array,
  baseIndices: Uint32Array,
  slots: Array<{positions: Float32Array; indices: Uint32Array; rotation: [number,number,number]}>
): Promise<{vertices: Float32Array; faces: Uint32Array}> {
  console.log(`🚀 CSG: subtracting ${slots.length} slot(s) from ${basePositions.length/3} verts`);
  let baseTris = extractTriangles(basePositions, baseIndices);
  for (let si = 0; si < slots.length; si++) {
    const subTris = extractTriangles(slots[si].positions, slots[si].indices);
    console.log(`  Slot ${si+1}/${slots.length}: ${subTris.length} sub-tris`);
    baseTris = subtractMesh(baseTris, subTris);
    console.log(`  → ${baseTris.length} tris remaining`);
  }
  const {positions, indices} = trianglesToBuffers(baseTris);
  console.log(`✅ Done: ${positions.length/3} verts, ${indices.length/3} faces`);
  return {vertices: positions, faces: indices};
}

// ─── Worker message handler ───────────────────────────────────────────────────

self.onmessage = async (e: MessageEvent<WorkerInput>) => {
  const {base, slots} = e.data;
  try {
    // ── Validate base ────────────────────────────────────────────────────────
    if (!base || !Array.isArray(base.positions) || base.positions.length === 0) {
      throw new Error(`Invalid base geometry: positions=${JSON.stringify(base?.positions?.length)}`);
    }

    const basePositions = new Float32Array(base.positions);
    const baseIndices   = base.indices && base.indices.length > 0
      ? new Uint32Array(base.indices)
      : makeSequentialIndices(base.positions.length / 3);

    // ── Validate and map slots ────────────────────────────────────────────────
    if (!Array.isArray(slots) || slots.length === 0) {
      throw new Error('No slots provided');
    }

    const slotsData = slots.map((slot, i) => {
      // ── Key normalisation: accept both 'positions'/'indices' (plural) AND
      //    'position'/'index' (singular) since old serialisation used singular.
      const rawPositions = (slot as any).positions ?? (slot as any).position;
      const rawIndices   = (slot as any).indices   ?? (slot as any).index;

      if (!rawPositions || (rawPositions as any).length === 0) {
        throw new Error(`Slot ${i} has no positions`);
      }

      const rot = slot.rotation as any;
      let rotation: [number,number,number];
      if (Array.isArray(rot))                  rotation = [rot[0]??0, rot[1]??0, rot[2]??0];
      else if (rot && typeof rot === 'object') rotation = [rot.x??0, rot.y??0, rot.z??0];
      else                                     rotation = [0, 0, 0];

      const positions = new Float32Array(rawPositions);
      const indices   = rawIndices && (rawIndices as any).length > 0
        ? new Uint32Array(rawIndices)
        : makeSequentialIndices(positions.length / 3);

      return { positions, indices, rotation };
    });

    const result = await performCSG(basePositions, baseIndices, slotsData);

    self.postMessage({
      success: true,
      geometry: {
        positions: Array.from(result.vertices),
        indices:   Array.from(result.faces),
        normals:   null,
      },
      stats: {
        vertices:     result.vertices.length / 3,
        faces:        result.faces.length / 3,
        isWatertight: false,
      },
    } as WorkerOutput);

  } catch (err: any) {
    console.error('❌ CSG Worker error:', err);
    self.postMessage({
      success: false,
      error: err?.message ?? 'CSG failed',
      stack: err?.stack,
    } as WorkerOutput);
  }
};

console.log('👷 CSG Worker ready (pure-JS BSP subtraction)');
