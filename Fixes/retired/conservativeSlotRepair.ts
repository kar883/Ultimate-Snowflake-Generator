import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils';

/**
 * TARGETED SLOT EDGE REPAIR
 * 
 * This repair focuses ONLY on the slot cut edges without removing material.
 * The problem: CSG creates extra vertices and non-manifold edges along the slot paths.
 * The solution: Detect and fix ONLY those problematic edges, leaving the rest untouched.
 * 
 * Key insight: Non-manifold edges appear specifically where slots intersect the geometry.
 * We need to weld these edges together without aggressive vertex merging that removes material.
 */

interface EdgeInfo {
  v1: number;
  v2: number;
  faceIndices: number[];
  length: number;
}

/**
 * Build edge map with full face tracking
 */
function buildDetailedEdgeMap(geometry: THREE.BufferGeometry): Map<string, EdgeInfo> {
  const positions = geometry.attributes.position;
  const indices = geometry.index;
  if (!indices) return new Map();
  
  const edgeMap = new Map<string, EdgeInfo>();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  
  for (let i = 0; i < indices.count; i += 3) {
    const faceIdx = i / 3;
    const i0 = indices.getX(i);
    const i1 = indices.getX(i + 1);
    const i2 = indices.getX(i + 2);
    
    const edges = [[i0, i1], [i1, i2], [i2, i0]];
    
    for (const [vA, vB] of edges) {
      const key = vA < vB ? `${vA}_${vB}` : `${vB}_${vA}`;
      
      if (!edgeMap.has(key)) {
        v1.fromBufferAttribute(positions as THREE.BufferAttribute, vA);
        v2.fromBufferAttribute(positions as THREE.BufferAttribute, vB);
        
        edgeMap.set(key, {
          v1: Math.min(vA, vB),
          v2: Math.max(vA, vB),
          faceIndices: [],
          length: v1.distanceTo(v2)
        });
      }
      
      edgeMap.get(key)!.faceIndices.push(faceIdx);
    }
  }
  
  return edgeMap;
}

/**
 * Find vertices that are very close to each other (CSG duplicates)
 * This uses spatial hashing for O(n) performance instead of O(n²)
 */
function findNearDuplicateVertices(
  geometry: THREE.BufferGeometry,
  tolerance: number = 0.001
): Map<number, number> {
  
  const positions = geometry.attributes.position;
  const vertexCount = positions.count;
  
  // Spatial hash grid
  const gridSize = tolerance * 2;
  const grid = new Map<string, number[]>();
  
  const getGridKey = (x: number, y: number, z: number): string => {
    const gx = Math.floor(x / gridSize);
    const gy = Math.floor(y / gridSize);
    const gz = Math.floor(z / gridSize);
    return `${gx},${gy},${gz}`;
  };
  
  // Build spatial hash
  for (let i = 0; i < vertexCount; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const key = getGridKey(x, y, z);
    
    if (!grid.has(key)) {
      grid.set(key, []);
    }
    grid.get(key)!.push(i);
  }
  
  // Find duplicates within each grid cell
  const mergeMap = new Map<number, number>();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  
  grid.forEach((vertices) => {
    if (vertices.length < 2) return;
    
    for (let i = 0; i < vertices.length; i++) {
      const idx1 = vertices[i];
      if (mergeMap.has(idx1)) continue; // Already merged
      
      v1.fromBufferAttribute(positions as THREE.BufferAttribute, idx1);
      
      for (let j = i + 1; j < vertices.length; j++) {
        const idx2 = vertices[j];
        if (mergeMap.has(idx2)) continue;
        
        v2.fromBufferAttribute(positions as THREE.BufferAttribute, idx2);
        
        if (v1.distanceTo(v2) < tolerance) {
          // Merge idx2 into idx1
          mergeMap.set(idx2, idx1);
        }
      }
    }
  });
  
  console.log(`  🔧 Found ${mergeMap.size} near-duplicate vertices`);
  
  return mergeMap;
}

