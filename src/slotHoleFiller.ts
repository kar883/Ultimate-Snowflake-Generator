/**
 * slotHoleFiller.ts
 *
 * Fills ONLY the open holes left by slot-cut Boolean operations.
 *
 * Core insight: slot cutters are boxes. The holes they leave in the mesh
 * have boundary edges that lie on the flat faces of the box. Font counter
 * loops are curved - their vertices do NOT lie on a flat plane.
 *
 * Filter: a boundary loop qualifies as a slot hole if ALL of its vertices
 * lie within PLANE_TOL of any face-plane of any cutter box. This is a
 * simple, reliable test that requires no BVH, no raycasting, no AABB
 * fraction counting.
 *
 * Filling: once a qualifying loop is found, we fan-triangulate it from
 * its centroid. This is correct because the loop is planar (all verts on
 * the same plane) so a fan from the centroid always produces valid triangles.
 *
 * Dependencies: three only (no three-mesh-bvh needed)
 */

import * as THREE from 'three';

// tunables

/**
 * A loop vertex is considered "on" a cutter face plane if its signed distance
 * to that plane is within this tolerance. Increase if holes are missed;
 * decrease if font loops are accidentally filled.
 */
const PLANE_TOL = 0.18; // world units
const MICRO_LOOP_MAX_VERTS = 20;
const MICRO_LOOP_MAX_PERIMETER = 4.0;

// public API

/**
 * Fill slot-cut holes in `geometry`.
 *
 * @param geometry  Post-cut mesh with open holes along the slot walls
 * @param cutters   The slot cutter BoxGeometries in world space (pre-rotated,
 *                  same geometries passed to the BSP worker)
 */
