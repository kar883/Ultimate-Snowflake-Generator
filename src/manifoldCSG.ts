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
// @ts-ignore
import manifoldWasmUrl from 'manifold-3d/manifold.wasm?url';
import * as THREE from 'three';
// @ts-ignore
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils';

let wasmInstance: any = null;
const MANIFOLD_DEBUG = false;

type ManifoldModuleOptions = {
  locateFile?: () => string;
  wasmBinary?: ArrayBuffer;
};

const initializeManifoldModule = Module as unknown as (
  options?: ManifoldModuleOptions
) => ReturnType<typeof Module>;

export interface SlotProfile2D {
  length: number;
  width: number;
  xOffset?: number;
  yOffset?: number;
  rotationDeg?: number;
  chamferStart?: number;
  chamferEnd?: number;
  singleChamferEnd?: boolean;
}

export interface ShapeInstance2D {
  shape: THREE.Shape;
  transform?: THREE.Matrix3;
  strokeWidth?: number;
}

export const createSlotProfileOutline = (profile: SlotProfile2D): Array<[number, number]> => {
  const length = Math.max(0.01, profile.length);
  const width = Math.max(0.01, profile.width);
  const xStart = profile.xOffset ?? 0;
  const xEnd = xStart + length;
  const yCenter = profile.yOffset ?? 0;
  const yTop = yCenter + width / 2;
  const yBottom = yCenter - width / 2;
  const startChamfer = Math.min(width / 2, Math.max(0, profile.chamferStart ?? 0), length / 2);
  const endChamfer = Math.min(width / 2, Math.max(0, profile.chamferEnd ?? 0), length / 2);
  if (profile.singleChamferEnd) {
    const points: Array<[number, number]> = [
      [xStart + startChamfer, yTop],
      [xEnd, yTop],
      [xEnd - endChamfer, yBottom],
      [xStart + startChamfer, yBottom],
    ];
    if (startChamfer > 0) {
      points.push([xStart, yBottom + startChamfer], [xStart, yTop - startChamfer]);
    }
    return points;
  }
  return [
    [xStart + startChamfer, yTop],
    [xEnd - endChamfer, yTop],
    [xEnd, yTop - endChamfer],
    [xEnd, yBottom + endChamfer],
    [xEnd - endChamfer, yBottom],
    [xStart + startChamfer, yBottom],
    [xStart, yBottom + startChamfer],
    [xStart, yTop - startChamfer],
  ];
};

const createSlotCrossSection = (CrossSection: any, profile: SlotProfile2D): any => {
  return CrossSection.ofPolygons([createSlotProfileOutline(profile)], 'Positive')
    .rotate(profile.rotationDeg ?? 0);
};

export async function initManifold() {
  if (!wasmInstance) {
    if (MANIFOLD_DEBUG) console.log('🔧 Initializing Manifold WASM...');
    const wasmUrl = new URL(manifoldWasmUrl, document.baseURI).href;
    const wasmResponse = await fetch(wasmUrl);
    if (!wasmResponse.ok) {
      throw new Error(`Failed to load manifold.wasm (${wasmResponse.status}) from ${wasmUrl}`);
    }

    // Emscripten can't load file:// wasm on the main thread (packaged Electron), so hand it the bytes.
    wasmInstance = await initializeManifoldModule({
      wasmBinary: await wasmResponse.arrayBuffer(),
    });
    wasmInstance.setup();
    if (MANIFOLD_DEBUG) console.log('✅ Manifold ready');
  }
  return wasmInstance;
}