/**
 * Weld near-duplicate vertices ONLY along non-manifold edges
 * This is the key: we only fix problematic areas, not the whole geometry
 */
function weldNonManifoldEdges(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const edgeMap = buildDetailedEdgeMap(geometry);
  const positions = geometry.attributes.position;
  const indices = geometry.index;
  if (!indices) return geometry;
  
  // Find non-manifold edges
  const nonManifoldEdges: EdgeInfo[] = [];
  edgeMap.forEach((edge) => {
    if (edge.faceIndices.length !== 2) {
      nonManifoldEdges.push(edge);
    }
  });
  
  if (nonManifoldEdges.length === 0) {
    console.log(`  ✓ No non-manifold edges found`);
    return geometry;
  }
  
  console.log(`  🔧 Found ${nonManifoldEdges.length} non-manifold edges`);
  
  // Collect vertices involved in non-manifold edges
  const problematicVertices = new Set<number>();
  nonManifoldEdges.forEach(edge => {
    problematicVertices.add(edge.v1);
    problematicVertices.add(edge.v2);
  });
  
  console.log(`  🔧 ${problematicVertices.size} vertices involved in non-manifold edges`);
  
  // Find near-duplicates ONLY among problematic vertices
  const mergeMap = new Map<number, number>();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const tolerance = 0.001; // Very tight tolerance to avoid removing material
  
  const problematicArray = Array.from(problematicVertices);
  for (let i = 0; i < problematicArray.length; i++) {
    const idx1 = problematicArray[i];
    v1.fromBufferAttribute(positions as THREE.BufferAttribute, idx1);
    
    for (let j = i + 1; j < problematicArray.length; j++) {
      const idx2 = problematicArray[j];
      v2.fromBufferAttribute(positions as THREE.BufferAttribute, idx2);
      
      const dist = v1.distanceTo(v2);
      if (dist < tolerance && dist > 0) {
        // Merge idx2 into idx1
        if (!mergeMap.has(idx2)) {
          mergeMap.set(idx2, idx1);
        }
      }
    }
  }
  
  if (mergeMap.size === 0) {
    console.log(`  ✓ No vertices to merge at non-manifold edges`);
    return geometry;
  }
  
  console.log(`  🔧 Merging ${mergeMap.size} duplicate vertices at non-manifold edges`);
  
  // Apply merge to indices
  const newIndices: number[] = [];
  for (let i = 0; i < indices.count; i += 3) {
    const i0 = mergeMap.get(indices.getX(i)) ?? indices.getX(i);
    const i1 = mergeMap.get(indices.getX(i + 1)) ?? indices.getX(i + 1);
    const i2 = mergeMap.get(indices.getX(i + 2)) ?? indices.getX(i + 2);
    
    // Skip degenerate triangles
    if (i0 !== i1 && i1 !== i2 && i2 !== i0) {
      newIndices.push(i0, i1, i2);
    }
  }
  
  const newGeo = geometry.clone();
  newGeo.setIndex(newIndices);
  
  return newGeo;
}

/**
 * Remove ONLY faces that are degenerate or invalid
 * Does NOT remove faces based on size - only mathematical invalidity
 */
function removeInvalidFaces(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const positions = geometry.attributes.position;
  const indices = geometry.index;
  if (!indices) return geometry;
  
  const newIndices: number[] = [];
  let removedCount = 0;
  
  for (let i = 0; i < indices.count; i += 3) {
    const i0 = indices.getX(i);
    const i1 = indices.getX(i + 1);
    const i2 = indices.getX(i + 2);
    
    // Only remove if vertices are identical (truly degenerate)
    if (i0 === i1 || i1 === i2 || i2 === i0) {
      removedCount++;
      continue;
    }
    
    newIndices.push(i0, i1, i2);
  }
  
  if (removedCount > 0) {
    console.log(`  🔧 Removed ${removedCount} degenerate faces`);
  }
  
  const newGeo = geometry.clone();
  newGeo.setIndex(newIndices);
  return newGeo;
}

