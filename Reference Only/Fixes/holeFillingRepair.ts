/**
 * holeFillingRepair.ts
 *
 * Strategy B + C:
 *   B) Find all open boundary edge loops left by the BSP slot cutter,
 *      triangulate each loop with an ear-clip / fan-from-centroid approach,
 *      and stitch the caps back onto the geometry so every hole is closed.
 *
 *   C) After hole-filling, run mergeVertices with a WIDER tolerance (0.02 mm)
 *      to weld the stray/non-adjacent aberrant vertices that caused Manifold3D
 *      to fail previously.  Then attempt manifoldSubtract for a truly watertight
 *      result; if Manifold still rejects the mesh, return the hole-filled
 *      (visually correct) geometry instead of nothing.
 *
 * Exported API
 * ────────────
 *   fillHolesAndRepair(geo)  →  THREE.BufferGeometry   (synchronous, main thread)
 *   fillHolesManifold(geo, slotGeos)  →  Promise<THREE.BufferGeometry>
 *       attempts Manifold after hole fill; resolves to hole-filled geo on failure
 */

import * as THREE from 'three';
// @ts-ignore
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils';

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Build a map  edgeKey → [faceIndex, …]  so we can find boundary edges. */
function buildBoundaryEdgeMap(
  posCount: number,
  indices: THREE.BufferAttribute
): Map<string, { v0: number; v1: number }> {
  // edgeKey → how many faces reference this undirected edge
  const faceCount = new Map<string, number>();
  // edgeKey → directed v0→v1 from the first face that saw it
  const directed  = new Map<string, { v0: number; v1: number }>();

  for (let i = 0; i < indices.count; i += 3) {
    const a = indices.getX(i);
    const b = indices.getX(i + 1);
    const c = indices.getX(i + 2);
    const verts = [a, b, c];
    for (let k = 0; k < 3; k++) {
      const v0 = verts[k];
      const v1 = verts[(k + 1) % 3];
      const key = v0 < v1 ? `${v0}_${v1}` : `${v1}_${v0}`;
      faceCount.set(key, (faceCount.get(key) ?? 0) + 1);
      if (!directed.has(key)) directed.set(key, { v0, v1 });
    }
  }

  // Keep only edges shared by exactly 1 face → open boundary
  const boundary = new Map<string, { v0: number; v1: number }>();
  faceCount.forEach((count, key) => {
    if (count === 1) boundary.set(key, directed.get(key)!);
  });
  return boundary;
}

/**
 * Chain boundary edges into closed loops.
 * Returns an array of vertex-index loops (each loop ends where it starts).
 */
function chainBoundaryLoops(
  boundary: Map<string, { v0: number; v1: number }>
): number[][] {
  // Build adjacency: vertex → [next vertex, …]
  const next = new Map<number, number[]>();
  boundary.forEach(({ v0, v1 }) => {
    if (!next.has(v0)) next.set(v0, []);
    if (!next.has(v1)) next.set(v1, []);
    next.get(v0)!.push(v1);
    next.get(v1)!.push(v0);
  });

  const visited = new Set<number>();
  const loops: number[][] = [];

  next.forEach((_, start) => {
    if (visited.has(start)) return;
    const loop: number[] = [];
    let cur = start;
    let prev = -1;
    // Walk the loop; prefer an unvisited neighbour each step
    for (let safety = 0; safety < 100000; safety++) {
      if (visited.has(cur) && cur !== start) break;
      loop.push(cur);
      visited.add(cur);
      const neighbours = next.get(cur) ?? [];
      let moved = false;
      for (const nb of neighbours) {
        if (nb === prev) continue;
        if (!visited.has(nb) || (nb === start && loop.length > 2)) {
          prev = cur;
          cur  = nb;
          moved = true;
          break;
        }
      }
      if (!moved) break;
      if (cur === start && loop.length > 2) break;
    }
    if (loop.length >= 3) loops.push(loop);
  });

  return loops;
}

/**
 * Triangulate a boundary loop using a centroid fan.
 * Winding is chosen to match the average face normal of the surrounding mesh
 * (we pick the winding that gives a normal pointing "outward" — away from
 * the mesh centroid, which is a reliable heuristic for snowflake shapes).
 */
