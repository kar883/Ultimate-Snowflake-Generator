import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils';

/**
 * GAP-FILLING SLOT REPAIR
 * 
 * Problem: CSG slot cutting creates ACTUAL HOLES in the mesh along slot boundaries
 * This happens when:
 * 1. Slot geometry doesn't perfectly align with base mesh
 * 2. Numerical precision issues create tiny gaps
 * 3. CSG operation fails to properly merge boundary vertices
 * 
 * Solution: 
 * 1. Detect boundary edges (edges with only 1 face)
 * 2. Find boundary loops along slot paths
 * 3. Fill small gaps by creating bridge triangles
 * 4. Weld boundary vertices that are very close
 */

interface BoundaryEdge {
  v1: number;
  v2: number;
  faceIdx: number;
}

interface EdgeInfo {
  count: number;
  faces: number[];
  vertices: [number, number];
}

/**
 * Build edge topology and identify boundary edges
 */
function findBoundaryEdges(geometry: THREE.BufferGeometry): BoundaryEdge[] {
  const indices = geometry.index;
  if (!indices) return [];
  
  const edgeMap = new Map<string, EdgeInfo>();
  
  // Build edge map
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
        edgeMap.set(key, { 
          count: 0, 
          faces: [], 
          vertices: [Math.min(v1, v2), Math.max(v1, v2)] 
        });
      }
      
      const info = edgeMap.get(key)!;
      info.count++;
      info.faces.push(faceIdx);
    }
  }
  
  // Find boundary edges (only 1 face)
  const boundaryEdges: BoundaryEdge[] = [];
  
  edgeMap.forEach((info) => {
    if (info.count === 1) {
      boundaryEdges.push({
        v1: info.vertices[0],
        v2: info.vertices[1],
        faceIdx: info.faces[0]
      });
    }
  });
  
  return boundaryEdges;
}

/**
 * Find small gaps (pairs of boundary edges that are very close but not connected)
 */
function findGaps(
  geometry: THREE.BufferGeometry,
  boundaryEdges: BoundaryEdge[],
  maxGapDistance: number = 0.5
): Array<{ edge1: BoundaryEdge; edge2: BoundaryEdge; distance: number }> {
  
  const positions = geometry.attributes.position;
  const gaps: Array<{ edge1: BoundaryEdge; edge2: BoundaryEdge; distance: number }> = [];
  
  // Check each pair of boundary edges
  for (let i = 0; i < boundaryEdges.length; i++) {
    for (let j = i + 1; j < boundaryEdges.length; j++) {
      const edge1 = boundaryEdges[i];
      const edge2 = boundaryEdges[j];
      
      // Skip if edges share a vertex (they're connected)
      if (edge1.v1 === edge2.v1 || edge1.v1 === edge2.v2 || 
          edge1.v2 === edge2.v1 || edge1.v2 === edge2.v2) {
        continue;
      }
      
      // Get edge positions
      const e1v1 = new THREE.Vector3(
        positions.getX(edge1.v1),
        positions.getY(edge1.v1),
        positions.getZ(edge1.v1)
      );
      const e1v2 = new THREE.Vector3(
        positions.getX(edge1.v2),
        positions.getY(edge1.v2),
        positions.getZ(edge1.v2)
      );
      const e2v1 = new THREE.Vector3(
        positions.getX(edge2.v1),
        positions.getY(edge2.v1),
        positions.getZ(edge2.v1)
      );
      const e2v2 = new THREE.Vector3(
        positions.getX(edge2.v2),
        positions.getY(edge2.v2),
        positions.getZ(edge2.v2)
      );
      
      // Calculate minimum distance between edges
      const dist1 = Math.min(e1v1.distanceTo(e2v1), e1v1.distanceTo(e2v2));
      const dist2 = Math.min(e1v2.distanceTo(e2v1), e1v2.distanceTo(e2v2));
      const minDist = Math.min(dist1, dist2);
      
      // If edges are very close, they're likely a gap
      if (minDist < maxGapDistance && minDist > 0.001) {
        gaps.push({ edge1, edge2, distance: minDist });
      }
    }
  }
  
  return gaps;
}

/**
 * Fill gaps by creating bridge triangles between nearby boundary edges
 */
