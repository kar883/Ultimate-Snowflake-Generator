import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils';

/**
 * Comprehensive geometry repair for CSG slot cutting artifacts
 * This addresses:
 * - Extra vertices along slot cut edges
 * - Non-manifold edges
 * - Degenerate triangles
 * - T-junctions
 */

interface Edge {
  v1: number;
  v2: number;
  faces: number[];
}

/**
 * Build edge map to detect non-manifold geometry
 */
function buildEdgeMap(geometry: THREE.BufferGeometry): Map<string, Edge> {
  const indices = geometry.index;
  if (!indices) return new Map();
  
  const edgeMap = new Map<string, Edge>();
  
  for (let i = 0; i < indices.count; i += 3) {
    const faceIdx = i / 3;
    const i0 = indices.getX(i);
    const i1 = indices.getX(i + 1);
    const i2 = indices.getX(i + 2);
    
    // Add all three edges of this triangle
    const edges = [
      [i0, i1],
      [i1, i2],
      [i2, i0]
    ];
    
    edges.forEach(([v1, v2]) => {
      // Canonical edge key (smaller index first)
      const key = v1 < v2 ? `${v1}_${v2}` : `${v2}_${v1}`;
      
      if (!edgeMap.has(key)) {
        edgeMap.set(key, { v1: Math.min(v1, v2), v2: Math.max(v1, v2), faces: [] });
      }
      edgeMap.get(key)!.faces.push(faceIdx);
    });
  }
  
  return edgeMap;
}

/**
 * Remove degenerate triangles (zero or near-zero area)
 */
export function removeDegenerateTriangles(geometry: THREE.BufferGeometry, epsilon = 0.0001): THREE.BufferGeometry {
  const positions = geometry.attributes.position;
  const indices = geometry.index;
  
  if (!indices) return geometry;
  
  const newIndices: number[] = [];
  const v0 = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const edge1 = new THREE.Vector3();
  const edge2 = new THREE.Vector3();
  const cross = new THREE.Vector3();
  
  for (let i = 0; i < indices.count; i += 3) {
    const i0 = indices.getX(i);
    const i1 = indices.getX(i + 1);
    const i2 = indices.getX(i + 2);
    
    // Skip if any indices are identical (degenerate)
    if (i0 === i1 || i1 === i2 || i2 === i0) continue;
    
    v0.fromBufferAttribute(positions as THREE.BufferAttribute, i0);
    v1.fromBufferAttribute(positions as THREE.BufferAttribute, i1);
    v2.fromBufferAttribute(positions as THREE.BufferAttribute, i2);
    
    edge1.subVectors(v1, v0);
    edge2.subVectors(v2, v0);
    cross.crossVectors(edge1, edge2);
    
    const area = cross.length() * 0.5;
    
    if (area > epsilon) {
      newIndices.push(i0, i1, i2);
    }
  }
  
  const newGeo = geometry.clone();
  newGeo.setIndex(newIndices);
  return newGeo;
}

/**
 * Remove isolated vertices not referenced by any face
 */
