import * as THREE from 'three';

interface EdgeInfo {
  count: number;
  faces: number[];
}

function buildEdgeTopology(geometry: THREE.BufferGeometry): Map<string, EdgeInfo> {
  const indices = geometry.index;
  if (!indices) return new Map();
  
  const edgeMap = new Map<string, EdgeInfo>();
  
  for (let i = 0; i < indices.count; i += 3) {
    const faceIdx = Math.floor(i / 3);
    const i0 = indices.getX(i);
    const i1 = indices.getX(i + 1);
    const i2 = indices.getX(i + 2);
    
    const edges: [number, number][] = [
      [i0, i1],
      [i1, i2],
      [i2, i0]
    ];
    
    for (const [v1, v2] of edges) {
      const key = v1 < v2 ? `${v1}_${v2}` : `${v2}_${v1}`;
      
      if (!edgeMap.has(key)) {
        edgeMap.set(key, { count: 0, faces: [] });
      }
      
      const info = edgeMap.get(key)!;
      info.count++;
      info.faces.push(faceIdx);
    }
  }
  
  return edgeMap;
}

function removeDegenerateTriangles(
  geometry: THREE.BufferGeometry, 
  minArea: number = 0.00001
): THREE.BufferGeometry {
  const positions = geometry.attributes.position;
  const indices = geometry.index;
  
  if (!indices) return geometry;
  
  const newIndices: number[] = [];
  const v0 = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  
  for (let i = 0; i < indices.count; i += 3) {
    const i0 = indices.getX(i);
    const i1 = indices.getX(i + 1);
    const i2 = indices.getX(i + 2);
    
    if (i0 === i1 || i1 === i2 || i2 === i0) continue;
    
    v0.fromBufferAttribute(positions as THREE.BufferAttribute, i0);
    v1.fromBufferAttribute(positions as THREE.BufferAttribute, i1);
    v2.fromBufferAttribute(positions as THREE.BufferAttribute, i2);
    
    const edge1 = new THREE.Vector3().subVectors(v1, v0);
    const edge2 = new THREE.Vector3().subVectors(v2, v0);
    const cross = new THREE.Vector3().crossVectors(edge1, edge2);
    const area = cross.length() * 0.5;
    
    if (area >= minArea) {
      newIndices.push(i0, i1, i2);
    }
  }
  
  const result = geometry.clone();
  result.setIndex(newIndices);
  return result;
}

function fixNonManifoldEdges(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const edgeMap = buildEdgeTopology(geometry);
  const indices = geometry.index;
  
  if (!indices) return geometry;
  
  const facesToRemove = new Set<number>();
  
  edgeMap.forEach((info) => {
    if (info.count > 2) {
      for (let i = 2; i < info.faces.length; i++) {
        facesToRemove.add(info.faces[i]);
      }
    }
  });
  
  if (facesToRemove.size === 0) return geometry;
  
  const newIndices: number[] = [];
  
  for (let i = 0; i < indices.count; i += 3) {
    const faceIdx = Math.floor(i / 3);
    
    if (!facesToRemove.has(faceIdx)) {
      newIndices.push(
        indices.getX(i),
        indices.getX(i + 1),
        indices.getX(i + 2)
      );
    }
  }
  
  const result = geometry.clone();
  result.setIndex(newIndices);
  return result;
}

function collectBoundaryEdges(edgeMap: Map<string, EdgeInfo>): Array<[number, number]> {
  const boundaryEdges: Array<[number, number]> = [];
  edgeMap.forEach((info, key) => {
    if (info.count !== 1) return;
    const [aRaw, bRaw] = key.split('_');
    const a = Number(aRaw);
    const b = Number(bRaw);
    if (Number.isFinite(a) && Number.isFinite(b) && a !== b) {
      boundaryEdges.push([a, b]);
    }
  });
  return boundaryEdges;
}

function buildBoundaryLoops(boundaryEdges: Array<[number, number]>): number[][] {
  const adjacency = new Map<number, number[]>();
  const edgeKey = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);

  for (const [a, b] of boundaryEdges) {
    if (!adjacency.has(a)) adjacency.set(a, []);
    if (!adjacency.has(b)) adjacency.set(b, []);
    adjacency.get(a)!.push(b);
    adjacency.get(b)!.push(a);
  }

  const visited = new Set<string>();
  const loops: number[][] = [];

  for (const [startA, startB] of boundaryEdges) {
    const startKey = edgeKey(startA, startB);
    if (visited.has(startKey)) continue;

    const loop: number[] = [startA, startB];
    visited.add(startKey);

    let prev = startA;
    let current = startB;
    let guard = 0;
    const maxSteps = Math.max(32, boundaryEdges.length * 2);

    while (guard++ < maxSteps) {
      const neighbors = adjacency.get(current) ?? [];
      let next = -1;

      for (const candidate of neighbors) {
        if (candidate === prev) continue;
        const k = edgeKey(current, candidate);
        if (!visited.has(k)) {
          next = candidate;
          break;
        }
      }

      if (next < 0) break;

      visited.add(edgeKey(current, next));

      if (next === loop[0]) {
        if (loop.length >= 3) loops.push(loop.slice());
        break;
      }

      loop.push(next);
      prev = current;
      current = next;
    }
  }

  return loops;
}

