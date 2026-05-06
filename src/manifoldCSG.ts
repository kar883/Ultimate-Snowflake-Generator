/**
 * manifoldCSG.ts
 *
 * Manifold-3D Boolean subtraction.
 *
 * The key fix: use wasm.Mesh + wasm.Manifold.ofMesh() which calls the
 * built-in Merge() function to repair slightly non-manifold meshes before
 * creating the Manifold object. This handles the open seams that
 * THREE.ExtrudeGeometry leaves on font shapes with holes.
 */

import Module from 'manifold-3d';
import * as THREE from 'three';
// @ts-ignore
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils';

let wasmInstance: any = null;

export interface SlotProfile2D {
  length: number;
  width: number;
  xOffset?: number;
  yOffset?: number;
  rotationDeg?: number;
}

export interface ShapeInstance2D {
  shape: THREE.Shape;
  transform?: THREE.Matrix3;
  strokeWidth?: number;
}

export async function initManifold() {
  if (!wasmInstance) {
    console.log('🔧 Initializing Manifold WASM...');
    wasmInstance = await Module();
    wasmInstance.setup();
    console.log('✅ Manifold ready');
  }
  return wasmInstance;
}

export async function manifoldSubtract(
  baseGeometry: THREE.BufferGeometry,
  slotGeometries: THREE.BufferGeometry[],
  options?: {
    baseIsManifold?: boolean;
    filletRadius?: number;
    filletSegments?: number;
    filletStyle?: 'fillet' | 'chamfer';
    maxFilletBaseVertices?: number;
  }
): Promise<THREE.BufferGeometry> {

  const wasm = await initManifold();
  const { Manifold, Mesh } = wasm;

  const baseIsManifold = options?.baseIsManifold ?? false;
  const cleanBase = baseIsManifold
    ? ensureIndexed(baseGeometry)
    : prepare(baseGeometry, { weld: true, tolerance: 1e-5 });
  const basePos = cleanBase.attributes.position.array as Float32Array;
  const baseIdx = cleanBase.index!.array as Uint32Array;

  // Build a Mesh object then call Merge() on it before creating Manifold.
  // Merge() welds nearly-coincident vertices and closes the small open seams
  // that ExtrudeGeometry leaves on font shapes with holes (letters o, e, a…).
  const baseMeshObj = new Mesh({
    numProp: 3,
    vertProperties: basePos,
    triVerts: baseIdx,
  });
  const mergeResult = baseIsManifold ? false : baseMeshObj.merge();
  console.log(`  Mesh.merge() result: ${mergeResult} (true = mesh was modified)`);

  let result: any;
  try {
    result = createManifoldFromMesh(Manifold, baseMeshObj);
    console.log('✅ Base Manifold created');
  } catch (err: any) {
    baseMeshObj.delete?.();
    cleanBase.dispose();
    console.error('Base Manifold failed after merge:', err.message ?? err);
    throw err;
  }
  baseMeshObj.delete?.();
  cleanBase.dispose();

  for (let i = 0; i < slotGeometries.length; i++) {
    const cleanSlot = prepare(slotGeometries[i], { weld: true, tolerance: 1e-5 });
    const slotPos = cleanSlot.attributes.position.array as Float32Array;
    const slotIdx = cleanSlot.index!.array as Uint32Array;

    const slotMeshObj = new Mesh({
      numProp: 3,
      vertProperties: slotPos,
      triVerts: slotIdx,
    });
    slotMeshObj.merge();

    try {
      const slotManifold = createManifoldFromMesh(Manifold, slotMeshObj);
      console.log(`  Subtracting slot ${i + 1}/${slotGeometries.length}...`);
      result = result.subtract(slotManifold);
      slotManifold.delete?.();
    } catch (err: any) {
      console.warn(`  Slot ${i + 1} failed: ${err.message ?? err}`);
    }
    slotMeshObj.delete?.();
    cleanSlot.dispose();
  }

  const filletRadius = Math.max(0, options?.filletRadius ?? 0);
  const maxFilletBaseVertices = Math.max(0, options?.maxFilletBaseVertices ?? 200000);
  const baseVertexCount = baseGeometry.attributes.position?.count ?? 0;
  if (filletRadius > 1e-6 && baseVertexCount <= maxFilletBaseVertices) {
    const filletSegments = Math.max(1, options?.filletSegments ?? 1);
    const filletStyle = options?.filletStyle ?? 'fillet';
    const minSharpAngle = filletStyle === 'chamfer' ? 0 : 60;
    const minSmoothness = filletStyle === 'chamfer'
      ? 0.05
      : Math.min(0.95, Math.max(0.18, filletRadius / Math.max(0.25, filletRadius + 0.35)));
    const targetEdgeLength = Math.max(0.35, filletRadius * 1.5 / Math.max(1, filletSegments));

    const smoothed = result.smoothOut(minSharpAngle, minSmoothness);
    result.delete?.();
    result = smoothed.refineToLength(targetEdgeLength);
    smoothed.delete?.();
  } else if (filletRadius > 1e-6) {
    console.debug(
      `[slot-csg] Skipping post-cut fillet: base has ${baseVertexCount} verts (limit ${maxFilletBaseVertices})`
    );
  }

  const finalMesh = result.getMesh();
  result.delete?.();

  const out = meshToBufferGeometry(finalMesh);
  const posCount = out.attributes.position?.count ?? 0;
  const faceCount = out.index ? out.index.count / 3 : 0;

  console.log(`✅ Manifold CSG: ${posCount} verts, ${faceCount} faces (watertight)`);
  return out;
}

