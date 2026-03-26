import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils';

/**
 * ADVANCED SLOT CUT ARTIFACT REPAIR
 * 
 * This is a comprehensive multi-pass repair system specifically designed to eliminate
 * the stubborn artifacts created by CSG slot cutting operations.
 * 
 * The key insight: CSG operations create multiple types of artifacts that need to be
 * addressed in a specific order with increasingly aggressive tolerances.
 */

interface EdgeData {
  v1: number;
  v2: number;
  faces: Set<number>;
  length: number;
}

interface VertexData {
  x: number;
  y: number;
  z: number;
  faces: Set<number>;
}

/**
 * Build comprehensive edge and vertex maps for topology analysis
 */
function buildTopologyMaps(geometry: THREE.BufferGeometry): {
  edges: Map<string, EdgeData>;
  vertices: Map<number, VertexData>;
} {
  const positions = geometry.attributes.position;
  const indices = geometry.index;
  
  if (!indices) {
    return { edges: new Map(), vertices: new Map() };
  }
  
  const edges = new Map<string, EdgeData>();
  const vertices = new Map<number, VertexData>();
  
  // Build vertex map
  for (let i = 0; i < positions.count; i++) {
    vertices.set(i, {
      x: positions.getX(i),
      y: positions.getY(i),
      z: positions.getZ(i),
      faces: new Set()
    });
  }
  
  // Build edge map
  for (let i = 0; i < indices.count; i += 3) {
    const faceIdx = Math.floor(i / 3);
    const i0 = indices.getX(i);
    const i1 = indices.getX(i + 1);
    const i2 = indices.getX(i + 2);
    
    // Mark vertices as part of this face
    vertices.get(i0)?.faces.add(faceIdx);
    vertices.get(i1)?.faces.add(faceIdx);
    vertices.get(i2)?.faces.add(faceIdx);
    
    // Add edges
    const edgePairs = [
      [i0, i1],
      [i1, i2],
      [i2, i0]
    ];
    
    edgePairs.forEach(([v1, v2]) => {
      const key = v1 < v2 ? `${v1}_${v2}` : `${v2}_${v1}`;
      const minV = Math.min(v1, v2);
      const maxV = Math.max(v1, v2);
      
      if (!edges.has(key)) {
        const vert1 = vertices.get(minV)!;
        const vert2 = vertices.get(maxV)!;
        const dx = vert2.x - vert1.x;
        const dy = vert2.y - vert1.y;
        const dz = vert2.z - vert1.z;
        const length = Math.sqrt(dx*dx + dy*dy + dz*dz);
        
        edges.set(key, {
          v1: minV,
          v2: maxV,
          faces: new Set(),
          length
        });
      }
      
      edges.get(key)!.faces.add(faceIdx);
    });
  }
  
  return { edges, vertices };
}

/**
 * AGGRESSIVE degenerate triangle removal
 * Removes triangles with:
 * - Zero or near-zero area
 * - Duplicate vertices
 * - Extremely short edges (artifact edges)
 */
export function aggressiveRemoveDegenerates(
  geometry: THREE.BufferGeometry,
  areaThreshold = 0.001,
  edgeLengthThreshold = 0.0001
): THREE.BufferGeometry {
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
  
  let removedDegenerate = 0;
  let removedShortEdge = 0;
  let removedDuplicate = 0;
  
  for (let i = 0; i < indices.count; i += 3) {
    const i0 = indices.getX(i);
    const i1 = indices.getX(i + 1);
    const i2 = indices.getX(i + 2);
    
    // Check for duplicate vertices
    if (i0 === i1 || i1 === i2 || i2 === i0) {
      removedDuplicate++;
      continue;
    }
    
    v0.fromBufferAttribute(positions as THREE.BufferAttribute, i0);
    v1.fromBufferAttribute(positions as THREE.BufferAttribute, i1);
    v2.fromBufferAttribute(positions as THREE.BufferAttribute, i2);
    
    // Check edge lengths - remove triangles with extremely short edges (artifacts)
    const len01 = v0.distanceTo(v1);
    const len12 = v1.distanceTo(v2);
    const len20 = v2.distanceTo(v0);
    
    if (len01 < edgeLengthThreshold || len12 < edgeLengthThreshold || len20 < edgeLengthThreshold) {
      removedShortEdge++;
      continue;
    }
    
    // Check triangle area
    edge1.subVectors(v1, v0);
    edge2.subVectors(v2, v0);
    cross.crossVectors(edge1, edge2);
    const area = cross.length() * 0.5;
    
    if (area > areaThreshold) {
      newIndices.push(i0, i1, i2);
    } else {
      removedDegenerate++;
    }
  }
  
  console.log(`  Removed: ${removedDuplicate} duplicate, ${removedShortEdge} short-edge, ${removedDegenerate} zero-area triangles`);
  
  const newGeo = geometry.clone();
  newGeo.setIndex(newIndices);
  return newGeo;
}