export function fillSlotHoles(
  geometry: THREE.BufferGeometry,
  cutters: THREE.BufferGeometry[]
): THREE.BufferGeometry {

  if (!cutters.length) return geometry;

  const cutterInfos = cutters.map((cutter) => {
    const box = new THREE.Box3().setFromBufferAttribute(cutter.attributes.position as THREE.BufferAttribute);
    return {
      box,
      expandedBox: box.clone().expandByScalar(PLANE_TOL * 2.5),
      planes: extractBoxPlanes(cutter),
    };
  });
  const cutterPlanes = cutterInfos.flatMap((info) => info.planes);

  console.log(`SlotHoleFiller: ${cutterPlanes.length} cutter planes from ${cutters.length} cutter(s)`);

  // 1. Find boundary edges

  const posAttr = geometry.attributes.position as THREE.BufferAttribute;
  const geo = ensureIndexed(geometry);
  const idxAttr = geo.index!;

  const edgeValence = new Map<string, { v0: number; v1: number; count: number }>();
  for (let i = 0; i < idxAttr.count; i += 3) {
    const a = idxAttr.getX(i), b = idxAttr.getX(i + 1), c = idxAttr.getX(i + 2);
    for (const [v0, v1] of [[a, b], [b, c], [c, a]] as [number, number][]) {
      const key = v0 < v1 ? `${v0}_${v1}` : `${v1}_${v0}`;
      const e = edgeValence.get(key);
      if (e) e.count++; else edgeValence.set(key, { v0, v1, count: 1 });
    }
  }

  const boundaryAdj = new Map<number, number[]>();
  let totalBoundary = 0;
  for (const { v0, v1, count } of edgeValence.values()) {
    if (count === 1) {
      totalBoundary++;
      if (!boundaryAdj.has(v0)) boundaryAdj.set(v0, []);
      if (!boundaryAdj.has(v1)) boundaryAdj.set(v1, []);
      boundaryAdj.get(v0)!.push(v1);
      boundaryAdj.get(v1)!.push(v0);
    }
  }

  console.log(`  ${totalBoundary} boundary edges found`);
  if (!totalBoundary) return geometry;

  // 2. Walk into loops

  const visited = new Set<number>();
  const allLoops: number[][] = [];

  for (const startV of boundaryAdj.keys()) {
    if (visited.has(startV)) continue;
    const loop = [startV];
    visited.add(startV);
    let cur = startV, prev = -1;

    for (let safety = 0; safety < 200000; safety++) {
      const nbrs = boundaryAdj.get(cur) ?? [];
      let next = -1;
      for (const n of nbrs) {
        if (n !== prev && !visited.has(n)) { next = n; break; }
      }
      if (next === -1) break;
      visited.add(next);
      loop.push(next);
      prev = cur;
      cur = next;
    }

    if (loop.length >= 3) allLoops.push(loop);
  }

  console.log(`  ${allLoops.length} boundary loop(s) detected`);

  // 3. Filter: keep only loops that lie on a cutter face plane

  const slotLoops: Array<{ loop: number[]; plane: THREE.Plane }> = [];

  for (const loop of allLoops) {
    if (isMicroLoop(loop, posAttr)) continue;

    const pts = loop.map(vi => new THREE.Vector3(
      posAttr.getX(vi), posAttr.getY(vi), posAttr.getZ(vi)
    ));
    const centroid = new THREE.Vector3();
    pts.forEach((p) => centroid.add(p));
    centroid.divideScalar(pts.length);

    const strictMatch = cutterInfos.find((info) => {
      if (!info.expandedBox.containsPoint(centroid)) return false;
      const insideRatio = pts.filter((p) => info.expandedBox.containsPoint(p)).length / pts.length;
      if (insideRatio < 0.8) return false;
      return info.planes.some((plane) =>
        pts.every((p) => Math.abs(plane.distanceToPoint(p)) < PLANE_TOL)
      );
    });

    if (strictMatch) {
      const plane = strictMatch.planes.find((candidate) =>
        pts.every((p) => Math.abs(candidate.distanceToPoint(p)) < PLANE_TOL)
      ) ?? strictMatch.planes[0];
      slotLoops.push({ loop, plane });
      console.log(`  Loop (${loop.length} verts) lies on cutter plane -> SLOT HOLE`);
      continue;
    }

    // Controlled recovery: only within a cutter footprint, allow a small amount
    // of plane noise to catch real slot-path holes left by worker subtraction.
    let recoveredPlane: THREE.Plane | null = null;
    for (const info of cutterInfos) {
      if (!info.expandedBox.containsPoint(centroid)) continue;
      const insideRatio = pts.filter((p) => info.expandedBox.containsPoint(p)).length / pts.length;
      if (insideRatio < 0.75) continue;

      for (const plane of info.planes) {
        let within = 0;
        let maxAbs = 0;
        for (const p of pts) {
          const distance = Math.abs(plane.distanceToPoint(p));
          if (distance <= (PLANE_TOL * 1.35)) within++;
          if (distance > maxAbs) maxAbs = distance;
        }
        const ratio = within / pts.length;
        if (ratio >= 0.85 && maxAbs <= (PLANE_TOL * 3.0)) {
          recoveredPlane = plane;
          break;
        }
      }

      if (recoveredPlane) break;
    }

    if (recoveredPlane) {
      slotLoops.push({ loop, plane: recoveredPlane });
      console.log(`  Loop (${loop.length} verts) recovered inside cutter footprint -> SLOT HOLE`);
    }
  }

  console.log(`  Filling ${slotLoops.length} slot loop(s), skipping ${allLoops.length - slotLoops.length} other loop(s)`);

  if (!slotLoops.length) {
    console.warn('  No slot holes found. Check PLANE_TOL or that cutters are in world space.');
    return geometry;
  }

  // 4. Fan-triangulate each planar slot loop from its centroid

  const fillIndices: number[] = [];

  for (const entry of slotLoops) {
    const { loop, plane } = entry;
    const pts = loop.map(vi => new THREE.Vector3(
      posAttr.getX(vi), posAttr.getY(vi), posAttr.getZ(vi)
    ));

    // Compute centroid
    const centroid = new THREE.Vector3();
    pts.forEach(p => centroid.add(p));
    centroid.divideScalar(pts.length);

    // Determine correct winding based on matched cutter plane normal
    const p0 = pts[0], p1 = pts[1];
    const fanNormal = new THREE.Vector3()
      .crossVectors(p0.clone().sub(centroid), p1.clone().sub(centroid))
      .normalize();

    const planeNormal = plane.normal.clone();
    const needsFlip = fanNormal.dot(planeNormal) < 0;

    for (let i = 0; i < loop.length; i++) {
      const ia = loop[i];
      const ib = loop[(i + 1) % loop.length];
      if (needsFlip) {
        fillIndices.push(-1, ib, ia);
      } else {
        fillIndices.push(-1, ia, ib);
      }
    }

    (fillIndices as any).__centroids = (fillIndices as any).__centroids ?? [];
    (fillIndices as any).__centroids.push({
      centroid,
      startTri: fillIndices.length / 3 - loop.length,
      count: loop.length,
    });
  }

  // 5. Resolve centroid placeholders and build final buffers

  const centroids: { centroid: THREE.Vector3; startTri: number; count: number }[] =
    (fillIndices as any).__centroids ?? [];

  const origPos = (geo.attributes.position as THREE.BufferAttribute).array as Float32Array;
  const origIdx = geo.index!.array as Uint32Array;

  const newPosArr: number[] = Array.from(origPos);
  const centroidBaseIdx = origPos.length / 3;

  centroids.forEach(({ centroid }) => {
    newPosArr.push(centroid.x, centroid.y, centroid.z);
  });

  const resolvedIndices: number[] = [];
  for (let ti = 0; ti < fillIndices.length / 3; ti++) {
    const ci = centroids.findIndex(c => ti >= c.startTri && ti < c.startTri + c.count);
    const centroidIdx = centroidBaseIdx + ci;
    const base = ti * 3;
    resolvedIndices.push(
      fillIndices[base] === -1 ? centroidIdx : fillIndices[base],
      fillIndices[base + 1] === -1 ? centroidIdx : fillIndices[base + 1],
      fillIndices[base + 2] === -1 ? centroidIdx : fillIndices[base + 2],
    );
  }

  const newIdxArr = new Uint32Array(origIdx.length + resolvedIndices.length);
  newIdxArr.set(origIdx);
  newIdxArr.set(resolvedIndices, origIdx.length);

  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.BufferAttribute(new Float32Array(newPosArr), 3));
  result.setIndex(new THREE.BufferAttribute(newIdxArr, 1));
  result.computeVertexNormals();
  result.computeBoundingBox();

  console.log(`SlotHoleFiller: ${resolvedIndices.length / 3} fill triangles across ${slotLoops.length} slot hole(s)`);
  return result;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Extract the 6 face planes of a BoxGeometry (or any convex cutter geometry)
 * by computing the plane for each pair of opposing face groups.
 *
 * For a BoxGeometry we know exactly what the 6 faces are, but we derive them
 * from the actual vertex positions so rotation is handled automatically.
 */