/**
 * Stitch boundary edges by finding and connecting open edges
 * This specifically targets the gaps created by slot cuts
 */
function stitchBoundaryEdges(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const edgeMap = buildDetailedEdgeMap(geometry);
  const positions = geometry.attributes.position;
  
  // Find boundary edges (edges with only 1 face)
  const boundaryEdges: EdgeInfo[] = [];
  edgeMap.forEach((edge) => {
    if (edge.faceIndices.length === 1) {
      boundaryEdges.push(edge);
    }
  });
  
  if (boundaryEdges.length === 0) {
    console.log(`  ✓ No boundary edges to stitch`);
    return geometry;
  }
  
  console.log(`  🔧 Found ${boundaryEdges.length} boundary edges`);
  
  // Try to pair nearby boundary edges
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const tolerance = 0.005; // Slightly larger tolerance for stitching
  const mergeMap = new Map<number, number>();
  
  for (let i = 0; i < boundaryEdges.length; i++) {
    const edge1 = boundaryEdges[i];
    v1.fromBufferAttribute(positions as THREE.BufferAttribute, edge1.v1);
    
    for (let j = i + 1; j < boundaryEdges.length; j++) {
      const edge2 = boundaryEdges[j];
      v2.fromBufferAttribute(positions as THREE.BufferAttribute, edge2.v1);
      
      // If vertices are close, merge them
      if (v1.distanceTo(v2) < tolerance) {
        if (!mergeMap.has(edge2.v1)) {
          mergeMap.set(edge2.v1, edge1.v1);
        }
      }
      
      v2.fromBufferAttribute(positions as THREE.BufferAttribute, edge2.v2);
      if (v1.distanceTo(v2) < tolerance) {
        if (!mergeMap.has(edge2.v2)) {
          mergeMap.set(edge2.v2, edge1.v1);
        }
      }
    }
    
    v1.fromBufferAttribute(positions as THREE.BufferAttribute, edge1.v2);
    for (let j = i + 1; j < boundaryEdges.length; j++) {
      const edge2 = boundaryEdges[j];
      v2.fromBufferAttribute(positions as THREE.BufferAttribute, edge2.v1);
      
      if (v1.distanceTo(v2) < tolerance) {
        if (!mergeMap.has(edge2.v1)) {
          mergeMap.set(edge2.v1, edge1.v2);
        }
      }
      
      v2.fromBufferAttribute(positions as THREE.BufferAttribute, edge2.v2);
      if (v1.distanceTo(v2) < tolerance) {
        if (!mergeMap.has(edge2.v2)) {
          mergeMap.set(edge2.v2, edge1.v2);
        }
      }
    }
  }
  
  if (mergeMap.size === 0) {
    return geometry;
  }
  
  console.log(`  🔧 Stitching ${mergeMap.size} boundary vertices`);
  
  // Apply stitching
  const indices = geometry.index!;
  const newIndices: number[] = [];
  for (let i = 0; i < indices.count; i += 3) {
    const i0 = mergeMap.get(indices.getX(i)) ?? indices.getX(i);
    const i1 = mergeMap.get(indices.getX(i + 1)) ?? indices.getX(i + 1);
    const i2 = mergeMap.get(indices.getX(i + 2)) ?? indices.getX(i + 2);
    
    if (i0 !== i1 && i1 !== i2 && i2 !== i0) {
      newIndices.push(i0, i1, i2);
    }
  }
  
  const newGeo = geometry.clone();
  newGeo.setIndex(newIndices);
  return newGeo;
}

/**
 * CONSERVATIVE SLOT CUT REPAIR
 * 
 * This repair is CONSERVATIVE - it fixes topology errors without removing material.
 * 
 * Approach:
 * 1. Weld near-duplicate vertices ONLY at non-manifold edges
 * 2. Stitch boundary edges where slot cuts created gaps
 * 3. Remove only truly degenerate faces (identical vertices)
 * 4. Very light vertex merging (0.0001 tolerance) to clean up floating point errors
 * 
 * What it does NOT do:
 * - Aggressive vertex merging
 * - Remove faces based on area
 * - Collapse edges
 * - Modify geometry away from slot cuts
 */
