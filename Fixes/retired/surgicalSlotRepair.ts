import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils';

/**
 * SURGICAL SLOT CUT REPAIR
 * 
 * Problem: CSG slot cutting creates non-manifold edges at slot boundaries
 * Root causes:
 * 1. Coincident vertices (same position, different indices)
 * 2. T-junctions where slot cuts intersect base mesh
 * 3. Edges shared by 3+ faces (non-manifold)
 * 4. Degenerate triangles from CSG artifacts
 * 
 * Solution: Surgical repair that:
 * - Uses VERY tight tolerances to preserve detail
 * - Fixes only actual problems, not valid geometry
 * - Properly welds vertices at slot boundaries
 * - Maintains manifold topology
 */

interface EdgeKey {
  v1: number;
  v2: number;
  key: string;
}

interface EdgeInfo {
  count: number;
  faces: number[];
}

/**
 * Build precise edge topology map
 */
function buildEdgeTopology(geometry: THREE.BufferGeometry): Map<string, EdgeInfo> {
  const indices = geometry.index;
  if (!indices) return new Map();
  
  const edgeMap = new Map<string, EdgeInfo>();
  
  for (let i = 0; i < indices.count; i += 3) {
    const faceIdx = Math.floor(i / 3);
    const i0 = indices.getX(i);
    const i1 = indices.getX(i + 1);
    const i2 = indices.getX(i + 2);
    
    // All three edges of triangle
    const edges: [number, number][] = [
      [i0, i1],
      [i1, i2],
      [i2, i0]
    ];
    
    for (const [v1, v2] of edges) {
      // Canonical edge key (smaller vertex index first)
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

/**
 * Identify non-manifold edges (edges with != 2 faces)
 */
function findNonManifoldEdges(geometry: THREE.BufferGeometry): {
  boundary: string[];  // 1 face (boundary edges - these are OK)
  nonManifold: string[];  // 3+ faces (PROBLEM)
} {
  const edgeMap = buildEdgeTopology(geometry);
  const boundary: string[] = [];
  const nonManifold: string[] = [];
  
  edgeMap.forEach((info, key) => {
    if (info.count === 1) {
      boundary.push(key);
    } else if (info.count > 2) {
      nonManifold.push(key);
    }
  });
  
  return { boundary, nonManifold };
}

/**
 * Remove degenerate triangles with tight tolerance
 */
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
  
  let removedCount = 0;
  
  for (let i = 0; i < indices.count; i += 3) {
    const i0 = indices.getX(i);
    const i1 = indices.getX(i + 1);
    const i2 = indices.getX(i + 2);
    
    // Skip if duplicate indices
    if (i0 === i1 || i1 === i2 || i2 === i0) {
      removedCount++;
      continue;
    }
    
    v0.fromBufferAttribute(positions as THREE.BufferAttribute, i0);
    v1.fromBufferAttribute(positions as THREE.BufferAttribute, i1);
    v2.fromBufferAttribute(positions as THREE.BufferAttribute, i2);
    
    // Calculate triangle area
    const edge1 = new THREE.Vector3().subVectors(v1, v0);
    const edge2 = new THREE.Vector3().subVectors(v2, v0);
    const cross = new THREE.Vector3().crossVectors(edge1, edge2);
    const area = cross.length() * 0.5;
    
    if (area >= minArea) {
      newIndices.push(i0, i1, i2);
    } else {
      removedCount++;
    }
  }
  
  if (removedCount > 0) {
    console.log(`  Removed ${removedCount} degenerate triangles`);
  }
  
  const result = geometry.clone();
  result.setIndex(newIndices);
  return result;
}

/**
 * Fix non-manifold edges by removing duplicate faces
 * This is the KEY fix for slot cut artifacts
 */
function fixNonManifoldEdges(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const edgeMap = buildEdgeTopology(geometry);
  const indices = geometry.index;
  
  if (!indices) return geometry;
  
  // Find faces to remove (keep first 2 faces per edge)
  const facesToRemove = new Set<number>();
  
  edgeMap.forEach((info, key) => {
    if (info.count > 2) {
      // Non-manifold edge - remove faces beyond first 2
      for (let i = 2; i < info.faces.length; i++) {
        facesToRemove.add(info.faces[i]);
      }
    }
  });
  
  if (facesToRemove.size === 0) {
    return geometry; // No non-manifold edges
  }
  
  console.log(`  Fixing ${facesToRemove.size} non-manifold faces`);
  
  // Rebuild index without bad faces
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

/**
 * Remove isolated vertices (not referenced by any triangle)
 */
function removeUnusedVertices(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const positions = geometry.attributes.position;
  const normals = geometry.attributes.normal;
  const indices = geometry.index;
  
  if (!indices) return geometry;
  
  // Find used vertices
  const usedVertices = new Set<number>();
  for (let i = 0; i < indices.count; i++) {
    usedVertices.add(indices.getX(i));
  }
  
  // All vertices are used
  if (usedVertices.size === positions.count) {
    return geometry;
  }
  
  console.log(`  Removing ${positions.count - usedVertices.size} unused vertices`);
  
  // Build new vertex arrays and mapping
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
  
  // Remap indices
  const newIndices: number[] = [];
  for (let i = 0; i < indices.count; i++) {
    const mappedIndex = oldToNew.get(indices.getX(i));
    if (mappedIndex !== undefined) {
      newIndices.push(mappedIndex);
    }
  }
  
  // Build result geometry
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
  if (normals) {
    result.setAttribute('normal', new THREE.Float32BufferAttribute(newNormals, 3));
  }
  result.setIndex(newIndices);
  
  return result;
}

/**
 * Weld vertices that are at the exact same position
 * Uses spatial hashing for O(n) performance
 */
function weldCoincidentVertices(
  geometry: THREE.BufferGeometry,
  tolerance: number = 0.0001
): THREE.BufferGeometry {
  const positions = geometry.attributes.position;
  const indices = geometry.index;
  
  if (!indices) return geometry;
  
  // Spatial hash for fast lookups
  const gridSize = tolerance * 2;
  const spatialHash = new Map<string, number[]>();
  
  const hashVertex = (x: number, y: number, z: number): string => {
    const gx = Math.floor(x / gridSize);
    const gy = Math.floor(y / gridSize);
    const gz = Math.floor(z / gridSize);
    return `${gx}_${gy}_${gz}`;
  };
  
  // Build vertex merge map
  const vertexMap = new Map<number, number>();
  
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const hash = hashVertex(x, y, z);
    
    // Check nearby vertices in same grid cell
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
        // Merge this vertex into nearby vertex
        vertexMap.set(i, nearbyIdx);
        merged = true;
        break;
      }
    }
    
    if (!merged) {
      // First vertex in this location
      if (!spatialHash.has(hash)) {
        spatialHash.set(hash, []);
      }
      spatialHash.get(hash)!.push(i);
      vertexMap.set(i, i); // Map to self
    }
  }
  
  const mergedCount = positions.count - new Set(vertexMap.values()).size;
  if (mergedCount > 0) {
    console.log(`  Welded ${mergedCount} coincident vertices`);
  }
  
  // Apply mapping to indices
  const newIndices: number[] = [];
  for (let i = 0; i < indices.count; i += 3) {
    const i0 = vertexMap.get(indices.getX(i))!;
    const i1 = vertexMap.get(indices.getX(i + 1))!;
    const i2 = vertexMap.get(indices.getX(i + 2))!;
    
    // Skip degenerate triangles created by welding
    if (i0 !== i1 && i1 !== i2 && i2 !== i0) {
      newIndices.push(i0, i1, i2);
    }
  }
  
  const result = geometry.clone();
  result.setIndex(newIndices);
  
  // Clean up unused vertices
  return removeUnusedVertices(result);
}