export async function manifoldUnionGeometries(
  geometries: THREE.BufferGeometry[]
): Promise<THREE.BufferGeometry> {
  if (!geometries.length) {
    throw new Error('manifoldUnionGeometries requires at least one geometry');
  }

  const wasm = await initManifold();
  const { Manifold, Mesh } = wasm;

  let unionResult: any = null;

  const makeOperandManifold = (geometry: THREE.BufferGeometry) => {
    const weldTolerances = [1e-5, 5e-5, 1e-4, 2e-4];
    let lastError: unknown = null;

    for (const tolerance of weldTolerances) {
      const clean = prepare(geometry, { weld: true, tolerance });
      const pos = clean.attributes.position.array as Float32Array;
      const idx = clean.index!.array as Uint32Array;

      const meshObj = new Mesh({
        numProp: 3,
        vertProperties: pos,
        triVerts: idx,
      });
      meshObj.merge();

      try {
        const piece = createManifoldFromMesh(Manifold, meshObj);
        return { piece, clean, meshObj };
      } catch (err) {
        lastError = err;
        meshObj.delete?.();
        clean.dispose();
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('Failed to create manifold operand for union');
  };

  for (let i = 0; i < geometries.length; i++) {
    const { piece, clean, meshObj } = makeOperandManifold(geometries[i]);

    try {
      if (!unionResult) {
        unionResult = piece;
      } else {
        const next = manifoldUnionOp(unionResult, piece);
        unionResult.delete?.();
        piece.delete?.();
        unionResult = next;
      }
    } finally {
      meshObj.delete?.();
      clean.dispose();
    }
  }

  if (!unionResult) {
    throw new Error('Manifold union failed to produce output');
  }

  const finalMesh = unionResult.getMesh();
  unionResult.delete?.();

  const out = meshToBufferGeometry(finalMesh);
  const posCount = out.attributes.position?.count ?? 0;
  const faceCount = out.index ? out.index.count / 3 : 0;
  console.log(`✅ Manifold union: ${posCount} verts, ${faceCount} faces (watertight)`);
  return out;
}

export async function manifoldProfileCutAndExtrude(
  baseGeometry: THREE.BufferGeometry,
  profiles: SlotProfile2D[],
  extrusionDepth: number
): Promise<THREE.BufferGeometry> {
  const wasm = await initManifold();
  const { Manifold, Mesh, CrossSection } = wasm;

  const cleanBase = prepare(baseGeometry, { weld: false });
  const basePos = cleanBase.attributes.position.array as Float32Array;
  const baseIdx = cleanBase.index!.array as Uint32Array;

  const baseMeshObj = new Mesh({
    numProp: 3,
    vertProperties: basePos,
    triVerts: baseIdx,
  });
  baseMeshObj.merge();

  let baseSolid: any;
  try {
    baseSolid = createManifoldFromMesh(Manifold, baseMeshObj);
  } catch (err: any) {
    baseMeshObj.delete?.();
    cleanBase.dispose();
    throw err;
  }

  baseMeshObj.delete?.();
  cleanBase.dispose();

  let profile = baseSolid.project();
  baseSolid.delete?.();

  if (!profile || profile.isEmpty()) {
    profile?.delete?.();
    return baseGeometry;
  }

  try {
    for (const p of profiles) {
      const slot = CrossSection.square([Math.max(0.01, p.length), Math.max(0.01, p.width)], false)
        // Keep profile placement consistent with the 3D fallback cutter path:
        // xOffset marks the slot start, and geometry extends +length from there.
        .translate((p.xOffset ?? 0) + (p.length / 2), -(p.width / 2) + (p.yOffset ?? 0))
        .rotate(p.rotationDeg ?? 0);
      const next = profile.subtract(slot);
      slot.delete?.();
      profile.delete?.();
      profile = next;
      if (profile.isEmpty()) break;
    }

    if (profile.isEmpty()) {
      profile.delete?.();
      return baseGeometry;
    }

    const solid = profile.extrude(Math.max(0.01, extrusionDepth), 0, 0, 1, true);
    profile.delete?.();

    const finalMesh = solid.getMesh();
    solid.delete?.();

    return meshToBufferGeometry(finalMesh);
  } catch (err) {
    profile.delete?.();
    throw err;
  }
}

export async function manifoldUnionAndExtrudeShapeInstances(
  instances: ShapeInstance2D[],
  extrusionDepth: number,
  curveSegments = 24,
  options?: {
    bevelEnabled?: boolean;
    bevelSize?: number;
    bevelThickness?: number;
    bevelSegments?: number;
  }
): Promise<THREE.BufferGeometry> {
  if (!instances.length) {
    throw new Error('manifoldUnionAndExtrudeShapeInstances requires at least one shape');
  }

  const wasm = await initManifold();
  const { CrossSection } = wasm;

  const groupedSections = new Map<string, { strokeWidth: number; sections: any[] }>();

  for (const instance of instances) {
    const polygons = shapeToPolygons(instance.shape, curveSegments, instance.transform);
    if (!polygons.length) continue;

    const strokeWidth = Math.max(0, instance.strokeWidth ?? 0);
    const key = strokeWidth.toFixed(4);
    let group = groupedSections.get(key);
    if (!group) {
      group = { strokeWidth, sections: [] };
      groupedSections.set(key, group);
    }
    group.sections.push(CrossSection.ofPolygons(polygons, 'Positive'));
  }

  if (!groupedSections.size) {
    throw new Error('2D manifold union produced no profile');
  }

  const strokeProfiles: any[] = [];
  for (const { strokeWidth, sections } of groupedSections.values()) {
    let profile: any = null;
    try {
      profile = sections.length === 1 ? sections[0] : CrossSection.union(sections);
      if (sections.length > 1) sections.forEach((section) => section.delete?.());

      if (strokeWidth > 0.1) {
        const circularSegments = Math.max(12, Math.floor(curveSegments / 2));
        const offsetProfile = profile.offset(strokeWidth / 2, 'Round', 2, circularSegments);
        profile.delete?.();
        profile = offsetProfile;
      }

      strokeProfiles.push(profile);
    } catch (err) {
      sections.forEach((section) => section.delete?.());
      profile?.delete?.();
      strokeProfiles.forEach((p) => p.delete?.());
      throw err;
    }
  }

  let unionProfile: any = null;
  try {
    if (strokeProfiles.length === 1) {
      unionProfile = strokeProfiles[0];
    } else {
      unionProfile = CrossSection.union(strokeProfiles);
      strokeProfiles.forEach((profile) => profile.delete?.());
    }
  } catch (err) {
    strokeProfiles.forEach((profile) => profile.delete?.());
    throw err;
  }

  try {
    let solid = unionProfile.extrude(Math.max(0.01, extrusionDepth), 0, 0, [1, 1], true);

    // Optional manifold-native edge profiling. This keeps topology closed while
    // restoring visible bevel when slot bases are built from 2D profile unions.
    const bevelEnabled = options?.bevelEnabled ?? false;
    const bevelSize = Math.max(0, options?.bevelSize ?? 0);
    if (bevelEnabled && bevelSize > 1e-5) {
      const bevelSegments = Math.max(1, options?.bevelSegments ?? 1);
      const minSharpAngle = bevelSegments === 1 ? 0 : 55;
      const smoothness = Math.min(0.92, Math.max(0.22, bevelSize / (bevelSize + 0.35)));
      const targetEdgeLength = Math.max(0.35, (bevelSize * 1.45) / bevelSegments);

      const smoothed = solid.smoothOut(minSharpAngle, smoothness);
      solid.delete?.();
      solid = smoothed.refineToLength(targetEdgeLength);
      smoothed.delete?.();
    }

    const finalMesh = solid.getMesh();
    solid.delete?.();
    return meshToBufferGeometry(finalMesh);
  } finally {
    unionProfile?.delete?.();
  }
}

function createManifoldFromMesh(ManifoldCtor: any, meshObj: any): any {
  if (typeof ManifoldCtor?.ofMesh === 'function') {
    return ManifoldCtor.ofMesh(meshObj);
  }
  return new ManifoldCtor(meshObj);
}

function manifoldUnionOp(a: any, b: any): any {
  if (typeof a?.add === 'function') return a.add(b);
  if (typeof a?.union === 'function') return a.union(b);
  throw new Error('Manifold union operation unavailable (expected add() or union())');
}

function shapeToPolygons(
  shape: THREE.Shape,
  curveSegments: number,
  transform?: THREE.Matrix3
): Array<Array<[number, number]>> {
  const extracted = shape.extractPoints(Math.max(24, curveSegments));
  const polygons: Array<Array<[number, number]>> = [];

  const outer = normalizeLoop(extracted.shape, false, transform);
  if (outer.length >= 3) {
    polygons.push(outer);
  }

  for (const hole of extracted.holes) {
    const normalizedHole = normalizeLoop(hole, true, transform);
    if (normalizedHole.length >= 3) {
      polygons.push(normalizedHole);
    }
  }

  return polygons;
}

function normalizeLoop(
  points: THREE.Vector2[],
  clockwise: boolean,
  transform?: THREE.Matrix3
): Array<[number, number]> {
  const loop = points.map((point) => transformPoint(point, transform));
  const deduped = dedupeLoop(loop);
  if (deduped.length < 3) return [];

  const isClockwise = THREE.ShapeUtils.isClockWise(
    deduped.map(([x, y]) => new THREE.Vector2(x, y))
  );
  if (isClockwise !== clockwise) {
    deduped.reverse();
  }
  return deduped;
}

function transformPoint(point: THREE.Vector2, transform?: THREE.Matrix3): [number, number] {
  if (!transform) return [point.x, point.y];
  const v = new THREE.Vector3(point.x, point.y, 1).applyMatrix3(transform);
  return [v.x, v.y];
}

function dedupeLoop(points: Array<[number, number]>): Array<[number, number]> {
  const deduped: Array<[number, number]> = [];
  for (const point of points) {
    const prev = deduped[deduped.length - 1];
    if (!prev || Math.hypot(prev[0] - point[0], prev[1] - point[1]) > 1e-5) {
      deduped.push(point);
    }
  }

  if (deduped.length > 1) {
    const first = deduped[0];
    const last = deduped[deduped.length - 1];
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) <= 1e-5) {
      deduped.pop();
    }
  }

  return deduped;
}