function fillGaps(
  geometry: THREE.BufferGeometry,
  maxGapDistance: number = 0.5
): THREE.BufferGeometry {
  
  const boundaryEdges = findBoundaryEdges(geometry);
  
  if (boundaryEdges.length === 0) {
    console.log('  No boundary edges found (mesh is closed)');
    return geometry;
  }
  
  console.log(`  Found ${boundaryEdges.length} boundary edges`);
  
  const gaps = findGaps(geometry, boundaryEdges, maxGapDistance);
  
  if (gaps.length === 0) {
    console.log('  No gaps found to fill');
    return geometry;
  }
  
  console.log(`  Found ${gaps.length} gaps to fill`);
  
  const positions = geometry.attributes.position;
  const normals = geometry.attributes.normal;
  const indices = geometry.index!;
  
  // Create new arrays with additional triangles
  const newPositions = Array.from(positions.array);
  const newNormals = normals ? Array.from(normals.array) : [];
  const newIndices = Array.from(indices.array);
  
  let bridgesCreated = 0;
  
  // For each gap, create bridge triangles
  for (const gap of gaps) {
    const { edge1, edge2 } = gap;
    
    // Get vertex positions
    const e1v1 = new THREE.Vector3(
      positions.getX(edge1.v1),
      positions.getY(edge1.v1),
      positions.getZ(edge1.v1)
    );
    const e1v2 = new THREE.Vector3(
      positions.getX(edge1.v2),
      positions.getY(edge1.v2),
      positions.getZ(edge1.v2)
    );
    const e2v1 = new THREE.Vector3(
      positions.getX(edge2.v1),
      positions.getY(edge2.v1),
      positions.getZ(edge2.v1)
    );
    const e2v2 = new THREE.Vector3(
      positions.getX(edge2.v2),
      positions.getY(edge2.v2),
      positions.getZ(edge2.v2)
    );
    
    // Find closest vertex pairs
    const pairs = [
      { v1: edge1.v1, v2: edge2.v1, dist: e1v1.distanceTo(e2v1) },
      { v1: edge1.v1, v2: edge2.v2, dist: e1v1.distanceTo(e2v2) },
      { v1: edge1.v2, v2: edge2.v1, dist: e1v2.distanceTo(e2v1) },
      { v1: edge1.v2, v2: edge2.v2, dist: e1v2.distanceTo(e2v2) }
    ].sort((a, b) => a.dist - b.dist);
    
    // Create two triangles to bridge the gap
    // Triangle 1: edge1.v1, edge1.v2, closest vertex from edge2
    // Triangle 2: connects the remaining vertices
    
    const closest = pairs[0];
    const secondClosest = pairs[1];
    
    // Determine which vertices to use
    let quad: number[];
    if (closest.v1 === edge1.v1 && secondClosest.v1 === edge1.v2) {
      quad = [edge1.v1, edge1.v2, edge2.v2, edge2.v1];
    } else if (closest.v1 === edge1.v1 && secondClosest.v1 === edge1.v1) {
      quad = [edge1.v1, edge1.v2, edge2.v1, edge2.v2];
    } else if (closest.v1 === edge1.v2 && secondClosest.v1 === edge1.v2) {
      quad = [edge1.v2, edge1.v1, edge2.v2, edge2.v1];
    } else {
      quad = [edge1.v1, edge1.v2, closest.v2, secondClosest.v2];
    }
    
    // Add two triangles to form a quad
    newIndices.push(quad[0], quad[1], quad[2]);
    newIndices.push(quad[0], quad[2], quad[3]);
    
    bridgesCreated++;
  }
  
  console.log(`  Created ${bridgesCreated} bridge triangles`);
  
  // Create new geometry
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
  if (normals) {
    result.setAttribute('normal', new THREE.Float32BufferAttribute(newNormals, 3));
  }
  result.setIndex(newIndices);
  
  return result;
}

/**
 * Weld boundary vertices that are very close together
 * This is more aggressive than normal vertex welding, but only on boundaries
 */
function weldBoundaryVertices(
  geometry: THREE.BufferGeometry,
  tolerance: number = 0.3
): THREE.BufferGeometry {
  
  const boundaryEdges = findBoundaryEdges(geometry);
  
  if (boundaryEdges.length === 0) {
    return geometry;
  }
  
  // Collect all boundary vertices
  const boundaryVertices = new Set<number>();
  for (const edge of boundaryEdges) {
    boundaryVertices.add(edge.v1);
    boundaryVertices.add(edge.v2);
  }
  
  console.log(`  Found ${boundaryVertices.size} boundary vertices`);
  
  const positions = geometry.attributes.position;
  const indices = geometry.index!;
  
  // Build merge map for boundary vertices only
  const vertexMap = new Map<number, number>();
  const boundaryArray = Array.from(boundaryVertices);
  
  // Spatial hash for fast lookups
  const gridSize = tolerance * 2;
  const spatialHash = new Map<string, number[]>();
  
  const hashVertex = (x: number, y: number, z: number): string => {
    const gx = Math.floor(x / gridSize);
    const gy = Math.floor(y / gridSize);
    const gz = Math.floor(z / gridSize);
    return `${gx}_${gy}_${gz}`;
  };
  
  let mergedCount = 0;
  
  for (const vertexIdx of boundaryArray) {
    const x = positions.getX(vertexIdx);
    const y = positions.getY(vertexIdx);
    const z = positions.getZ(vertexIdx);
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
        vertexMap.set(vertexIdx, nearbyIdx);
        merged = true;
        mergedCount++;
        break;
      }
    }
    
    if (!merged) {
      if (!spatialHash.has(hash)) {
        spatialHash.set(hash, []);
      }
      spatialHash.get(hash)!.push(vertexIdx);
      vertexMap.set(vertexIdx, vertexIdx);
    }
  }
  
  if (mergedCount === 0) {
    console.log('  No boundary vertices needed welding');
    return geometry;
  }
  
  console.log(`  Welded ${mergedCount} boundary vertices`);
  
  // Apply vertex mapping to indices
  const newIndices: number[] = [];
  
  for (let i = 0; i < indices.count; i += 3) {
    const i0 = indices.getX(i);
    const i1 = indices.getX(i + 1);
    const i2 = indices.getX(i + 2);
    
    // Apply mapping if vertex is in map, otherwise keep original
    const m0 = vertexMap.get(i0) ?? i0;
    const m1 = vertexMap.get(i1) ?? i1;
    const m2 = vertexMap.get(i2) ?? i2;
    
    // Skip degenerate triangles
    if (m0 !== m1 && m1 !== m2 && m2 !== m0) {
      newIndices.push(m0, m1, m2);
    }
  }
  
  const result = geometry.clone();
  result.setIndex(newIndices);
  
  return result;
}

