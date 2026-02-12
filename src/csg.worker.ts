import * as THREE from 'three';
// @ts-ignore
import { Brush, Evaluator, SUBTRACTION, ADDITION } from 'three-bvh-csg';

const evaluator = new Evaluator();
evaluator.attributes = ['position', 'normal'];
evaluator.useGroups = false;

// Suppress deprecation warnings
const originalWarn = console.warn;
console.warn = (...args: any[]) => {
  if (args.length > 0 && typeof args[0] === 'string' && args[0].includes('maxLeafTris')) {
    return;
  }
  return originalWarn.apply(console, args);
};

/**
 * COMPREHENSIVE SLOT REPAIR - COMBINED APPROACH
 * 1. Surgical repair (fix topology, weld coincident vertices)
 * 2. Gap filling (bridge holes along slot paths)
 */

interface EdgeInfo {
  count: number;
  faces: number[];
  vertices?: [number, number];
}

interface BoundaryEdge {
  v1: number;
  v2: number;
  faceIdx: number;
}

// ============================================================================
// SURGICAL REPAIR FUNCTIONS
// ============================================================================

function buildEdgeTopology(geometry: THREE.BufferGeometry): Map<string, EdgeInfo> {
  const indices = geometry.index;
  if (!indices) return new Map();
  
  const edgeMap = new Map<string, EdgeInfo>();
  
  for (let i = 0; i < indices.count; i += 3) {
    const faceIdx = Math.floor(i / 3);
    const i0 = indices.getX(i);
    const i1 = indices.getX(i + 1);
    const i2 = indices.getX(i + 2);
    
    const edges: [number, number][] = [[i0, i1], [i1, i2], [i2, i0]];
    
    for (const [v1, v2] of edges) {
      const key = v1 < v2 ? `${v1}_${v2}` : `${v2}_${v1}`;
      
      if (!edgeMap.has(key)) {
        edgeMap.set(key, { count: 0, faces: [], vertices: [Math.min(v1, v2), Math.max(v1, v2)] });
      }
      
      const info = edgeMap.get(key)!;
      info.count++;
      info.faces.push(faceIdx);
    }
  }
  
  return edgeMap;
}