/**
 * MAIN SURGICAL REPAIR FUNCTION
 * 
 * This uses VERY tight tolerances to preserve detail while fixing topology
 */
export function surgicalSlotRepair(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  console.log('🔬 Starting SURGICAL slot repair');
  console.log(`  Initial: ${geometry.attributes.position.count} vertices, ${geometry.index?.count ? geometry.index.count / 3 : 0} faces`);
  
  let result = geometry;
  
  // Step 1: Remove obvious degenerate triangles
  result = removeDegenerateTriangles(result, 0.00001);
  
  // Step 2: Weld coincident vertices (VERY tight tolerance)
  // This fixes duplicate vertices at slot boundaries
  result = weldCoincidentVertices(result, 0.0001);
  
  // Step 3: Fix non-manifold edges
  // This removes duplicate faces along slot cuts
  result = fixNonManifoldEdges(result);
  
  // Step 4: Remove any newly created degenerates
  result = removeDegenerateTriangles(result, 0.00001);
  
  // Step 5: Final cleanup - standard THREE.js merge with TIGHT tolerance
  // This catches any remaining near-duplicates without destroying detail
  result = BufferGeometryUtils.mergeVertices(result, 0.0002);
  
  // Step 6: Remove unused vertices
  result = removeUnusedVertices(result);
  
  // Step 7: Final degenerate pass
  result = removeDegenerateTriangles(result, 0.00001);
  
  // Recompute normals and bounds
  result.computeVertexNormals();
  result.computeBoundingBox();
  
  console.log(`  Final: ${result.attributes.position.count} vertices, ${result.index?.count ? result.index.count / 3 : 0} faces`);
  
  // Verify manifold topology
  const { boundary, nonManifold } = findNonManifoldEdges(result);
  console.log(`  Topology: ${boundary.length} boundary edges, ${nonManifold.length} non-manifold edges`);
  
  if (nonManifold.length > 0) {
    console.warn(`  ⚠️  Still have ${nonManifold.length} non-manifold edges - may need additional repair`);
  } else {
    console.log('  ✅ Clean manifold topology!');
  }
  
  return result;
}

/**
 * Get detailed topology report for debugging
 */
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

/**
 * Aggressive repair for heavily corrupted geometry
 * Use this if surgical repair still leaves non-manifold edges
 */
export function aggressiveSlotRepair(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  console.log('🔨 Starting AGGRESSIVE slot repair');
  console.log(`  Initial: ${geometry.attributes.position.count} vertices`);
  
  let result = geometry;
  
  // More aggressive degenerate removal
  result = removeDegenerateTriangles(result, 0.0001);
  
  // Aggressive welding
  result = weldCoincidentVertices(result, 0.001);
  
  // Fix non-manifold
  result = fixNonManifoldEdges(result);
  
  // Aggressive THREE.js merge
  result = BufferGeometryUtils.mergeVertices(result, 0.001);
  
  // Cleanup
  result = removeUnusedVertices(result);
  result = removeDegenerateTriangles(result, 0.0001);
  
  // Another round of non-manifold fixing
  result = fixNonManifoldEdges(result);
  
  // Final merge
  result = BufferGeometryUtils.mergeVertices(result, 0.0005);
  
  result.computeVertexNormals();
  result.computeBoundingBox();
  
  console.log(`  Final: ${result.attributes.position.count} vertices`);
  
  const { nonManifold } = findNonManifoldEdges(result);
  console.log(`  Non-manifold edges: ${nonManifold.length}`);
  
  return result;
}