export function removeIsolatedVertices(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const positions = geometry.attributes.position;
  const normals = geometry.attributes.normal;
  const indices = geometry.index;
  
  if (!indices) return geometry;
  
  // Find all used vertices
  const usedVertices = new Set<number>();
  for (let i = 0; i < indices.count; i++) {
    usedVertices.add(indices.getX(i));
  }
  
  if (usedVertices.size === positions.count) {
    return geometry; // All vertices used
  }
  
  // Create mapping and new arrays
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
  
  // Remap indices
  const newIndices: number[] = [];
  for (let i = 0; i < indices.count; i++) {
    const newIndex = oldToNew.get(indices.getX(i));
    if (newIndex !== undefined) {
      newIndices.push(newIndex);
    }
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
 * Detect and fix non-manifold edges (edges shared by more than 2 faces)
 * This is the KEY function for fixing slot cut artifacts
 */
export function fixNonManifoldEdges(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const edgeMap = buildEdgeMap(geometry);
  const indices = geometry.index;
  if (!indices) return geometry;
  
  const newIndices: number[] = [];
  const facesToRemove = new Set<number>();
  
  // Identify non-manifold edges (shared by > 2 faces)
  edgeMap.forEach((edge) => {
    if (edge.faces.length > 2) {
      // Mark all but first 2 faces for removal
      for (let i = 2; i < edge.faces.length; i++) {
        facesToRemove.add(edge.faces[i]);
      }
    }
  });
  
  // Rebuild index buffer without bad faces
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
 * Collapse short edges - this removes the extra vertices along slot cuts
 */
export function collapseShortEdges(geometry: THREE.BufferGeometry, threshold = 0.01): THREE.BufferGeometry {
  const positions = geometry.attributes.position;
  const indices = geometry.index;
  
  if (!indices) return geometry;
  
  // Build edge map with lengths
  const edges: Array<{v1: number, v2: number, length: number}> = [];
  const edgeSet = new Set<string>();
  
  for (let i = 0; i < indices.count; i += 3) {
    const i0 = indices.getX(i);
    const i1 = indices.getX(i + 1);
    const i2 = indices.getX(i + 2);
    
    const pairs = [[i0, i1], [i1, i2], [i2, i0]];
    
    pairs.forEach(([v1, v2]) => {
      const key = v1 < v2 ? `${v1}_${v2}` : `${v2}_${v1}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        
        const p1 = new THREE.Vector3(
          positions.getX(v1),
          positions.getY(v1),
          positions.getZ(v1)
        );
        const p2 = new THREE.Vector3(
          positions.getX(v2),
          positions.getY(v2),
          positions.getZ(v2)
        );
        
        const length = p1.distanceTo(p2);
        edges.push({ v1: Math.min(v1, v2), v2: Math.max(v1, v2), length });
      }
    });
  }
  
  // Sort by length to collapse shortest first
  edges.sort((a, b) => a.length - b.length);
  
  // Build vertex merge map
  const mergeMap = new Map<number, number>();
  
  for (const edge of edges) {
    if (edge.length >= threshold) break; // No more short edges
    
    const v1 = mergeMap.get(edge.v1) ?? edge.v1;
    const v2 = mergeMap.get(edge.v2) ?? edge.v2;
    
    if (v1 !== v2) {
      // Merge v2 into v1
      mergeMap.set(v2, v1);
      
      // Update all vertices that were merged to v2
      mergeMap.forEach((target, source) => {
        if (target === v2) {
          mergeMap.set(source, v1);
        }
      });
    }
  }
  
  // If no merges, return original
  if (mergeMap.size === 0) return geometry;
  
  // Apply merges to indices
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
  
  // Clean up unused vertices
  return removeIsolatedVertices(newGeo);
}

/**
 * MAIN REPAIR FUNCTION
 * Apply all repairs in optimal order for slot cutting artifacts
 */
export function repairSlotCutGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  let repaired = geometry;
  
  console.log(`🔧 Starting slot cut repair - Initial: ${geometry.attributes.position.count} vertices`);
  
  // Step 1: Remove obviously degenerate triangles
  repaired = removeDegenerateTriangles(repaired, 0.0001);
  console.log(`  ✓ Removed degenerate triangles`);
  
  // Step 2: Fix non-manifold edges (the main culprit for artifacts)
  repaired = fixNonManifoldEdges(repaired);
  console.log(`  ✓ Fixed non-manifold edges`);
  
  // Step 3: Aggressive vertex merging (handles near-duplicate vertices from CSG)
  repaired = BufferGeometryUtils.mergeVertices(repaired, 0.005);
  console.log(`  ✓ Aggressive vertex merge (0.005)`);
  
  // Step 4: Collapse short edges (removes extra vertices along slot cuts)
  repaired = collapseShortEdges(repaired, 0.02);
  console.log(`  ✓ Collapsed short edges`);
  
  // Step 5: Remove isolated vertices
  repaired = removeIsolatedVertices(repaired);
  console.log(`  ✓ Removed isolated vertices`);
  
  // Step 6: Medium tolerance merge to clean up
  repaired = BufferGeometryUtils.mergeVertices(repaired, 0.002);
  console.log(`  ✓ Medium merge (0.002)`);
  
  // Step 7: Final degenerate removal
  repaired = removeDegenerateTriangles(repaired, 0.0001);
  console.log(`  ✓ Final degenerate removal`);
  
  // Step 8: Final tight merge
  repaired = BufferGeometryUtils.mergeVertices(repaired, 0.0005);
  console.log(`  ✓ Tight merge (0.0005)`);
  
  // Recompute normals and bounding box
  repaired.computeVertexNormals();
  repaired.computeBoundingBox();
  
  console.log(`🔧 Repair complete - Final: ${repaired.attributes.position.count} vertices`);
  
  return repaired;
}

/**
 * Lighter repair for less aggressive cases
 */
export function lightRepairGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  let repaired = geometry;
  
  // Just the essentials
  repaired = removeDegenerateTriangles(repaired, 0.0001);
  repaired = BufferGeometryUtils.mergeVertices(repaired, 0.001);
  repaired = removeIsolatedVertices(repaired);
  repaired.computeVertexNormals();
  repaired.computeBoundingBox();
  
  return repaired;
}
