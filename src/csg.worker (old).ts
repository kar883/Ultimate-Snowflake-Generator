/**
 * CSG Worker — Convex Subtraction (no cap insertion)
 *
 * For 3D-printable slot cuts, we only need to REMOVE the material inside the
 * slot box. The resulting open edges at the slot boundary are acceptable for
 * printing — slicers handle open shells fine, and the interlocking fit does
 * not require closed slot walls.
 *
 * Removing the cap-insertion step eliminates both previous bugs:
 *   - "Adding material": all subtractor box faces were being inserted as caps
 *     because their centroids sit on the box surface (distance ≈ 0), passing
 *     the pointInsideConvex test with any nonzero epsilon.
 *   - "Leftover walls": caps placed by unreliable point-in-mesh ray casting.
 *
 * ALGORITHM — correct convex subtraction (A − B, B convex):
 * ──────────────────────────────────────────────────────────
 * For each base triangle that overlaps the subtractor AABB:
 *   Maintain a set of "candidate" fragments (initially just the triangle).
 *   For each outward face plane of the subtractor:
 *     Split each candidate into {inside-this-plane, outside-this-plane}.
 *     outside-this-plane → KEEP immediately (it's outside the subtractor).
 *     inside-this-plane  → pass to the next plane check.
 *   After all planes, any remaining candidates are inside ALL planes
 *   (i.e. inside the convex subtractor) → DISCARD.
 *
 * Key correctness property: a fragment deposited as "outside plane K" may
 * still be inside planes K+1…N, so it cannot be deposited after all planes.
 * The per-plane split-and-deposit is the correct approach: once a fragment
 * is outside any single plane of a convex solid, it is definitively outside
 * the solid — no further testing needed for that fragment.
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
  add:   (a: Vec3, b: Vec3): Vec3 => ({ x: a.x+b.x, y: a.y+b.y, z: a.z+b.z }),
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

function trianglesToBuffers(tris: Triangle[]): { positions: Float32Array; indices: Uint32Array } {
  const positions = new Float32Array(tris.length * 9);
  const indices   = new Uint32Array(tris.length * 3);
  for (let i = 0; i < tris.length; i++) {
    const b=i*9, {a, b:bv, c}=tris[i];
    positions[b]  =a.x;  positions[b+1]=a.y;  positions[b+2]=a.z;
    positions[b+3]=bv.x; positions[b+4]=bv.y; positions[b+5]=bv.z;
    positions[b+6]=c.x;  positions[b+7]=c.y;  positions[b+8]=c.z;
    indices[i*3]=i*3; indices[i*3+1]=i*3+1; indices[i*3+2]=i*3+2;
  }
  return { positions, indices };
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
// Groups triangles by normal (snapped to 2dp), keeps outermost plane per group.
// A BoxGeometry yields exactly 6 planes.

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
// Returns the portions of `tri` on each side of `plane`.
// inside  = dist <= 0  (interior of this halfspace)
// outside = dist >= 0  (exterior — definitely outside this face of the solid)

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

  // All outside this plane → definitely outside the solid
  if (d[0] >= -SPLIT_EPS && d[1] >= -SPLIT_EPS && d[2] >= -SPLIT_EPS)
    return { inside: [], outside: [tri] };

  // All inside this plane → needs further testing
  if (d[0] <= SPLIT_EPS && d[1] <= SPLIT_EPS && d[2] <= SPLIT_EPS)
    return { inside: [tri], outside: [] };

  // Straddles the plane — compute intersection points and split
  const inPts: Vec3[] = [], outPts: Vec3[] = [];
  for (let i = 0; i < 3; i++) {
    const j = (i+1) % 3;
    // Assign vertex to appropriate side
    if (d[i] >= -SPLIT_EPS) outPts.push(verts[i]);
    if (d[i] <=  SPLIT_EPS)  inPts.push(verts[i]);
    // Edge crosses the plane → add intersection to both sides
    if ((d[i] > SPLIT_EPS && d[j] < -SPLIT_EPS) ||
        (d[i] < -SPLIT_EPS && d[j] > SPLIT_EPS)) {
      const t = d[i] / (d[i] - d[j]);
      const pt = v3.lerp(verts[i], verts[j], t);
      inPts.push(pt);
      outPts.push(pt);
    }
  }
  return { inside: toTris(inPts), outside: toTris(outPts) };
}

// ─── Cap generation for solid meshes ─────────────────────────────────────────────

function planePoint(plane: Plane): Vec3 {
  // Return a point on the plane (using the plane equation)
  // Handle case where plane.nz is close to zero to avoid division by zero
  if (Math.abs(plane.nz) > 0.001) {
    return { x: 0, y: 0, z: -plane.d / plane.nz };
  } else if (Math.abs(plane.ny) > 0.001) {
    return { x: 0, y: -plane.d / plane.ny, z: 0 };
  } else {
    return { x: -plane.d / plane.nx, y: 0, z: 0 };
  }
}

function generateSlotCaps(subTris: Triangle[], baseTris: Triangle[]): Triangle[] {
  const caps: Triangle[] = [];
  
  // This function should only be called AFTER subtraction is complete
  // to cap the holes left in the resulting mesh, not during subtraction
  
  // For now, return empty since proper hole detection requires
  // analyzing the final mesh topology to find boundary edges
  // This is complex and requires edge-walking algorithms
  
  // The original approach was correct - open shells are fine for 3D printing
  // If solid appearance is needed, it should be handled in rendering/materials
  
  return caps;
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
    // Cheap per-triangle AABB cull
    if (!aabbsOverlap(triAABB(tri), subAABB)) {
      result.push(tri);
      continue;
    }

    // Process planes one at a time.
    // "candidates" = fragments that are inside all planes checked so far.
    // Once a fragment is outside any single plane it is outside the solid —
    // add it to result immediately and stop checking it.
    let candidates: Triangle[] = [tri];

    for (const plane of planes) {
      if (!candidates.length) break;
      const nextCandidates: Triangle[] = [];
      for (const frag of candidates) {
        const { inside, outside } = splitByPlane(frag, plane);
        // outside this plane = outside the convex solid = keep
        result.push(...outside);
        // inside this plane = still possibly inside the solid = check next plane
        nextCandidates.push(...inside);
      }
      candidates = nextCandidates;
    }
    // Remaining candidates are inside every plane = inside subtractor = discard
    // (do not push them)
  }

  // Insert caps to close slot openings for solid mesh appearance
  const caps = generateSlotCaps(subTris, baseTris);
  result.push(...caps);

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
    const basePositions = new Float32Array(base.positions);
    const baseIndices   = base.indices
      ? new Uint32Array(base.indices)
      : makeSequentialIndices(base.positions.length / 3);

    const slotsData = slots.map(slot => {
      const rot = slot.rotation as any;
      let rotation: [number,number,number];
      if (Array.isArray(rot))                  rotation = [rot[0]??0, rot[1]??0, rot[2]??0];
      else if (rot && typeof rot === 'object') rotation = [rot.x??0, rot.y??0, rot.z??0];
      else                                     rotation = [0, 0, 0];
      return {
        positions: new Float32Array(slot.positions),
        indices:   slot.indices
          ? new Uint32Array(slot.indices)
          : makeSequentialIndices(slot.positions.length / 3),
        rotation,
      };
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
        isWatertight: false, // Open shell - proper hole capping requires complex topology analysis
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

console.log('👷 CSG Worker ready (convex subtraction, no caps)');