function polygonsToThreeShapes(polygons: Array<Array<[number, number]>>): THREE.Shape[] {
  type Loop = {
    idx: number;
    pts: THREE.Vector2[];
    parent: number;
    depth: number;
    areaAbs: number;
  };

  const loops: Loop[] = polygons
    .map((poly, idx) => {
      const deduped = dedupeLoop(poly);
      const pts = deduped.map(([x, y]) => new THREE.Vector2(x, y));
      if (pts.length < 3) return null;
      const area = Math.abs(signedArea(pts));
      if (area < 1e-8) return null;
      return { idx, pts, parent: -1, depth: 0, areaAbs: area } as Loop;
    })
    .filter((x): x is Loop => Boolean(x));

  for (let i = 0; i < loops.length; i++) {
    const probe = loops[i].pts[0];
    let bestParent = -1;
    let bestArea = Number.POSITIVE_INFINITY;
    for (let j = 0; j < loops.length; j++) {
      if (i === j) continue;
      if (!pointInPolygon(probe, loops[j].pts)) continue;
      if (loops[j].areaAbs < bestArea) {
        bestArea = loops[j].areaAbs;
        bestParent = j;
      }
    }
    loops[i].parent = bestParent;
  }

  for (let i = 0; i < loops.length; i++) {
    let d = 0;
    let p = loops[i].parent;
    while (p !== -1) {
      d++;
      p = loops[p].parent;
    }
    loops[i].depth = d;
  }

  const outerMap = new Map<number, THREE.Shape>();
  const shapes: THREE.Shape[] = [];

  for (const loop of loops) {
    if (loop.depth % 2 !== 0) continue;
    const outerPts = ensureWinding(loop.pts, false);
    const shape = new THREE.Shape(outerPts);
    outerMap.set(loop.idx, shape);
    shapes.push(shape);
  }

  for (const loop of loops) {
    if (loop.depth % 2 === 0) continue;
    let anchor = loop.parent;
    while (anchor !== -1 && loops[anchor].depth % 2 !== 0) {
      anchor = loops[anchor].parent;
    }
    const owner = anchor !== -1 ? outerMap.get(anchor) : undefined;
    if (!owner) continue;
    owner.holes.push(new THREE.Path(ensureWinding(loop.pts, true)));
  }

  return shapes;
}