/**
 * Fix non-manifold edges by removing excess faces
 * A manifold edge is shared by exactly 2 faces
 */
export function fixNonManifoldEdgesAggressive(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const { edges } = buildTopologyMaps(geometry);
  const indices = geometry.index;
  if (!indices) return geometry;
  
  const facesToRemove = new Set<number>();
  let nonManifoldCount = 0;
  
  edges.forEach((edge, key) => {
    const faceCount = edge.faces.size;
    
    if (faceCount > 2) {
      // Non-manifold edge - keep only first 2 faces, remove the rest
      nonManifoldCount++;
      const facesArray = Array.from(edge.faces);
      for (let i = 2; i < facesArray.length; i++) {
        facesToRemove.add(facesArray[i]);
      }
    } else if (faceCount === 1) {
      // Boundary edge - this is OK for slot cuts
    }
  });
  
  console.log(`  Found ${nonManifoldCount} non-manifold edges, removing ${facesToRemove.size} faces`);
  
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
  
  const newGeo = geometry.clone();
  newGeo.setIndex(newIndices);
  return newGeo;
}

/**
 * AGGRESSIVE edge collapse - removes micro-edges and extra vertices
 * This is KEY for removing slot cut artifacts
 */
export function aggressiveEdgeCollapse(
  geometry: THREE.BufferGeometry,
  threshold = 0.05  // Increased from 0.01 - more aggressive
): THREE.BufferGeometry {
  const positions = geometry.attributes.position;
  const indices = geometry.index;
  
  if (!indices) return geometry;
  
  // Build edge list with lengths
  const edges: Array<{v1: number, v2: number, length: number}> = [];
  const edgeSet = new Set<string>();
  
  for (let i = 0; i < indices.count; i += 3) {
    const i0 = indices.getX(i);
    const i1 = indices.getX(i + 1);
    const i2 = indices.getX(i + 2);
    
    [[i0, i1], [i1, i2], [i2, i0]].forEach(([v1, v2]) => {
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
        
        edges.push({
          v1: Math.min(v1, v2),
          v2: Math.max(v1, v2),
          length: p1.distanceTo(p2)
        });
      }
    });
  }
  
  // Sort by length
  edges.sort((a, b) => a.length - b.length);
  
  // Build merge map
  const mergeMap = new Map<number, number>();
  let collapseCount = 0;
  
  for (const edge of edges) {
    if (edge.length >= threshold) break;
    
    const v1 = mergeMap.get(edge.v1) ?? edge.v1;
    const v2 = mergeMap.get(edge.v2) ?? edge.v2;
    
    if (v1 !== v2) {
      collapseCount++;
      mergeMap.set(v2, v1);
      
      // Cascade updates
      mergeMap.forEach((target, source) => {
        if (target === v2) {
          mergeMap.set(source, v1);
        }
      });
    }
  }
  
  console.log(`  Collapsed ${collapseCount} short edges`);
  
  // Apply merges
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
 * Remove vertices that are not referenced by any triangle
 */
export function removeUnusedVertices(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
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
    const newIndex = oldToNew.get(indices.getX(i));
    if (newIndex !== undefined) {
      newIndices.push(newIndex);
    }
  }
  
  console.log(`  Removed ${positions.count - usedVertices.size} unused vertices`);
  
  const newGeo = new THREE.BufferGeometry();
  newGeo.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
  if (normals) {
    newGeo.setAttribute('normal', new THREE.Float32BufferAttribute(newNormals, 3));
  }
  newGeo.setIndex(newIndices);
  
  return newGeo;
}

/**
 * Remove faces that extend far beyond the main geometry (slot cut artifacts)
 */