function fanTriangulateLoop(
  loop: number[],
  positions: THREE.BufferAttribute,
  meshCentroid: THREE.Vector3
): number[] {
  if (loop.length < 3) return [];

  // Compute loop centroid
  const cx = loop.reduce((s, i) => s + positions.getX(i), 0) / loop.length;
  const cy = loop.reduce((s, i) => s + positions.getY(i), 0) / loop.length;
  const cz = loop.reduce((s, i) => s + positions.getZ(i), 0) / loop.length;

  // Check winding: use the first triangle to determine if we need to flip
  const p0 = new THREE.Vector3(positions.getX(loop[0]), positions.getY(loop[0]), positions.getZ(loop[0]));
  const p1 = new THREE.Vector3(positions.getX(loop[1]), positions.getY(loop[1]), positions.getZ(loop[1]));
  const centroidPt = new THREE.Vector3(cx, cy, cz);

  const edge1 = new THREE.Vector3().subVectors(p1, p0);
  const edgeC = new THREE.Vector3().subVectors(centroidPt, p0);
  const normal = new THREE.Vector3().crossVectors(edge1, edgeC);
  const toMeshCentre = new THREE.Vector3().subVectors(meshCentroid, centroidPt);
  // If normal points toward mesh centre it's inward — flip winding
  const flip = normal.dot(toMeshCentre) > 0;

  const newTris: number[] = [];
  // We'll add the centroid as a NEW vertex (index returned separately)
  // But we avoid adding vertices here — instead use ear-clip with existing verts
  // for small loops; fan from centroid for larger loops.

  if (loop.length === 3) {
    if (flip) newTris.push(loop[0], loop[2], loop[1]);
    else      newTris.push(loop[0], loop[1], loop[2]);
    return newTris;
  }

  // Fan triangulation — returns pairs (centroidIdx will be computed by caller)
  // We return a special marker array: [CENTROID_MARKER, cx, cy, cz, i0, i1, …]
  // The caller (fillHolesAndRepair) handles vertex insertion.
  // Here we return a flat list of [loop[i], loop[i+1], CENTROID] triples
  // encoded as negative centroid placeholder = -1 (caller replaces it).
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    if (flip) newTris.push(b, a, -1);   // -1 = centroid placeholder
    else      newTris.push(a, b, -1);
  }
  // Encode centroid coords in the last 3 slots as a sentinel
  newTris.push(-2, cx, cy, cz);
  return newTris;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: B — hole fill (synchronous)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fill all open boundary loops with fan-triangulated caps and return a new
 * (still possibly non-manifold) geometry with closed holes.
 * Runs on the main thread; typically <10 ms for snowflake-scale meshes.
 */
export function fillHolesAndRepair(
  geometry: THREE.BufferGeometry
): THREE.BufferGeometry {

  // ── Ensure indexed ────────────────────────────────────────────────────────
  let geo = geometry;
  if (!geo.index) {
    // toNonIndexed + then re-index via mergeVertices
    geo = BufferGeometryUtils.mergeVertices(geometry.clone(), 1e-4) as THREE.BufferGeometry;
  }
  if (!geo.index) return geometry; // give up if still unindexed

  const positions = geo.attributes.position as THREE.BufferAttribute;
  const indexAttr = geo.index!;

  // ── Find boundary edges ───────────────────────────────────────────────────
  const boundary = buildBoundaryEdgeMap(positions.count, indexAttr);
  if (boundary.size === 0) {
    console.log('✅ No boundary edges found — geometry already closed');
    return geometry;
  }
  console.log(`🔧 fillHolesAndRepair: found ${boundary.size} boundary edges`);

  // ── Chain into loops ──────────────────────────────────────────────────────
  const loops = chainBoundaryLoops(boundary);
  console.log(`   → ${loops.length} boundary loop(s)`);
  if (loops.length === 0) return geometry;

  // ── Compute mesh centroid for winding heuristic ───────────────────────────
  const meshBox = new THREE.Box3().setFromBufferAttribute(positions);
  const meshCentroid = new THREE.Vector3();
  meshBox.getCenter(meshCentroid);

  // ── Build new vertex + index arrays ──────────────────────────────────────
  // Copy existing positions
  const posArray = Array.from(positions.array as Float32Array);
  const newIndices = Array.from(indexAttr.array as Uint32Array);

  for (const loop of loops) {
    if (loop.length < 3) continue;

    const tris = fanTriangulateLoop(loop, positions, meshCentroid);
    if (tris.length === 0) continue;

    // Check if this is a fan with centroid placeholder (-1)
    const hasCentroid = tris.includes(-2);

    if (!hasCentroid) {
      // Simple tri (loop.length === 3), no centroid needed
      newIndices.push(...tris);
      continue;
    }

    // Extract centroid coords from sentinel at end: [..., -2, cx, cy, cz]
    const sentinelIdx = tris.lastIndexOf(-2);
    const cx = tris[sentinelIdx + 1];
    const cy = tris[sentinelIdx + 2];
    const cz = tris[sentinelIdx + 3];

    // Add centroid as new vertex
    const centroidIdx = posArray.length / 3;
    posArray.push(cx, cy, cz);

    // Replace -1 placeholders with centroidIdx
    for (let i = 0; i < sentinelIdx; i++) {
      if (tris[i] === -1) newIndices.push(centroidIdx);
      else                newIndices.push(tris[i]);
    }
  }

  // ── Rebuild geometry ──────────────────────────────────────────────────────
  const filled = new THREE.BufferGeometry();
  filled.setAttribute('position', new THREE.Float32BufferAttribute(posArray, 3));
  filled.setIndex(newIndices);
  filled.computeVertexNormals();
  filled.computeBoundingBox();

  const report = checkBoundaryEdges(filled);
  console.log(`   After fill: ${report.boundary} boundary edges remain, ${report.nonManifold} non-manifold`);

  return filled;
}

