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
  slotGeometries: THREE.BufferGeometry[]
): Promise<THREE.BufferGeometry> {

  const wasm = await initManifold();
  const { Manifold, Mesh } = wasm;

  const cleanBase = prepare(baseGeometry);
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
  const mergeResult = baseMeshObj.merge();
  console.log(`  Mesh.merge() result: ${mergeResult} (true = mesh was modified)`);

  let result: any;
  try {
    result = new Manifold(baseMeshObj);
    console.log('✅ Base Manifold created');
  } catch (err: any) {
    baseMeshObj.delete();
    cleanBase.dispose();
    console.error('Base Manifold failed after merge:', err.message ?? err);
    throw err;
  }
  baseMeshObj.delete();
  cleanBase.dispose();

  for (let i = 0; i < slotGeometries.length; i++) {
    const cleanSlot = prepare(slotGeometries[i]);
    const slotPos = cleanSlot.attributes.position.array as Float32Array;
    const slotIdx = cleanSlot.index!.array as Uint32Array;

    const slotMeshObj = new Mesh({
      numProp: 3,
      vertProperties: slotPos,
      triVerts: slotIdx,
    });
    slotMeshObj.merge();

    try {
      const slotManifold = new Manifold(slotMeshObj);
      console.log(`  Subtracting slot ${i + 1}/${slotGeometries.length}...`);
      result = result.subtract(slotManifold);
      slotManifold.delete();
    } catch (err: any) {
      console.warn(`  Slot ${i + 1} failed: ${err.message ?? err}`);
    }
    slotMeshObj.delete();
    cleanSlot.dispose();
  }

  const finalMesh = result.getMesh();
  result.delete();

  const positions = new Float32Array(finalMesh.vertProperties);
  const indices   = new Uint32Array(finalMesh.triVerts);
  finalMesh.delete?.();

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  out.setIndex(new THREE.BufferAttribute(indices, 1));
  out.computeVertexNormals();
  out.computeBoundingBox();

  console.log(`✅ Manifold CSG: ${positions.length / 3} verts, ${indices.length / 3} faces (watertight)`);
  return out;
}

/**
 * Minimal prep: single mergeVertices pass + strip degenerate triangles.
 * Keep it simple — Mesh.merge() handles the manifold repair.
 */
function prepare(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const merged = BufferGeometryUtils.mergeVertices(geo.clone(), 0.001);
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