export function removeFarExtendedFaces(
  geometry: THREE.BufferGeometry,
  maxDistanceMultiplier = 1.5
): THREE.BufferGeometry {
  const positions = geometry.attributes.position;
  const indices = geometry.index;
  
  if (!indices || !geometry.boundingBox) {
    geometry.computeBoundingBox();
  }
  
  const bbox = geometry.boundingBox!;
  const bboxSize = new THREE.Vector3();
  bbox.getSize(bboxSize);
  const maxDimension = Math.max(bboxSize.x, bboxSize.y, bboxSize.z);
  const maxAllowedDistance = maxDimension * maxDistanceMultiplier;
  
  const newIndices: number[] = [];
  let removedCount = 0;
  
  for (let i = 0; i < indices.count; i += 3) {
    const i0 = indices.getX(i);
    const i1 = indices.getX(i + 1);
    const i2 = indices.getX(i + 2);
    
    // Check if all vertices are within reasonable distance from origin
    const maxDist = Math.max(
      Math.sqrt(
        positions.getX(i0) ** 2 +
        positions.getY(i0) ** 2 +
        positions.getZ(i0) ** 2
      ),
      Math.sqrt(
        positions.getX(i1) ** 2 +
        positions.getY(i1) ** 2 +
        positions.getZ(i1) ** 2
      ),
      Math.sqrt(
        positions.getX(i2) ** 2 +
        positions.getY(i2) ** 2 +
        positions.getZ(i2) ** 2
      )
    );
    
    if (maxDist <= maxAllowedDistance) {
      newIndices.push(i0, i1, i2);
    } else {
      removedCount++;
    }
  }
  
  if (removedCount > 0) {
    console.log(`  Removed ${removedCount} far-extended faces`);
    const newGeo = geometry.clone();
    newGeo.setIndex(newIndices);
    return newGeo;
  }
  
  return geometry;
}

/**
 * MAIN ADVANCED REPAIR FUNCTION
 * 
 * This applies repairs in optimal order with multiple passes
 * to eliminate stubborn slot cut artifacts
 */
export function advancedRepairSlotCutGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  let repaired = geometry;
  
  const initialVertices = geometry.attributes.position.count;
  const initialTriangles = geometry.index ? geometry.index.count / 3 : 0;
  
  console.log(`🔧 ADVANCED REPAIR START`);
  console.log(`  Initial: ${initialVertices} vertices, ${initialTriangles} triangles`);
  
  // PASS 1: Remove obviously bad triangles
  console.log(`\n📐 Pass 1: Aggressive degenerate removal`);
  repaired = aggressiveRemoveDegenerates(repaired, 0.001, 0.0005);
  
  // PASS 2: Fix non-manifold topology
  console.log(`\n🔗 Pass 2: Fix non-manifold edges`);
  repaired = fixNonManifoldEdgesAggressive(repaired);
  
  // PASS 3: First aggressive vertex merge
  console.log(`\n🎯 Pass 3: Aggressive vertex merge (0.01)`);
  repaired = BufferGeometryUtils.mergeVertices(repaired, 0.01);
  console.log(`  Merged to ${repaired.attributes.position.count} vertices`);
  
  // PASS 4: Aggressive edge collapse
  console.log(`\n✂️ Pass 4: Aggressive edge collapse`);
  repaired = aggressiveEdgeCollapse(repaired, 0.05);
  
  // PASS 5: Remove unused vertices
  console.log(`\n🧹 Pass 5: Remove unused vertices`);
  repaired = removeUnusedVertices(repaired);
  
  // PASS 6: Medium vertex merge
  console.log(`\n🎯 Pass 6: Medium vertex merge (0.005)`);
  repaired = BufferGeometryUtils.mergeVertices(repaired, 0.005);
  console.log(`  Merged to ${repaired.attributes.position.count} vertices`);
  
  // PASS 7: Remove far-extended faces (slot cut artifacts)
  console.log(`\n🗑️ Pass 7: Remove extended faces`);
  repaired = removeFarExtendedFaces(repaired, 1.3);
  
  // PASS 8: Second edge collapse (catch any new short edges)
  console.log(`\n✂️ Pass 8: Second edge collapse`);
  repaired = aggressiveEdgeCollapse(repaired, 0.03);
  
  // PASS 9: Clean up again
  console.log(`\n🧹 Pass 9: Final cleanup`);
  repaired = removeUnusedVertices(repaired);
  repaired = aggressiveRemoveDegenerates(repaired, 0.0001, 0.0001);
  
  // PASS 10: Final tight merge
  console.log(`\n🎯 Pass 10: Final tight merge (0.001)`);
  repaired = BufferGeometryUtils.mergeVertices(repaired, 0.001);
  console.log(`  Final: ${repaired.attributes.position.count} vertices`);
  
  // Recompute geometry properties
  repaired.computeVertexNormals();
  repaired.computeBoundingBox();
  
  const finalVertices = repaired.attributes.position.count;
  const finalTriangles = repaired.index ? repaired.index.count / 3 : 0;
  const vertexReduction = ((initialVertices - finalVertices) / initialVertices * 100).toFixed(1);
  
  console.log(`\n✅ ADVANCED REPAIR COMPLETE`);
  console.log(`  Final: ${finalVertices} vertices, ${finalTriangles} triangles`);
  console.log(`  Reduced by: ${vertexReduction}% vertices`);
  
  return repaired;
}