function triangulateBoundaryLoop(
  loop: number[],
  positions: THREE.BufferAttribute
): number[] {
  if (loop.length < 3) return [];

  const loopNormal = new THREE.Vector3();
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    const ax = positions.getX(a);
    const ay = positions.getY(a);
    const az = positions.getZ(a);
    const bx = positions.getX(b);
    const by = positions.getY(b);
    const bz = positions.getZ(b);
    loopNormal.x += (ay - by) * (az + bz);
    loopNormal.y += (az - bz) * (ax + bx);
    loopNormal.z += (ax - bx) * (ay + by);
  }

  if (loopNormal.lengthSq() < 1e-20) return [];
  loopNormal.normalize();

  const absX = Math.abs(loopNormal.x);
  const absY = Math.abs(loopNormal.y);
  const absZ = Math.abs(loopNormal.z);

  const points2D: THREE.Vector2[] = loop.map((idx) => {
    const x = positions.getX(idx);
    const y = positions.getY(idx);
    const z = positions.getZ(idx);
    if (absX >= absY && absX >= absZ) return new THREE.Vector2(y, z);
    if (absY >= absX && absY >= absZ) return new THREE.Vector2(x, z);
    return new THREE.Vector2(x, y);
  });

  const tris = THREE.ShapeUtils.triangulateShape(points2D, []);
  if (!tris.length) return [];

  const triIndices: number[] = [];
  for (const [a2, b2, c2] of tris) {
    triIndices.push(loop[a2], loop[b2], loop[c2]);
  }

  const a = triIndices[0];
  const b = triIndices[1];
  const c = triIndices[2];
  const va = new THREE.Vector3().fromBufferAttribute(positions, a);
  const vb = new THREE.Vector3().fromBufferAttribute(positions, b);
  const vc = new THREE.Vector3().fromBufferAttribute(positions, c);
  const triNormal = new THREE.Vector3().subVectors(vb, va).cross(new THREE.Vector3().subVectors(vc, va));

  if (triNormal.dot(loopNormal) < 0) {
    for (let i = 0; i < triIndices.length; i += 3) {
      const tmp = triIndices[i + 1];
      triIndices[i + 1] = triIndices[i + 2];
      triIndices[i + 2] = tmp;
    }
  }

  return triIndices;
}

function fillBoundaryHoles(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const positions = geometry.attributes.position as THREE.BufferAttribute | undefined;
  const indices = geometry.index;
  if (!positions || !indices) return geometry;

  const edgeMap = buildEdgeTopology(geometry);
  const boundaryEdges = collectBoundaryEdges(edgeMap);
  if (!boundaryEdges.length) return geometry;

  const loops = buildBoundaryLoops(boundaryEdges);
  if (!loops.length) return geometry;

  const newIndices: number[] = [];
  for (let i = 0; i < indices.count; i++) {
    newIndices.push(indices.getX(i));
  }

  let filledLoops = 0;
  let filledTriangles = 0;
  for (const loop of loops) {
    const triIndices = triangulateBoundaryLoop(loop, positions);
    if (!triIndices.length) continue;
    newIndices.push(...triIndices);
    filledLoops++;
    filledTriangles += triIndices.length / 3;
  }

  if (filledLoops === 0) return geometry;

  const result = geometry.clone();
  result.setIndex(newIndices);
  console.log(`  Hole fill: closed ${filledLoops} boundary loops with ${filledTriangles} triangles`);
  return result;
}

function peelBoundaryFacesOnce(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const indices = geometry.index;
  if (!indices) return geometry;

  const edgeMap = buildEdgeTopology(geometry);
  const boundaryFaceSet = new Set<number>();

  edgeMap.forEach((info) => {
    if (info.count === 1 && info.faces.length > 0) {
      boundaryFaceSet.add(info.faces[0]);
    }
  });

  if (boundaryFaceSet.size === 0) return geometry;

  const newIndices: number[] = [];
  for (let i = 0; i < indices.count; i += 3) {
    const faceIdx = Math.floor(i / 3);
    if (!boundaryFaceSet.has(faceIdx)) {
      newIndices.push(indices.getX(i), indices.getX(i + 1), indices.getX(i + 2));
    }
  }

  if (newIndices.length === indices.count) return geometry;

  const result = geometry.clone();
  result.setIndex(newIndices);
  return result;
}