function removeDegenerateTriangles(geometry: THREE.BufferGeometry, minArea: number = 0.00001): THREE.BufferGeometry {
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
      newIndices.push(indices.getX(i), indices.getX(i + 1), indices.getX(i + 2));
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
  
  if (usedVertices.size === positions.count) return geometry;
  
  const oldToNew = new Map<number, number>();
  const newPositions: number[] = [];
  const newNormals: number[] = [];
  
  let newIndex = 0;
  for (let oldIndex = 0; oldIndex < positions.count; oldIndex++) {
    if (usedVertices.has(oldIndex)) {
      oldToNew.set(oldIndex, newIndex);
      newPositions.push(positions.getX(oldIndex), positions.getY(oldIndex), positions.getZ(oldIndex));
      if (normals) {
        newNormals.push(normals.getX(oldIndex), normals.getY(oldIndex), normals.getZ(oldIndex));
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

function weldCoincidentVertices(geometry: THREE.BufferGeometry, tolerance: number = 0.0001): THREE.BufferGeometry {
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
      
      const dx = x - nx, dy = y - ny, dz = z - nz;
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

// ============================================================================
// GAP FILLING FUNCTIONS
// ============================================================================

function findBoundaryEdges(geometry: THREE.BufferGeometry): BoundaryEdge[] {
  const edgeMap = buildEdgeTopology(geometry);
  const boundaryEdges: BoundaryEdge[] = [];
  
  edgeMap.forEach((info) => {
    if (info.count === 1 && info.vertices) {
      boundaryEdges.push({
        v1: info.vertices[0],
        v2: info.vertices[1],
        faceIdx: info.faces[0]
      });
    }
  });
  
  return boundaryEdges;
}

function weldBoundaryVertices(geometry: THREE.BufferGeometry, tolerance: number = 0.4): THREE.BufferGeometry {
  const boundaryEdges = findBoundaryEdges(geometry);
  
  if (boundaryEdges.length === 0) return geometry;
  
  const boundaryVertices = new Set<number>();
  for (const edge of boundaryEdges) {
    boundaryVertices.add(edge.v1);
    boundaryVertices.add(edge.v2);
  }
  
  const positions = geometry.attributes.position;
  const indices = geometry.index!;
  
  const gridSize = tolerance * 2;
  const spatialHash = new Map<string, number[]>();
  
  const hashVertex = (x: number, y: number, z: number): string => {
    const gx = Math.floor(x / gridSize);
    const gy = Math.floor(y / gridSize);
    const gz = Math.floor(z / gridSize);
    return `${gx}_${gy}_${gz}`;
  };
  
  const vertexMap = new Map<number, number>();
  let mergedCount = 0;
  
  for (const vertexIdx of boundaryVertices) {
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
      
      const dx = x - nx, dy = y - ny, dz = z - nz;
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
  
  if (mergedCount === 0) return geometry;
  
  console.log(`  Welded ${mergedCount} boundary vertices`);
  
  const newIndices: number[] = [];
  
  for (let i = 0; i < indices.count; i += 3) {
    const i0 = vertexMap.get(indices.getX(i)) ?? indices.getX(i);
    const i1 = vertexMap.get(indices.getX(i + 1)) ?? indices.getX(i + 1);
    const i2 = vertexMap.get(indices.getX(i + 2)) ?? indices.getX(i + 2);
    
    if (i0 !== i1 && i1 !== i2 && i2 !== i0) {
      newIndices.push(i0, i1, i2);
    }
  }
  
  const result = geometry.clone();
  result.setIndex(newIndices);
  return result;
}

// ============================================================================
// COMBINED REPAIR PIPELINE
// ============================================================================

function comprehensiveSlotRepair(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  console.log('🔧 COMPREHENSIVE slot repair (surgical + gap filling)');
  console.log(`  Initial: ${geometry.attributes.position.count} vertices, ${geometry.index ? geometry.index.count / 3 : 0} faces`);
  
  let result = geometry;
  
  // PHASE 1: SURGICAL REPAIR
  console.log('Phase 1: Surgical topology repair');
  result = removeDegenerateTriangles(result, 0.00001);
  console.log(`  After degenerate removal: ${result.attributes.position.count} vertices, ${result.index ? result.index.count / 3 : 0} faces`);
  
  result = weldCoincidentVertices(result, 0.0001);
  console.log(`  After vertex welding: ${result.attributes.position.count} vertices, ${result.index ? result.index.count / 3 : 0} faces`);
  
  result = fixNonManifoldEdges(result);
  console.log(`  After non-manifold fix: ${result.attributes.position.count} vertices, ${result.index ? result.index.count / 3 : 0} faces`);
  
  result = removeDegenerateTriangles(result, 0.00001);
  console.log(`  After final degenerate removal: ${result.attributes.position.count} vertices, ${result.index ? result.index.count / 3 : 0} faces`);
  
  // PHASE 2: GAP FILLING
  console.log('Phase 2: Gap filling on boundaries');
  const boundaryBefore = findBoundaryEdges(result);
  console.log(`  Boundary edges before: ${boundaryBefore.length}`);
  
  if (boundaryBefore.length > 0) {
    // Weld boundary vertices more aggressively
    result = weldBoundaryVertices(result, 0.4);
    console.log(`  After boundary welding: ${result.attributes.position.count} vertices, ${result.index ? result.index.count / 3 : 0} faces`);
    
    const boundaryAfter = findBoundaryEdges(result);
    console.log(`  Boundary edges after welding: ${boundaryAfter.length}`);
  }
  
  // PHASE 3: FINAL CLEANUP
  console.log('Phase 3: Final cleanup');
  // Manual merge since BufferGeometryUtils not available in worker
  result = weldCoincidentVertices(result, 0.0002);
  console.log(`  After final merge: ${result.attributes.position.count} vertices, ${result.index ? result.index.count / 3 : 0} faces`);
  
  result = removeUnusedVertices(result);
  console.log(`  After removing unused vertices: ${result.attributes.position.count} vertices, ${result.index ? result.index.count / 3 : 0} faces`);
  
  result = removeDegenerateTriangles(result, 0.00001);
  console.log(`  After final degenerate removal: ${result.attributes.position.count} vertices, ${result.index ? result.index.count / 3 : 0} faces`);
  
  result.computeVertexNormals();
  result.computeBoundingBox();
  
  const finalBoundary = findBoundaryEdges(result);
  console.log(`  Final boundary edges: ${finalBoundary.length}`);
  console.log(`  Final: ${result.attributes.position.count} vertices, ${result.index ? result.index.count / 3 : 0} faces`);
  
  return result;
}

// ============================================================================
// WORKER MESSAGE HANDLER
// ============================================================================

self.onmessage = (e) => {
    const { base, slots, rotation } = e.data;

    const parseGeometry = (data: any) => {
        const geo = new THREE.BufferGeometry();
        if (data.position) geo.setAttribute('position', new THREE.Float32BufferAttribute(data.position, 3));
        if (data.normal) geo.setAttribute('normal', new THREE.Float32BufferAttribute(data.normal, 3));
        if (data.index) geo.setIndex(new THREE.BufferAttribute(data.index, 1));
        return geo;
    };
    
    const configureBVH = (geometry: any) => {
        try {
            if (geometry.computeBoundsTree) {
                geometry.computeBoundsTree({
                    maxLeafSize: 16,
                    indirect: true
                });
            }
        } catch (e) {}
    };

    let baseGeo: THREE.BufferGeometry | null = null;
    let toolBrush: any = null;

    try {
        baseGeo = parseGeometry(base);
        if (!baseGeo.attributes.normal) baseGeo.computeVertexNormals();
        
        configureBVH(baseGeo);
        
        // @ts-ignore
        const baseBrush: any = new Brush(baseGeo);
        if (baseBrush.updateMatrixWorld) baseBrush.updateMatrixWorld();

        console.log(`🔍 CSG Debug: Processing ${slots.length} slots`);
        console.log(`  Base geometry: ${baseGeo.attributes.position.count} vertices, ${baseGeo.index ? baseGeo.index.count / 3 : 0} faces`);
        
        for (const slotData of slots) {
            const slotGeo = parseGeometry(slotData);
            console.log(`  Slot geometry: ${slotGeo.attributes.position.count} vertices, ${slotGeo.index ? slotGeo.index.count / 3 : 0} faces`);
            
            configureBVH(slotGeo);
            
            slotGeo.rotateX(rotation.x * Math.PI / 180);
            slotGeo.rotateY(rotation.y * Math.PI / 180);
            
            // @ts-ignore
            const brush: any = new Brush(slotGeo);
            if (brush.updateMatrixWorld) brush.updateMatrixWorld();

            if (!toolBrush) {
                toolBrush = brush;
                console.log(`  Created initial tool brush`);
            } else {
                console.log(`  Merging with existing tool brush`);
                const nextTool: any = evaluator.evaluate(toolBrush, brush, ADDITION);
                try {
                  if (toolBrush.geometry && toolBrush.geometry !== brush.geometry) toolBrush.geometry.dispose();
                } catch {}
                try { if (brush.geometry) brush.geometry.dispose(); } catch {}
                toolBrush = nextTool;
                console.log(`  After merge: ${nextTool.geometry.attributes.position.count} vertices, ${nextTool.geometry.index ? nextTool.geometry.index.count / 3 : 0} faces`);
            }
        }

        if (!toolBrush) {
            (self as any).postMessage({ position: base.position, normal: base.normal, index: base.index });
            return;
        }

        if (toolBrush.updateMatrixWorld) toolBrush.updateMatrixWorld();
        
        console.log(`🔍 Final CSG subtraction:`);
        console.log(`  Base brush: ${baseBrush.geometry.attributes.position.count} vertices, ${baseBrush.geometry.index ? baseBrush.geometry.index.count / 3 : 0} faces`);
        console.log(`  Tool brush: ${toolBrush.geometry.attributes.position.count} vertices, ${toolBrush.geometry.index ? toolBrush.geometry.index.count / 3 : 0} faces`);
        
        const result: any = evaluator.evaluate(baseBrush, toolBrush, SUBTRACTION);
        
        // *** CHECK CSG RESULT ***
        let resGeo = result.geometry;
        const preRepairVertices = resGeo.attributes.position.count;
        const preRepairFaces = resGeo.index ? resGeo.index.count / 3 : 0;
        console.log(`🔍 CSG Result: ${preRepairVertices} vertices, ${preRepairFaces} faces`);
        
        if (preRepairFaces === 0) {
            console.error('❌ CSG operation produced no faces! This indicates a problem with the CSG operation itself.');
            console.log('  Base geometry vertices:', baseGeo?.attributes.position.count);
            console.log('  Tool geometry vertices:', toolBrush?.geometry?.attributes.position.count);
        }
        
        // *** APPLY COMPREHENSIVE REPAIR ***
        resGeo = comprehensiveSlotRepair(resGeo);
        
        const postRepairVertices = resGeo.attributes.position.count;
        console.log(`✅ Repair complete: ${preRepairVertices} → ${postRepairVertices} vertices`);
        
        try { if (toolBrush.geometry) toolBrush.geometry.dispose(); } catch {}
        try { baseGeo.dispose(); } catch {}

        const position = resGeo.attributes.position.array;
        const normal = resGeo.attributes.normal?.array;
        const index = resGeo.index?.array;

        const transferables: Transferable[] = [position.buffer];
        if (normal) transferables.push(normal.buffer);
        if (index) transferables.push(index.buffer);

        (self as any).postMessage({ position, normal, index }, transferables);

    } catch (error) {
        console.error("Worker CSG Error:", error);
        (self as any).postMessage({ 
            position: base.position, 
            normal: base.normal, 
            index: base.index 
        });
    }
};