function extractBoxPlanes(geo: THREE.BufferGeometry): THREE.Plane[] {
  geo.computeBoundingBox();
  const box = geo.boundingBox!;
  const planes: THREE.Plane[] = [];

  // The 6 face planes of the AABB — these match the box faces exactly
  // because BoxGeometry faces are axis-aligned before rotation, and after
  // applyMatrix4 the boundingBox still gives us the correct face planes.
  //
  // For a rotated box the AABB faces don't match the actual box faces.
  // We need the actual face normals from the geometry instead.

  const posAttr = geo.attributes.position as THREE.BufferAttribute;
  const idxAttr = geo.index;

  const faceNormals = new Map<string, { normal: THREE.Vector3; d: number }>();

  const triCount = idxAttr ? idxAttr.count / 3 : posAttr.count / 3;
  const getPos = (i: number) => {
    const idx = idxAttr ? idxAttr.getX(i) : i;
    return new THREE.Vector3(posAttr.getX(idx), posAttr.getY(idx), posAttr.getZ(idx));
  };

  for (let t = 0; t < triCount; t++) {
    const a = getPos(t * 3);
    const b = getPos(t * 3 + 1);
    const c = getPos(t * 3 + 2);

    const normal = new THREE.Vector3()
      .crossVectors(b.clone().sub(a), c.clone().sub(a))
      .normalize();

    if (normal.lengthSq() < 0.5) continue; // degenerate

    const d = -normal.dot(a);

    // Snap normal to 3 sig figs to group coplanar faces
    const key = `${normal.x.toFixed(3)},${normal.y.toFixed(3)},${normal.z.toFixed(3)}`;
    if (!faceNormals.has(key)) {
      faceNormals.set(key, { normal, d });
    }
  }

  for (const { normal, d } of faceNormals.values()) {
    planes.push(new THREE.Plane(normal, d));
  }

  return planes;
}

function ensureIndexed(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  if (geo.index) return geo;
  const n = geo.attributes.position.count;
  const idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  const out = geo.clone();
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

function isMicroLoop(loop: number[], posAttr: THREE.BufferAttribute): boolean {
  if (loop.length > MICRO_LOOP_MAX_VERTS) return false;

  let perimeter = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  for (let i = 0; i < loop.length; i++) {
    const ia = loop[i];
    const ib = loop[(i + 1) % loop.length];
    a.set(posAttr.getX(ia), posAttr.getY(ia), posAttr.getZ(ia));
    b.set(posAttr.getX(ib), posAttr.getY(ib), posAttr.getZ(ib));
    perimeter += a.distanceTo(b);
  }

  return perimeter <= MICRO_LOOP_MAX_PERIMETER;
}