function peelBoundaryFaces(
  geometry: THREE.BufferGeometry,
  maxIterations: number = 6
): THREE.BufferGeometry {
  let current = geometry;

  for (let iter = 0; iter < maxIterations; iter++) {
    const before = getTopologyReport(current);
    if (before.boundaryEdges === 0) break;

    const peeled = peelBoundaryFacesOnce(current);
    if (peeled === current) break;

    const cleaned = removeUnusedVertices(peeled);
    if (cleaned !== peeled) peeled.dispose();

    const after = getTopologyReport(cleaned);
    const improved = after.boundaryEdges < before.boundaryEdges;

    if (!improved) {
      cleaned.dispose();
      break;
    }

    if (current !== geometry) current.dispose();
    current = cleaned;

    if (after.isManifold) break;
  }

  return current;
}

function topologyDefectScore(report: ReturnType<typeof getTopologyReport>): number {
  return report.boundaryEdges + (report.nonManifoldEdges * 10);
}

function applyRepairStageIfImproves(
  label: string,
  current: THREE.BufferGeometry,
  stage: (geometry: THREE.BufferGeometry) => THREE.BufferGeometry
): THREE.BufferGeometry {
  const beforeReport = getTopologyReport(current);
  const candidate = stage(current);
  if (candidate === current) return current;

  const afterReport = getTopologyReport(candidate);
  const improved = afterReport.isManifold
    || (
      afterReport.nonManifoldEdges <= beforeReport.nonManifoldEdges
      && topologyDefectScore(afterReport) < topologyDefectScore(beforeReport)
    );

  if (!improved) {
    console.log(`  ${label}: rejected (before boundary=${beforeReport.boundaryEdges}, nonManifold=${beforeReport.nonManifoldEdges}; after boundary=${afterReport.boundaryEdges}, nonManifold=${afterReport.nonManifoldEdges})`);
    candidate.dispose();
    return current;
  }

  console.log(`  ${label}: accepted (before boundary=${beforeReport.boundaryEdges}, nonManifold=${beforeReport.nonManifoldEdges}; after boundary=${afterReport.boundaryEdges}, nonManifold=${afterReport.nonManifoldEdges})`);
  current.dispose();
  return candidate;
}

function fastCapRepair(
  geometry: THREE.BufferGeometry,
  maxPasses: number = 3
): THREE.BufferGeometry {
  let current = geometry;

  for (let pass = 1; pass <= maxPasses; pass++) {
    const before = getTopologyReport(current);
    if (before.isManifold || before.boundaryEdges === 0) break;

    const candidate = fillBoundaryHoles(current);
    if (candidate === current) break;

    const cleaned = removeUnusedVertices(candidate);
    if (cleaned !== candidate) candidate.dispose();

    const after = getTopologyReport(cleaned);
    const improved = after.boundaryEdges < before.boundaryEdges
      && after.nonManifoldEdges <= before.nonManifoldEdges;

    if (!improved) {
      cleaned.dispose();
      break;
    }

    console.log(`  Fast cap pass ${pass}: boundary ${before.boundaryEdges} -> ${after.boundaryEdges}, nonManifold ${before.nonManifoldEdges} -> ${after.nonManifoldEdges}`);
    if (current !== geometry) current.dispose();
    current = cleaned;

    if (after.isManifold) break;
  }

  return current;
}

function removeUnusedVertices(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const positions = geometry.attributes.position;
  const normals = geometry.attributes.normal;
  const indices = geometry.index;
  
  if (!indices) return geometry;
  
  const usedVertices = new Set<number>();
  for (let i = 0; i < indices.count; i++) {
    usedVertices.add(indices.getX(i));
  }
  
  if (usedVertices.size === positions.count) {
    return geometry;
  }
  
  const oldToNew = new Map<number, number>();
  const newPositions: number[] = [];
  const newNormals: number[] = [];
  
  let newIndex = 0;
  for (let oldIndex = 0; oldIndex < positions.count; oldIndex++) {
    if (usedVertices.has(oldIndex)) {
      oldToNew.set(oldIndex, newIndex);
      
      newPositions.push(
        positions.getX(oldIndex),
        positions.getY(oldIndex),
        positions.getZ(oldIndex)
      );
      
      if (normals) {
        newNormals.push(
          normals.getX(oldIndex),
          normals.getY(oldIndex),
          normals.getZ(oldIndex)
        );
      }
      
      newIndex++;
    }
  }
  
  const newIndices: number[] = [];
  for (let i = 0; i < indices.count; i++) {
    const mappedIndex = oldToNew.get(indices.getX(i));
    if (mappedIndex !== undefined) {
      newIndices.push(mappedIndex);
    }
  }
  
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
  if (normals) {
    result.setAttribute('normal', new THREE.Float32BufferAttribute(newNormals, 3));
  }
  result.setIndex(newIndices);
  
  return result;
}