export function conservativeSlotCutRepair(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  console.log(`🔧 CONSERVATIVE SLOT CUT REPAIR - Initial: ${geometry.attributes.position.count} vertices`);
  
  let repaired = geometry;
  
  // Step 1: Remove only truly invalid faces
  repaired = removeInvalidFaces(repaired);
  
  // Step 2: Weld vertices ONLY at non-manifold edges
  repaired = weldNonManifoldEdges(repaired);
  
  // Step 3: Stitch boundary edges
  repaired = stitchBoundaryEdges(repaired);
  
  // Step 4: Very conservative vertex merge (only floating point errors)
  const beforeMerge = repaired.attributes.position.count;
  repaired = BufferGeometryUtils.mergeVertices(repaired, 0.0001);
  const afterMerge = repaired.attributes.position.count;
  console.log(`  ✓ Ultra-tight merge removed ${beforeMerge - afterMerge} floating point duplicates`);
  
  // Step 5: Final cleanup of any new degenerates
  repaired = removeInvalidFaces(repaired);
  
  // Step 6: Remove unused vertices
  repaired = removeUnusedVertices(repaired);
  
  // Recompute normals and bounds
  repaired.computeVertexNormals();
  repaired.computeBoundingBox();
  
  console.log(`🔧 CONSERVATIVE REPAIR COMPLETE - Final: ${repaired.attributes.position.count} vertices`);
  console.log(`   Change: ${geometry.attributes.position.count - repaired.attributes.position.count} vertices removed`);
  
  return repaired;
}

/**
 * Remove unused vertices
 */
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
  
  let newIdx = 0;
  for (let oldIdx = 0; oldIdx < positions.count; oldIdx++) {
    if (usedVertices.has(oldIdx)) {
      oldToNew.set(oldIdx, newIdx++);
      newPositions.push(
        positions.getX(oldIdx),
        positions.getY(oldIdx),
        positions.getZ(oldIdx)
      );
      if (normals) {
        newNormals.push(
          normals.getX(oldIdx),
          normals.getY(oldIdx),
          normals.getZ(oldIdx)
        );
      }
    }
  }
  
  const newIndices: number[] = [];
  for (let i = 0; i < indices.count; i++) {
    newIndices.push(oldToNew.get(indices.getX(i))!);
  }
  
  const newGeo = new THREE.BufferGeometry();
  newGeo.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
  if (normals) {
    newGeo.setAttribute('normal', new THREE.Float32BufferAttribute(newNormals, 3));
  }
  newGeo.setIndex(newIndices);
  
  return newGeo;
}

/**
 * Diagnostic function to analyze manifold status
 */
export function analyzeManifoldEdges(geometry: THREE.BufferGeometry): {
  isManifold: boolean;
  totalEdges: number;
  manifoldEdges: number;
  nonManifoldEdges: number;
  boundaryEdges: number;
  edgesByFaceCount: Map<number, number>;
} {
  const edgeMap = buildDetailedEdgeMap(geometry);
  
  let manifoldEdges = 0;
  let boundaryEdges = 0;
  const edgesByFaceCount = new Map<number, number>();
  
  edgeMap.forEach((edge) => {
    const faceCount = edge.faceIndices.length;
    
    edgesByFaceCount.set(faceCount, (edgesByFaceCount.get(faceCount) || 0) + 1);
    
    if (faceCount === 2) {
      manifoldEdges++;
    } else if (faceCount === 1) {
      boundaryEdges++;
    }
  });
  
  const nonManifoldEdges = edgeMap.size - manifoldEdges - boundaryEdges;
  
  return {
    isManifold: nonManifoldEdges === 0 && boundaryEdges === 0,
    totalEdges: edgeMap.size,
    manifoldEdges,
    nonManifoldEdges,
    boundaryEdges,
    edgesByFaceCount
  };
}
