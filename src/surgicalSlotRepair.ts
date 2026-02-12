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
  
  // Step 4: Remove newly created degenerates
  result = removeDegenerateTriangles(result, 0.00001);
  
  // Step 5: Manual merge with tight tolerance
  const finalMergeMap = new Map<number, number>();
  const positions = result.attributes.position;
  const indices = result.index;
  
  if (indices) {
    const tolerance = 0.0002;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);
      
      for (let j = i + 1; j < positions.count; j++) {
        const dx = positions.getX(j) - x;
        const dy = positions.getY(j) - y;
        const dz = positions.getZ(j) - z;
        const distSq = dx * dx + dy * dy + dz * dz;
        
        if (distSq < tolerance * tolerance && !finalMergeMap.has(j)) {
          finalMergeMap.set(j, i);
        }
      }
    }
    
    const newIndices: number[] = [];
    for (let i = 0; i < indices.count; i++) {
      const originalIdx = indices.getX(i);
      const mergedIdx = finalMergeMap.get(originalIdx) ?? originalIdx;
      newIndices.push(mergedIdx);
    }
    
    result.setIndex(newIndices);
  }
  
  // Step 6: Remove unused vertices
  result = removeUnusedVertices(result);
  
  // Step 7: Final degenerate pass
  result = removeDegenerateTriangles(result, 0.00001);
  
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
    isManifold: nonManifoldEdges === 0
  };
}
