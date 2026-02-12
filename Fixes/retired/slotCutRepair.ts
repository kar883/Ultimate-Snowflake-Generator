import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils';

/**
 * AGGRESSIVE SLOT CUT REPAIR
 * Specifically designed to fix CSG boolean operation artifacts
 * 
 * This module targets the specific problems created by CSG subtract operations:
 * 1. Non-manifold edges (edges shared by != 2 faces)
 * 2. Duplicate/overlapping faces at cut boundaries
 * 3. Extra vertices along slot cut paths
 * 4. T-junctions from imperfect boolean operations
 */

interface EdgeData {
  v1: number;
  v2: number;
  faceCount: number;
  length: number;
}

/**
 * Build comprehensive edge map with face counting and edge lengths
 */
function buildEdgeMapWithMetrics(geometry: THREE.BufferGeometry): Map<string, EdgeData> {
  const positions = geometry.attributes.position;
  const indices = geometry.index;
  if (!indices) return new Map();
  
  const edgeMap = new Map<string, EdgeData>();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  
  for (let i = 0; i < indices.count; i += 3) {
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
          faceCount: 0,
          length: v1.distanceTo(v2)
        });
      }
      
      const edge = edgeMap.get(key)!;
      edge.faceCount++;
    }
  }
  
  return edgeMap;
}

/**
 * Remove non-manifold edges (edges with != 2 faces)
 * This is the PRIMARY fix for slot cut artifacts
 */
function fixNonManifoldEdges(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const edgeMap = buildEdgeMapWithMetrics(geometry);
  const indices = geometry.index;
  if (!indices) return geometry;
  
  // Identify faces to remove (those containing non-manifold edges)
  const facesToRemove = new Set<number>();
  const nonManifoldEdges = new Set<string>();
  
  edgeMap.forEach((edge, key) => {
    if (edge.faceCount !== 2) {
      nonManifoldEdges.add(key);
    }
  });
  
  if (nonManifoldEdges.size === 0) return geometry;
  
  // Find faces that use non-manifold edges
  for (let i = 0; i < indices.count; i += 3) {
    const i0 = indices.getX(i);
    const i1 = indices.getX(i + 1);
    const i2 = indices.getX(i + 2);
    
    const edges = [
      [i0, i1],
      [i1, i2],
      [i2, i0]
    ];
    
    for (const [v1, v2] of edges) {
      const key = v1 < v2 ? `${v1}_${v2}` : `${v2}_${v1}`;
      if (nonManifoldEdges.has(key)) {
        const faceIdx = i / 3;
        facesToRemove.add(faceIdx);
        break; // This face is bad, no need to check other edges
      }
    }
  }
  
  console.log(`  🔧 Removing ${facesToRemove.size} faces with non-manifold edges`);
  
  // Rebuild without bad faces
  const newIndices: number[] = [];
  for (let i = 0; i < indices.count; i += 3) {
    const faceIdx = i / 3;
    if (!facesToRemove.has(faceIdx)) {
      newIndices.push(
        indices.getX(i),
        indices.getX(i + 1),
        indices.getX(i + 2)
      );
    }
  }
  
  const newGeo = geometry.clone();
  newGeo.setIndex(newIndices);
  return newGeo;
}

/**
 * Collapse very short edges - removes extra vertices from CSG
 */
