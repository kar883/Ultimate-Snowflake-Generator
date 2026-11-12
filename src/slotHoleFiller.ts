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
 * Filling: once a qualifying loop is found, we triangulate it in the
 * cutter-plane basis using THREE.ShapeUtils. This handles concave and tiny
 * distal loops more reliably than centroid-fan triangulation.
 *
 * Dependencies: three only (no three-mesh-bvh needed)
 */

import * as THREE from 'three';

const SLOT_HOLE_FILLER_DEBUG = false;

// tunables

/**
 * A loop vertex is considered "on" a cutter face plane if its signed distance
 * to that plane is within this tolerance. Increase if holes are missed;
 * decrease if font loops are accidentally filled.
 */
const PLANE_TOL = 0.18; // world units
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

  if (SLOT_HOLE_FILLER_DEBUG) {
    console.log(`SlotHoleFiller: ${cutterPlanes.length} cutter planes from ${cutters.length} cutter(s)`);
  }

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
  const boundaryEdges: Array<[number, number]> = [];
  let totalBoundary = 0;
  for (const { v0, v1, count } of edgeValence.values()) {
    if (count === 1) {
      totalBoundary++;
      boundaryEdges.push([v0, v1]);
      if (!boundaryAdj.has(v0)) boundaryAdj.set(v0, []);
      if (!boundaryAdj.has(v1)) boundaryAdj.set(v1, []);
      boundaryAdj.get(v0)!.push(v1);
      boundaryAdj.get(v1)!.push(v0);
    }
  }

  if (SLOT_HOLE_FILLER_DEBUG) {
    console.log(`  ${totalBoundary} boundary edges found`);
  }
  if (!totalBoundary) return geometry;

  // 2. Walk into loops

  const usedBoundaryEdges = new Set<string>();
  const allLoops: number[][] = [];

  const edgeKey = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);

  for (const [seedA, seedB] of boundaryEdges) {
    const seedKey = edgeKey(seedA, seedB);
    if (usedBoundaryEdges.has(seedKey)) continue;

    const loop: number[] = [seedA, seedB];
    usedBoundaryEdges.add(seedKey);

    let prev = seedA;
    let cur = seedB;

    for (let safety = 0; safety < 200000; safety++) {
      const nbrs = boundaryAdj.get(cur) ?? [];
      let next = -1;

      for (const n of nbrs) {
        if (n === prev) continue;
        const candidateKey = edgeKey(cur, n);
        if (usedBoundaryEdges.has(candidateKey)) continue;
        next = n;
        break;
      }

      if (next === -1) {
        // If we can close back to start using an unused edge, do it.
        const closeKey = edgeKey(cur, seedA);
        const canClose = (boundaryAdj.get(cur) ?? []).includes(seedA) && !usedBoundaryEdges.has(closeKey);
        if (canClose) {
          usedBoundaryEdges.add(closeKey);
        }
        break;
      }

      const nextKey = edgeKey(cur, next);
      usedBoundaryEdges.add(nextKey);
      loop.push(next);
      prev = cur;
      cur = next;

      if (cur === seedA) break;
    }

    if (loop.length >= 3) {
      // Drop repeated closing vertex if present.
      if (loop[loop.length - 1] === loop[0]) loop.pop();
      allLoops.push(loop);
    }
  }

  if (SLOT_HOLE_FILLER_DEBUG) {
    console.log(`  ${allLoops.length} boundary loop(s) detected`);
  }

  // 3. Filter: keep only loops that lie on a cutter face plane

  const slotLoops: Array<{ loop: number[]; plane: THREE.Plane }> = [];

  for (const loop of allLoops) {
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
      if (SLOT_HOLE_FILLER_DEBUG) {
        console.log(`  Loop (${loop.length} verts) lies on cutter plane -> SLOT HOLE`);
      }
      continue;
    }

    // Controlled recovery: only within a cutter footprint, allow a small amount
    // of plane noise to catch real slot-path holes left by worker subtraction.
    let recoveredPlane: THREE.Plane | null = null;
    for (const info of cutterInfos) {
      if (!info.expandedBox.containsPoint(centroid)) continue;
      const insideRatio = pts.filter((p) => info.expandedBox.containsPoint(p)).length / pts.length;
      if (insideRatio < 0.65) continue;

      for (const plane of info.planes) {
        let within = 0;
        let maxAbs = 0;
        for (const p of pts) {
          const distance = Math.abs(plane.distanceToPoint(p));
          if (distance <= (PLANE_TOL * 2.2)) within++;
          if (distance > maxAbs) maxAbs = distance;
        }
        const ratio = within / pts.length;
        if (ratio >= 0.6 && maxAbs <= (PLANE_TOL * 6.0)) {
          recoveredPlane = plane;
          break;
        }
      }

      if (recoveredPlane) break;
    }

    if (recoveredPlane) {
      slotLoops.push({ loop, plane: recoveredPlane });
      if (SLOT_HOLE_FILLER_DEBUG) {
        console.log(`  Loop (${loop.length} verts) recovered inside cutter footprint -> SLOT HOLE`);
      }
      continue;
    }

    // Final rescue for noisy loops near slot origins/tips.
    // These can appear where multiple cutter passes meet and produce
    // jagged boundaries that fail stricter plane checks.
    {
      let rescuedTinyPlane: THREE.Plane | null = null;
      for (const info of cutterInfos) {
        if (!info.expandedBox.containsPoint(centroid)) continue;

        const insideRatio = pts.filter((p) => info.expandedBox.containsPoint(p)).length / pts.length;
        if (insideRatio < 0.55) continue;

        for (const plane of info.planes) {
          let within = 0;
          let maxAbs = 0;
          for (const p of pts) {
            const distance = Math.abs(plane.distanceToPoint(p));
            if (distance <= (PLANE_TOL * 3.2)) within++;
            if (distance > maxAbs) maxAbs = distance;
          }
          const ratio = within / pts.length;
          if (ratio >= 0.5 && maxAbs <= (PLANE_TOL * 8.0)) {
            rescuedTinyPlane = plane;
            break;
          }
        }

        if (rescuedTinyPlane) break;
      }

      if (rescuedTinyPlane) {
        slotLoops.push({ loop, plane: rescuedTinyPlane });
        if (SLOT_HOLE_FILLER_DEBUG) {
          console.log(`  Loop (${loop.length} verts) noisy-loop rescue near cutter footprint -> SLOT HOLE`);
        }
      }
    }
  }

  if (SLOT_HOLE_FILLER_DEBUG) {
    console.log(`  Filling ${slotLoops.length} slot loop(s), skipping ${allLoops.length - slotLoops.length} other loop(s)`);
  }

  if (!slotLoops.length) {
    console.warn('  No slot holes found. Check PLANE_TOL or that cutters are in world space.');
    return geometry;
  }

  // 4. Triangulate each planar slot loop in a stable 2D basis

  const resolvedIndices: number[] = [];

  for (const entry of slotLoops) {
    const { loop, plane } = entry;
    const pts3 = loop.map(vi => new THREE.Vector3(
      posAttr.getX(vi), posAttr.getY(vi), posAttr.getZ(vi)
    ));

    // Build a stable local 2D basis from the matched cutter plane normal.
    const n = plane.normal.clone().normalize();
    const tangentSeed = Math.abs(n.z) < 0.9
      ? new THREE.Vector3(0, 0, 1)
      : new THREE.Vector3(1, 0, 0);
    const u = tangentSeed.clone().cross(n).normalize();
    const v = n.clone().cross(u).normalize();
    const origin = pts3[0];

    // Remove consecutive duplicate points before triangulation.
    const cleanLoopIndices: number[] = [];
    const cleanPts2: THREE.Vector2[] = [];
    let prev2: THREE.Vector2 | null = null;
    for (let i = 0; i < loop.length; i++) {
      const p = pts3[i];
      const rel = p.clone().sub(origin);
      const p2 = new THREE.Vector2(rel.dot(u), rel.dot(v));
      if (!prev2 || p2.distanceToSquared(prev2) > 1e-10) {
        cleanLoopIndices.push(loop[i]);
        cleanPts2.push(p2);
        prev2 = p2;
      }
    }
    if (cleanPts2.length >= 2) {
      const first = cleanPts2[0];
      const last = cleanPts2[cleanPts2.length - 1];
      if (first.distanceToSquared(last) <= 1e-10) {
        cleanPts2.pop();
        cleanLoopIndices.pop();
      }
    }

    if (cleanPts2.length < 3) continue;

    const tris = THREE.ShapeUtils.triangulateShape(cleanPts2, []);
    if (!tris.length) {
      // Fallback to a simple fan for extremely small/noisy loops.
      for (let i = 1; i < cleanLoopIndices.length - 1; i++) {
        resolvedIndices.push(cleanLoopIndices[0], cleanLoopIndices[i], cleanLoopIndices[i + 1]);
      }
      continue;
    }

    for (const tri of tris) {
      const ia = cleanLoopIndices[tri[0]];
      const ib = cleanLoopIndices[tri[1]];
      const ic = cleanLoopIndices[tri[2]];
      resolvedIndices.push(ia, ib, ic);
    }
  }

  // 5. Build final buffers

  const origPos = (geo.attributes.position as THREE.BufferAttribute).array as Float32Array;
  const origIdx = geo.index!.array as Uint32Array;

  const newIdxArr = new Uint32Array(origIdx.length + resolvedIndices.length);
  newIdxArr.set(origIdx);
  newIdxArr.set(resolvedIndices, origIdx.length);

  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.BufferAttribute(new Float32Array(origPos), 3));
  result.setIndex(new THREE.BufferAttribute(newIdxArr, 1));
  result.computeVertexNormals();
  result.computeBoundingBox();

  if (SLOT_HOLE_FILLER_DEBUG) {
    console.log(`SlotHoleFiller: ${resolvedIndices.length / 3} fill triangles across ${slotLoops.length} slot hole(s)`);
  }
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