/**
 * Remove tiny boundary loops (isolated holes smaller than threshold)
 */
function removeSmallHoles(
  geometry: THREE.BufferGeometry,
  maxHoleArea: number = 0.1
): THREE.BufferGeometry {
  
  const boundaryEdges = findBoundaryEdges(geometry);
  
  if (boundaryEdges.length === 0) {
    return geometry;
  }
  
  // Build adjacency list for boundary vertices
  const adjacency = new Map<number, Set<number>>();
  
  for (const edge of boundaryEdges) {
    if (!adjacency.has(edge.v1)) adjacency.set(edge.v1, new Set());
    if (!adjacency.has(edge.v2)) adjacency.set(edge.v2, new Set());
    
    adjacency.get(edge.v1)!.add(edge.v2);
    adjacency.get(edge.v2)!.add(edge.v1);
  }
  
  // Find boundary loops
  const visited = new Set<number>();
  const loops: number[][] = [];
  
  for (const startVertex of adjacency.keys()) {
    if (visited.has(startVertex)) continue;
    
    const loop: number[] = [];
    let current = startVertex;
    
    while (!visited.has(current)) {
      visited.add(current);
      loop.push(current);
      
      // Find next vertex in loop
      const neighbors = adjacency.get(current)!;
      let next = -1;
      
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor) || neighbor === startVertex) {
          next = neighbor;
          break;
        }
      }
      
      if (next === -1 || next === startVertex) break;
      current = next;
    }
    
    if (loop.length > 2) {
      loops.push(loop);
    }
  }
  
  console.log(`  Found ${loops.length} boundary loops`);
  
  // Calculate area of each loop and fill small ones
  const positions = geometry.attributes.position;
  const indices = geometry.index!;
  const newIndices = Array.from(indices.array);
  
  let filledHoles = 0;
  
  for (const loop of loops) {
    // Calculate loop area (simplified)
    let area = 0;
    for (let i = 0; i < loop.length; i++) {
      const v1 = loop[i];
      const v2 = loop[(i + 1) % loop.length];
      
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
      
      area += p1.distanceTo(p2);
    }
    
    // If loop is small, fill it with triangles (simple fan triangulation)
    if (area < maxHoleArea && loop.length >= 3) {
      const center = loop[0];
      
      for (let i = 1; i < loop.length - 1; i++) {
        newIndices.push(center, loop[i], loop[i + 1]);
      }
      
      filledHoles++;
    }
  }
  
  if (filledHoles > 0) {
    console.log(`  Filled ${filledHoles} small holes`);
    const result = geometry.clone();
    result.setIndex(newIndices);
    return result;
  }
  
  return geometry;
}

/**
 * MAIN GAP-FILLING REPAIR
 */
export function gapFillingSlotRepair(
  geometry: THREE.BufferGeometry,
  options: {
    maxGapDistance?: number;
    boundaryWeldTolerance?: number;
    fillSmallHoles?: boolean;
    maxHoleArea?: number;
  } = {}
): THREE.BufferGeometry {
  
  const {
    maxGapDistance = 0.5,
    boundaryWeldTolerance = 0.3,
    fillSmallHoles = true,
    maxHoleArea = 0.1
  } = options;
  
  console.log('🔧 Starting GAP-FILLING slot repair');
  console.log(`  Initial: ${geometry.attributes.position.count} vertices`);
  
  let result = geometry;
  
  // Step 1: Weld boundary vertices that are very close
  result = weldBoundaryVertices(result, boundaryWeldTolerance);
  
  // Step 2: Fill gaps between nearby boundary edges
  result = fillGaps(result, maxGapDistance);
  
  // Step 3: Optionally fill small holes
  if (fillSmallHoles) {
    result = removeSmallHoles(result, maxHoleArea);
  }
  
  // Step 4: Standard cleanup
  result = BufferGeometryUtils.mergeVertices(result, 0.0001);
  
  // Step 5: Recompute normals
  result.computeVertexNormals();
  result.computeBoundingBox();
  
  console.log(`  Final: ${result.attributes.position.count} vertices`);
  
  // Check if we still have boundary edges
  const finalBoundary = findBoundaryEdges(result);
  console.log(`  Remaining boundary edges: ${finalBoundary.length}`);
  
  return result;
}