function collapseShortEdges(geometry: THREE.BufferGeometry, threshold: number = 0.01): THREE.BufferGeometry {
  const edgeMap = buildEdgeMapWithMetrics(geometry);
  const indices = geometry.index;
  if (!indices) return geometry;
  
  // Find short edges (but only collapse if they have exactly 2 faces - manifold edges)
  const shortEdges: Array<[number, number]> = [];
  edgeMap.forEach((edge, key) => {
    if (edge.length < threshold && edge.faceCount === 2) {
      shortEdges.push([edge.v1, edge.v2]);
    }
  });
  
  if (shortEdges.length === 0) return geometry;
  
  console.log(`  🔧 Collapsing ${shortEdges.length} short edges`);
  
  // Build vertex merge map (collapse v2 into v1)
  const mergeMap = new Map<number, number>();
  
  for (const [v1, v2] of shortEdges) {
    const target1 = mergeMap.get(v1) ?? v1;
    const target2 = mergeMap.get(v2) ?? v2;
    
    if (target1 !== target2) {
      mergeMap.set(target2, target1);
      mergeMap.set(v2, target1);
    }
  }
  
  // Apply merges
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
 * Remove duplicate/overlapping faces
 */
function removeDuplicateFaces(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const positions = geometry.attributes.position;
  const indices = geometry.index;
  if (!indices) return geometry;
  
  const faceSet = new Set<string>();
  const newIndices: number[] = [];
  
  for (let i = 0; i < indices.count; i += 3) {
    const i0 = indices.getX(i);
    const i1 = indices.getX(i + 1);
    const i2 = indices.getX(i + 2);
    
    // Create canonical face key (sorted vertex positions)
    const verts = [i0, i1, i2].sort((a, b) => a - b);
    const key = `${verts[0]}_${verts[1]}_${verts[2]}`;
    
    if (!faceSet.has(key)) {
      faceSet.add(key);
      newIndices.push(i0, i1, i2);
    }
  }
  
  if (newIndices.length < indices.count) {
    console.log(`  🔧 Removed ${(indices.count - newIndices.length) / 3} duplicate faces`);
  }
  
  const newGeo = geometry.clone();
  newGeo.setIndex(newIndices);
  return newGeo;
}

/**
 * Remove degenerate triangles
 */
function removeDegenerateTriangles(geometry: THREE.BufferGeometry, epsilon = 0.0001): THREE.BufferGeometry {
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
    
    const edge1 = v1.clone().sub(v0);
    const edge2 = v2.clone().sub(v0);
    const area = edge1.cross(edge2).length() * 0.5;
    
    if (area > epsilon) {
      newIndices.push(i0, i1, i2);
    }
  }
  
  const newGeo = geometry.clone();
  newGeo.setIndex(newIndices);
  return newGeo;
}

/**
 * Remove isolated/unused vertices
 */
function removeIsolatedVertices(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
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
  
  console.log(`  🔧 Removing ${positions.count - usedVertices.size} isolated vertices`);
  
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
 * MAIN AGGRESSIVE SLOT CUT REPAIR
 * 
 * This is optimized specifically for CSG slot cutting artifacts:
 * - More aggressive vertex merging than general repair
 * - Targets non-manifold edges from boolean operations
 * - Removes CSG-induced duplicate faces
 * - Collapses tiny edges created at cut boundaries
 */
export function aggressiveSlotCutRepair(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  console.log(`🔧 AGGRESSIVE SLOT CUT REPAIR - Initial: ${geometry.attributes.position.count} vertices`);
  
  let repaired = geometry;
  
  // Step 1: Remove obvious degenerates
  repaired = removeDegenerateTriangles(repaired, 0.0001);
  
  // Step 2: VERY aggressive vertex merging (CSG creates lots of near-duplicates)
  repaired = BufferGeometryUtils.mergeVertices(repaired, 0.02);
  console.log(`  ✓ Ultra-aggressive merge (0.02)`);
  
  // Step 3: Fix non-manifold edges (the MAIN problem)
  repaired = fixNonManifoldEdges(repaired);
  
  // Step 4: Remove duplicate faces from CSG
  repaired = removeDuplicateFaces(repaired);
  
  // Step 5: Collapse short edges (removes extra vertices along cuts)
  repaired = collapseShortEdges(repaired, 0.03);
  
  // Step 6: Clean up isolated vertices
  repaired = removeIsolatedVertices(repaired);
  
  // Step 7: Second pass merge (medium tolerance)
  repaired = BufferGeometryUtils.mergeVertices(repaired, 0.01);
  console.log(`  ✓ Second merge pass (0.01)`);
  
  // Step 8: Final degenerate cleanup
  repaired = removeDegenerateTriangles(repaired, 0.0001);
  
  // Step 9: Final tight merge
  repaired = BufferGeometryUtils.mergeVertices(repaired, 0.001);
  console.log(`  ✓ Final tight merge (0.001)`);
  
  // Step 10: Recompute normals and bounds
  repaired.computeVertexNormals();
  repaired.computeBoundingBox();
  
  console.log(`🔧 REPAIR COMPLETE - Final: ${repaired.attributes.position.count} vertices`);
  console.log(`   Reduction: ${geometry.attributes.position.count - repaired.attributes.position.count} vertices removed`);
  
  return repaired;
}

/**
 * Verify manifold status
 */
export function verifyManifoldStatus(geometry: THREE.BufferGeometry): {
  isManifold: boolean;
  nonManifoldEdges: number;
  totalEdges: number;
} {
  const edgeMap = buildEdgeMapWithMetrics(geometry);
  let nonManifoldCount = 0;
  
  edgeMap.forEach((edge) => {
    if (edge.faceCount !== 2) {
      nonManifoldCount++;
    }
  });
  
  return {
    isManifold: nonManifoldCount === 0,
    nonManifoldEdges: nonManifoldCount,
    totalEdges: edgeMap.size
  };
}