function weldCoincidentVertices(
  geometry: THREE.BufferGeometry,
  tolerance: number = 0.0001
): THREE.BufferGeometry {
  const positions = geometry.attributes.position;
  const indices = geometry.index;
  
  if (!indices) return geometry;
  
  const gridSize = tolerance * 2;
  const spatialHash = new Map<string, number[]>();
  
  const hashVertex = (x: number, y: number, z: number): string => {
    const gx = Math.floor(x / gridSize);
    const gy = Math.floor(y / gridSize);
    const gz = Math.floor(z / gridSize);
    return `${gx}_${gy}_${gz}`;
  };
  
  const vertexMap = new Map<number, number>();
  
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const hash = hashVertex(x, y, z);
    
    const nearby = spatialHash.get(hash) || [];
    let merged = false;
    
    for (const nearbyIdx of nearby) {
      const nx = positions.getX(nearbyIdx);
      const ny = positions.getY(nearbyIdx);
      const nz = positions.getZ(nearbyIdx);
      
      const dx = x - nx;
      const dy = y - ny;
      const dz = z - nz;
      const distSq = dx * dx + dy * dy + dz * dz;
      
      if (distSq < tolerance * tolerance) {
        vertexMap.set(i, nearbyIdx);
        merged = true;
        break;
      }
    }
    
    if (!merged) {
      if (!spatialHash.has(hash)) {
        spatialHash.set(hash, []);
      }
      spatialHash.get(hash)!.push(i);
      vertexMap.set(i, i);
    }
  }
  
  const newIndices: number[] = [];
  for (let i = 0; i < indices.count; i += 3) {
    const i0 = vertexMap.get(indices.getX(i))!;
    const i1 = vertexMap.get(indices.getX(i + 1))!;
    const i2 = vertexMap.get(indices.getX(i + 2))!;
    
    if (i0 !== i1 && i1 !== i2 && i2 !== i0) {
      newIndices.push(i0, i1, i2);
    }
  }
  
  const result = geometry.clone();
  result.setIndex(newIndices);
  
  return removeUnusedVertices(result);
}

export function surgicalSlotRepair(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  console.log('🔬 Starting SURGICAL slot repair');
  console.log(`  Initial: ${geometry.attributes.position.count} vertices, ${geometry.index?.count ? geometry.index.count / 3 : 0} faces`);
  
  let result = geometry;
  
  // Step 1: Remove degenerate triangles
  result = removeDegenerateTriangles(result, 0.00001);
  
  // Step 2: Weld coincident vertices (VERY tight tolerance)
  result = weldCoincidentVertices(result, 0.0001);
  
  // Step 3: Fix non-manifold edges
  result = fixNonManifoldEdges(result);

  // Step 4: Fast conservative fallback first.
  // Peel noisy boundary flaps before attempting cap triangulation.
  result = applyRepairStageIfImproves('Boundary peel', result, (g) => peelBoundaryFaces(g, 8));

  // Step 5: Second weld pass with slightly larger tolerance (spatial hash, not O(n²))
  result = weldCoincidentVertices(result, 0.0002);

  // Step 6: Remove unused vertices
  result = removeUnusedVertices(result);
  
  // Step 7: Fill boundary holes (slicer-style cap generation)
  result = applyRepairStageIfImproves('Hole fill', result, fillBoundaryHoles);

  // Step 8: Fast cap repair passes for remaining boundary loops.
  result = applyRepairStageIfImproves('Fast cap repair', result, (g) => fastCapRepair(g, 3));

  // Step 9: Light cleanup without deleting tiny cap triangles.
  result = removeUnusedVertices(result);
  
  // Recompute normals and bounds
  result.computeVertexNormals();
  result.computeBoundingBox();
  
  console.log(`  Final: ${result.attributes.position.count} vertices, ${result.index?.count ? result.index.count / 3 : 0} faces`);
  
  return result;
}

export function getTopologyReport(geometry: THREE.BufferGeometry): {
  vertices: number;
  faces: number;
  boundaryEdges: number;
  interiorEdges: number;
  nonManifoldEdges: number;
  isManifold: boolean;
} {
  const edgeMap = buildEdgeTopology(geometry);
  
  let boundaryEdges = 0;
  let interiorEdges = 0;
  let nonManifoldEdges = 0;
  
  edgeMap.forEach((info) => {
    if (info.count === 1) boundaryEdges++;
    else if (info.count === 2) interiorEdges++;
    else nonManifoldEdges++;
  });
  
  return {
    vertices: geometry.attributes.position.count,
    faces: geometry.index ? geometry.index.count / 3 : 0,
    boundaryEdges,
    interiorEdges,
    nonManifoldEdges,
    isManifold: boundaryEdges === 0 && nonManifoldEdges === 0
  };
}