export async function manifoldSubtract(
  baseGeometry: THREE.BufferGeometry,
  slotGeometries: THREE.BufferGeometry[],
  options?: {
    baseIsManifold?: boolean;
    baseWeldTolerance?: number;
    /** Throw on any operand/subtract failure instead of skipping the slot. */
    strict?: boolean;
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
    : prepare(baseGeometry, { weld: true, tolerance: options?.baseWeldTolerance ?? 1e-5 });
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
  if (MANIFOLD_DEBUG) console.log(`  Mesh.merge() result: ${mergeResult} (true = mesh was modified)`);

  let result: any;
  try {
    result = createManifoldFromMesh(Manifold, baseMeshObj);
    if (MANIFOLD_DEBUG) console.log('✅ Base Manifold created');
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
      if (MANIFOLD_DEBUG) console.log(`  Subtracting slot ${i + 1}/${slotGeometries.length}...`);
      result = result.subtract(slotManifold);
      slotManifold.delete?.();
    } catch (err: any) {
      if (options?.strict) {
        slotMeshObj.delete?.();
        cleanSlot.dispose();
        result.delete?.();
        throw new Error(`Slot ${i + 1}/${slotGeometries.length} failed in strict manifold mode: ${err.message ?? err}`);
      }
      if (MANIFOLD_DEBUG) console.warn(`  Slot ${i + 1} failed: ${err.message ?? err}`);
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
    if (MANIFOLD_DEBUG) {
      console.debug(
        `[slot-csg] Skipping post-cut fillet: base has ${baseVertexCount} verts (limit ${maxFilletBaseVertices})`
      );
    }
  }

  const finalMesh = result.getMesh();
  result.delete?.();

  const out = meshToBufferGeometry(finalMesh);
  const posCount = out.attributes.position?.count ?? 0;
  const faceCount = out.index ? out.index.count / 3 : 0;

  if (MANIFOLD_DEBUG) console.log(`✅ Manifold CSG: ${posCount} verts, ${faceCount} faces (watertight)`);
  return out;
}

/** Welds on position only and reports edge-pairing defects, for error messages. */
function describeOperand(geo: THREE.BufferGeometry): string {
  const clean = prepare(geo, { weld: true, tolerance: 1e-5 });
  const idx = clean.index!.array as Uint32Array;
  const directed = new Map<string, number>();
  for (let i = 0; i < idx.length; i += 3) {
    for (let e = 0; e < 3; e++) {
      const key = `${idx[i + e]}_${idx[i + ((e + 1) % 3)]}`;
      directed.set(key, (directed.get(key) ?? 0) + 1);
    }
  }
  let open = 0;
  let nonManifold = 0;
  for (const [key, count] of directed) {
    const [a, b] = key.split('_');
    const rev = directed.get(`${b}_${a}`) ?? 0;
    if (count > 1 || rev > 1) nonManifold++;
    else if (rev === 0) open++;
  }
  const out = `verts=${clean.attributes.position.count}, tris=${idx.length / 3}, openEdges=${open}, nonManifoldEdges=${nonManifold}`;
  clean.dispose();
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

  try {
    for (let i = 0; i < geometries.length; i++) {
      let operand: ReturnType<typeof makeOperandManifold>;
      try {
        operand = makeOperandManifold(geometries[i]);
      } catch (err: any) {
        const diag = describeOperand(geometries[i]);
        throw new Error(
          `manifoldUnionGeometries operand ${i}/${geometries.length} is not a valid solid (${diag}): ${err?.message ?? err}`
        );
      }
      const { piece, clean, meshObj } = operand;

      try {
        if (!unionResult) {
          unionResult = piece;
        } else {
          try {
            const next = manifoldUnionOp(unionResult, piece);
            unionResult.delete?.();
            unionResult = next;
          } finally {
            piece.delete?.();
          }
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

    const out = meshToBufferGeometry(finalMesh);
    const posCount = out.attributes.position?.count ?? 0;
    const faceCount = out.index ? out.index.count / 3 : 0;
    if (MANIFOLD_DEBUG) console.log(`✅ Manifold union: ${posCount} verts, ${faceCount} faces (watertight)`);
    return out;
  } finally {
    unionResult?.delete?.();
  }
}

export async function manifoldRemoveTinyComponents(
  geometry: THREE.BufferGeometry,
  options?: { minimumVolume?: number; relativeVolume?: number }
): Promise<THREE.BufferGeometry> {
  const wasm = await initManifold();
  const { Manifold, Mesh } = wasm;
  const clean = prepare(geometry, { weld: true, tolerance: 1e-5 });
  const mesh = new Mesh({
    numProp: 3,
    vertProperties: clean.attributes.position.array as Float32Array,
    triVerts: clean.index!.array as Uint32Array,
  });
  let solid: any = null;
  let components: any[] = [];
  let composed: any = null;

  try {
    mesh.merge();
    solid = createManifoldFromMesh(Manifold, mesh);
    components = solid.decompose();
    if (components.length <= 1) return geometry;

    const volumes = components.map((component) => component.volume());
    const largestIndex = volumes.reduce(
      (largest, volume, index) => volume > volumes[largest] ? index : largest,
      0
    );
    const threshold = Math.max(
      options?.minimumVolume ?? 0.1,
      volumes[largestIndex] * (options?.relativeVolume ?? 1e-4)
    );
    const retained = components.filter((component, index) =>
      index === largestIndex || volumes[index] >= threshold
    );
    if (retained.length === components.length) return geometry;

    composed = Manifold.compose(retained);
    const cleanedGeometry = meshToBufferGeometry(composed.getMesh());
    composed.delete?.();
    composed = null;
    console.info(
      `[slot-csg] Removed ${components.length - retained.length} tiny disconnected component(s) ` +
      `(largest=${volumes[largestIndex].toFixed(3)} mm³, threshold=${threshold.toFixed(3)} mm³)`
    );
    return cleanedGeometry;
  } finally {
    composed?.delete?.();
    components.forEach((component) => component.delete?.());
    solid?.delete?.();
    mesh.delete?.();
    clean.dispose();
  }
}

export async function manifoldProfileCutAndExtrude(
  baseGeometry: THREE.BufferGeometry,
  profiles: SlotProfile2D[],
  extrusionDepth: number
): Promise<THREE.BufferGeometry> {
  const wasm = await initManifold();
  const { Manifold, Mesh, CrossSection } = wasm;

  const makeProfileBaseSolid = () => {
    const weldTolerances = [1e-5, 5e-5, 1e-4, 2e-4];
    let lastError: unknown = null;

    for (const tolerance of weldTolerances) {
      const cleanBase = prepare(baseGeometry, { weld: true, tolerance });
      const basePos = cleanBase.attributes.position.array as Float32Array;
      const baseIdx = cleanBase.index!.array as Uint32Array;

      const baseMeshObj = new Mesh({
        numProp: 3,
        vertProperties: basePos,
        triVerts: baseIdx,
      });
      baseMeshObj.merge();

      try {
        const baseSolid = createManifoldFromMesh(Manifold, baseMeshObj);
        baseMeshObj.delete?.();
        cleanBase.dispose();
        return baseSolid;
      } catch (err) {
        lastError = err;
        baseMeshObj.delete?.();
        cleanBase.dispose();
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('Failed to create manifold operand for baked profile cut');
  };

  const baseSolid = makeProfileBaseSolid();

  let profile = baseSolid.project();
  baseSolid.delete?.();

  if (!profile || profile.isEmpty()) {
    profile?.delete?.();
    return baseGeometry;
  }

  try {
    for (const p of profiles) {
      const slot = createSlotCrossSection(CrossSection, p);
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
    /** Slot rectangles to subtract in 2D profile space before extrusion (baked-in approach). */
    slotProfiles?: SlotProfile2D[];
    /** Morphological close radius (mm) removing hairline seams, followed by simplify(). 0/undefined disables. */
    closeEpsilon?: number;
    simplifyEpsilon?: number;
    /** Lower bound (mm) for the bevel refinement edge length; larger values give fewer triangles. */
    minRefineEdgeLength?: number;
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

  const closeEps = options?.closeEpsilon ?? 0;
  if (closeEps > 0) {
    const grown = unionProfile.offset(closeEps, 'Round', 2, 16);
    unionProfile.delete?.();
    const shrunk = grown.offset(-closeEps, 'Round', 2, 16);
    grown.delete?.();
    unionProfile = shrunk;
  }
  if ((options?.simplifyEpsilon ?? 0) > 0) {
    const simplified = unionProfile.simplify(options!.simplifyEpsilon);
    unionProfile.delete?.();
    unionProfile = simplified;
  }

  // Subtract slot profiles in 2D CrossSection space before extrusion.
  // This is the correct baked-in approach: the flat 2D profile is the right place
  // to cut slots — NOT by projecting an already-extruded 3D mesh back to 2D.
  for (const p of (options?.slotProfiles ?? [])) {
    if (unionProfile.isEmpty()) break;
    const slot = createSlotCrossSection(CrossSection, p);
    const next = unionProfile.subtract(slot);
    slot.delete?.();
    unionProfile.delete?.();
    unionProfile = next;
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
      const targetEdgeLength = Math.max(options?.minRefineEdgeLength ?? 0.35, (bevelSize * 1.45) / bevelSegments);

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

export interface FilletPrismResult {
  geometry: THREE.BufferGeometry;
  appliedBevel: number;
  // Why the requested bevel was reduced; null when it was applied in full.
  limitedBy: 'depth' | 'wall' | null;
}

/**
 * Extrudes a shape (z from 0 to height) with a true fillet/chamfer on the top and
 * bottom edges. The side wall stays on the original outline; each edge is built from
 * thin slabs whose cross-section is the exact inward offset of the outline at that
 * height, so there are no miter spikes and no folded caps at sharp corners.
 * The bevel is limited by half the height and by the point where the flat top would
 * break into more pieces than the outline (the wall is rounded all the way through).
 */
export async function manifoldFilletPrism(
  shape: THREE.Shape,
  height: number,
  bevel: number,
  segments: number,
  chamfer: boolean,
  curveSegments: number
): Promise<FilletPrismResult> {
  const wasm = await initManifold();
  const { CrossSection } = wasm;
  const polygons = shapeToPolygons(shape, curveSegments);
  const base = CrossSection.ofPolygons(polygons, 'Positive');
  const owned: any[] = [base];
  try {
    const depthCap = Math.max(0, height / 2 - 1e-3);
    const requested = Math.max(0, Math.min(bevel, depthCap));
    const baseParts = Math.max(1, base.decompose().length);

    const keepsTop = (d: number) => {
      const inset = base.offset(-d, 'Round', 2, 16);
      const parts = inset.isEmpty() ? 0 : inset.decompose().length;
      inset.delete?.();
      return parts > 0 && parts <= baseParts;
    };

    let applied = requested;
    if (applied > 1e-4 && !keepsTop(applied)) {
      let lo = 0;
      let hi = applied;
      for (let i = 0; i < 18; i++) {
        const mid = (lo + hi) / 2;
        if (keepsTop(mid)) lo = mid; else hi = mid;
      }
      applied = lo * 0.98;
    }

    const contours: Array<Array<[number, number]>> = polygons;
    // Exact (mitered) inward offset vectors; valid until the first edge collapses.
    const vectors = contours.map((c) => c.map((p, i) => {
      const a = c[(i - 1 + c.length) % c.length];
      const b = c[(i + 1) % c.length];
      const e1x = p[0] - a[0], e1y = p[1] - a[1];
      const e2x = b[0] - p[0], e2y = b[1] - p[1];
      const l1 = Math.hypot(e1x, e1y) || 1, l2 = Math.hypot(e2x, e2y) || 1;
      const n1x = -e1y / l1, n1y = e1x / l1, n2x = -e2y / l2, n2y = e2x / l2;
      const denom = Math.max(0.05, 1 + n1x * n2x + n1y * n2y);
      return [(n1x + n2x) / denom, (n1y + n2y) / denom] as [number, number];
    }));

    // First time any edge shrinks to zero length under the mitered offset.
    let collapse = Infinity;
    contours.forEach((c, ci) => {
      for (let i = 0; i < c.length; i++) {
        const j = (i + 1) % c.length;
        const ex = c[j][0] - c[i][0], ey = c[j][1] - c[i][1];
        const len = Math.hypot(ex, ey) || 1;
        const rate = ((vectors[ci][i][0] - vectors[ci][j][0]) * ex + (vectors[ci][i][1] - vectors[ci][j][1]) * ey) / len;
        if (rate > 1e-9) collapse = Math.min(collapse, len / rate);
      }
    });
    if (applied > collapse * 0.97) applied = Math.max(0, collapse * 0.97);

    const limitedByFinal: FilletPrismResult['limitedBy'] =
      applied < bevel - 1e-6 ? (applied < depthCap - 1e-6 ? 'wall' : 'depth') : null;

    const b = applied;
    const steps = chamfer ? 1 : Math.max(12, Math.min(segments, 12) * 3);
    const rings: Array<[number, number]> = [];
    if (b <= 1e-4) {
      rings.push([0, 0], [0, height]);
    } else {
      for (let s = 0; s <= steps; s++) {
        const th = (s / steps) * (Math.PI / 2);
        rings.push(chamfer ? [b * (1 - s / steps), b * (s / steps)] : [b * (1 - Math.sin(th)), b * (1 - Math.cos(th))]);
      }
      for (let s = 0; s <= steps; s++) {
        const th = (s / steps) * (Math.PI / 2);
        rings.push(chamfer ? [b * (s / steps), height - b + b * (s / steps)] : [b * (1 - Math.cos(th)), height - b + b * Math.sin(th)]);
      }
    }

    const positions: number[] = [];
    const indices: number[] = [];
    const ringStart: number[][] = contours.map(() => []);
    contours.forEach((c, ci) => {
      rings.forEach(([inset, z]) => {
        ringStart[ci].push(positions.length / 3);
        c.forEach((p, i) => positions.push(p[0] + vectors[ci][i][0] * inset, p[1] + vectors[ci][i][1] * inset, z));
      });
      for (let r = 0; r < rings.length - 1; r++) {
        for (let k = 0; k < c.length; k++) {
          const k2 = (k + 1) % c.length;
          const a = ringStart[ci][r] + k, a2 = ringStart[ci][r] + k2;
          const u = ringStart[ci][r + 1] + k, u2 = ringStart[ci][r + 1] + k2;
          indices.push(a, a2, u, a2, u2, u);
        }
      }
    });

    // Caps reuse the original outline's triangulation; vertices keep their indices.
    const faces = THREE.ShapeUtils.triangulateShape(
      contours[0].map((p) => new THREE.Vector2(p[0], p[1])),
      contours.slice(1).map((h) => h.map((p) => new THREE.Vector2(p[0], p[1])))
    );
    const offsets: number[] = [];
    let acc = 0;
    contours.forEach((c) => { offsets.push(acc); acc += c.length; });
    const capIndex = (flatIdx: number, ringIdx: number) => {
      let ci = offsets.length - 1;
      while (offsets[ci] > flatIdx) ci--;
      return ringStart[ci][ringIdx] + (flatIdx - offsets[ci]);
    };
    faces.forEach((f) => {
      indices.push(capIndex(f[0], rings.length - 1), capIndex(f[1], rings.length - 1), capIndex(f[2], rings.length - 1));
      indices.push(capIndex(f[2], 0), capIndex(f[1], 0), capIndex(f[0], 0));
    });

    const indexed = new THREE.BufferGeometry();
    indexed.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    indexed.setIndex(indices);
    // Smooth shading along the rounded edge, crisp at the star's real corners.
    const shaded = BufferGeometryUtils.toCreasedNormals(indexed, (50 * Math.PI) / 180);
    indexed.dispose();
    // Match ExtrudeGeometry's attribute set so it can be merged with text/abstract geometry.
    shaded.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((shaded.attributes.position.count) * 2), 2));
    return { geometry: shaded, appliedBevel: applied, limitedBy: limitedByFinal };
  } finally {
    owned.forEach((o) => o.delete?.());
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

export function shapeToPolygons(
  shape: THREE.Shape,
  curveSegments: number,
  transform?: THREE.Matrix3
): Array<Array<[number, number]>> {
  const extracted = shape.extractPoints(Math.max(8, curveSegments));
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

export function normalizeManifoldGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const result = prepare(geometry, { weld: true, tolerance: 1e-5 });
  result.computeVertexNormals();
  result.computeBoundingBox();
  return result;
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
  // mergeVertices only welds vertices whose attributes all match; per-face normals/UVs
  // (BoxGeometry, ExtrudeGeometry) would keep every face open. Weld on position only.
  const positionOnly = geo.clone();
  Object.keys(positionOnly.attributes).forEach((name) => {
    if (name !== 'position') positionOnly.deleteAttribute(name);
  });
  positionOnly.clearGroups();
  const merged = weld
    ? (BufferGeometryUtils.mergeVertices(positionOnly, tolerance) as THREE.BufferGeometry)
    : positionOnly;
  if (merged !== positionOnly) positionOnly.dispose();
  const pos = merged.attributes.position.array as Float32Array;
  const src = merged.index
    ? Array.from(merged.index.array as Uint32Array)
    : Array.from({ length: pos.length / 3 }, (_, i) => i);

  const v = (i: number) => new THREE.Vector3(pos[i*3], pos[i*3+1], pos[i*3+2]);
  const vertexCount = pos.length / 3;
  const valid: number[] = [];
  for (let i = 0; i < src.length; i += 3) {
    const a = src[i], b = src[i+1], c = src[i+2];
    if (
      !Number.isInteger(a) || !Number.isInteger(b) || !Number.isInteger(c) ||
      a < 0 || b < 0 || c < 0 ||
      a >= vertexCount || b >= vertexCount || c >= vertexCount
    ) continue;
    if (a === b || b === c || a === c) continue;
    if (new THREE.Vector3().crossVectors(v(b).sub(v(a)), v(c).sub(v(a))).lengthSq() < 1e-24) continue;
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
    return clone;
  }

  const vertexCount = clone.attributes.position.count;
  const source = Array.from(clone.index.array as Uint32Array);
  const valid: number[] = [];
  for (let i = 0; i + 2 < source.length; i += 3) {
    const a = source[i], b = source[i + 1], c = source[i + 2];
    if (
      Number.isInteger(a) && Number.isInteger(b) && Number.isInteger(c) &&
      a >= 0 && b >= 0 && c >= 0 &&
      a < vertexCount && b < vertexCount && c < vertexCount &&
      a !== b && b !== c && a !== c
    ) {
      valid.push(a, b, c);
    }
  }
  clone.setIndex(new THREE.BufferAttribute(new Uint32Array(valid), 1));
  return clone;
}