function checkBoundaryEdges(geo: THREE.BufferGeometry) {
  if (!geo.index) return { boundary: -1, nonManifold: -1 };
  const faceCount = new Map<string, number>();
  const idx = geo.index;
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i), b = idx.getX(i+1), c = idx.getX(i+2);
    [[a,b],[b,c],[c,a]].forEach(([v0,v1]) => {
      const k = v0 < v1 ? `${v0}_${v1}` : `${v1}_${v0}`;
      faceCount.set(k, (faceCount.get(k) ?? 0) + 1);
    });
  }
  let boundary = 0, nonManifold = 0;
  faceCount.forEach(v => { if (v === 1) boundary++; else if (v > 2) nonManifold++; });
  return { boundary, nonManifold };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: B + C combined — hole fill then Manifold attempt
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Full B+C pipeline:
 *   1. fillHolesAndRepair (B) — closes open boundaries
 *   2. mergeVertices at wider tolerance (0.02) — welds aberrant BSP seam verts
 *   3. Try manifoldSubtract (C) — returns watertight manifold if it succeeds
 *   4. On Manifold failure → return hole-filled geometry (still valid for STL)
 *
 * @param cutGeometry  - the BSP-cut geometry from the worker
 * @param slotGeometries - the original slot blade geometries (for Manifold re-subtract)
 *                         Pass [] to skip Manifold and just return hole-filled result.
 */
export async function fillHolesManifold(
  cutGeometry: THREE.BufferGeometry,
  slotGeometries: THREE.BufferGeometry[] = []
): Promise<THREE.BufferGeometry> {

  // ── Step B: close holes ───────────────────────────────────────────────────
  console.log('🔧 B+C: Starting hole fill pass...');
  let filled = fillHolesAndRepair(cutGeometry);

  // ── Widen merge tolerance to weld aberrant seam vertices ──────────────────
  // The BSP splitter can leave seam vertices 0.005–0.02 mm apart that
  // mergeVertices(0.001) misses.  0.02 mm is safe for 3D-print tolerances.
  try {
    filled = BufferGeometryUtils.mergeVertices(filled, 0.02) as THREE.BufferGeometry;
    filled.computeVertexNormals();
    console.log(`   mergeVertices(0.02): ${filled.attributes.position.count} verts`);
  } catch (e) {
    console.warn('   mergeVertices failed, continuing with un-merged geo', e);
  }

  // ── Step C: attempt Manifold ──────────────────────────────────────────────
  if (slotGeometries.length === 0) {
    console.log('ℹ️  No slot geometries supplied — skipping Manifold step');
    return filled;
  }

  try {
    // Lazy-import so we don't block if manifold-3d is unavailable
    const { manifoldSubtract, initManifold } = await import('./manifoldCSG');
    await initManifold();

    console.log('🔧 C: Attempting Manifold subtraction on hole-filled geometry...');
    const result = await manifoldSubtract(filled, slotGeometries);
    console.log('✅ Manifold subtraction succeeded — geometry is watertight');
    return result;
  } catch (err: any) {
    // Manifold still failed — that's OK, the hole-filled geo is usable
    console.warn(`⚠️  Manifold step failed (${err?.message ?? err}); using hole-filled geometry`);
    return filled;
  }
}