function ensureWinding(points: THREE.Vector2[], clockwise: boolean): THREE.Vector2[] {
  const out = points.slice();
  const isClockwise = THREE.ShapeUtils.isClockWise(out);
  if (isClockwise !== clockwise) out.reverse();
  return out;
}

function signedArea(points: THREE.Vector2[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += (a.x * b.y) - (b.x * a.y);
  }
  return sum * 0.5;
}

function pointInPolygon(point: THREE.Vector2, polygon: THREE.Vector2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect = ((yi > point.y) !== (yj > point.y))
      && (point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function meshToBufferGeometry(finalMesh: any): THREE.BufferGeometry {
  const positions = new Float32Array(finalMesh.vertProperties);
  const indices = new Uint32Array(finalMesh.triVerts);
  finalMesh.delete?.();

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  out.setIndex(new THREE.BufferAttribute(indices, 1));
  out.computeVertexNormals();
  out.computeBoundingBox();
  return out;
}

/**
 * Minimal prep: single mergeVertices pass + strip degenerate triangles.
 * Keep it simple — Mesh.merge() handles the manifold repair.
 */
function prepare(
  geo: THREE.BufferGeometry,
  options?: { weld?: boolean; tolerance?: number }
): THREE.BufferGeometry {
  const weld = options?.weld ?? true;
  const tolerance = options?.tolerance ?? 1e-5;
  const merged = weld
    ? (BufferGeometryUtils.mergeVertices(geo.clone(), tolerance) as THREE.BufferGeometry)
    : geo.clone();
  const pos = merged.attributes.position.array as Float32Array;
  const src = merged.index
    ? Array.from(merged.index.array as Uint32Array)
    : Array.from({ length: pos.length / 3 }, (_, i) => i);

  const v = (i: number) => new THREE.Vector3(pos[i*3], pos[i*3+1], pos[i*3+2]);
  const valid: number[] = [];
  for (let i = 0; i < src.length; i += 3) {
    const a = src[i], b = src[i+1], c = src[i+2];
    if (a === b || b === c || a === c) continue;
    if (new THREE.Vector3().crossVectors(v(b).sub(v(a)), v(c).sub(v(a))).lengthSq() < 1e-10) continue;
    valid.push(a, b, c);
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', merged.attributes.position.clone());
  out.setIndex(new THREE.BufferAttribute(new Uint32Array(valid), 1));
  merged.dispose();
  return out;
}

function ensureIndexed(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const clone = geo.clone();
  if (!clone.index) {
    const count = clone.attributes.position.count;
    const index = new Uint32Array(count);
    for (let i = 0; i < count; i++) index[i] = i;
    clone.setIndex(new THREE.BufferAttribute(index, 1));
  }
  return clone;
}
