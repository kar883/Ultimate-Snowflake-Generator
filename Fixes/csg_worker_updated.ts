import * as THREE from 'three';
// @ts-ignore
import { Brush, Evaluator, SUBTRACTION, ADDITION } from 'three-bvh-csg';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils';

const evaluator = new Evaluator();
evaluator.attributes = ['position', 'normal'];
evaluator.useGroups = false;

// Suppress deprecation warnings by overriding console.warn in worker context
const originalWarn = console.warn;
console.warn = (...args: any[]) => {
  // Filter out MeshBVH deprecation warnings
  if (args.length > 0 && typeof args[0] === 'string' && args[0].includes('maxLeafTris')) {
    return; // Suppress this specific warning
  }
  return originalWarn.apply(console, args);
};

/**
 * SURGICAL REPAIR FUNCTIONS
 * Integrated directly in worker for maximum performance
 */

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

/**
 * Main surgical repair - runs in worker for best performance
 */
function surgicalSlotRepair(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  let result = geometry;
  
  // Step 1: Remove degenerate triangles
  result = removeDegenerateTriangles(result, 0.00001);
  
  // Step 2: Weld coincident vertices (VERY tight tolerance)
  result = weldCoincidentVertices(result, 0.0001);
  
  // Step 3: Fix non-manifold edges
  result = fixNonManifoldEdges(result);
  
  // Step 4: Remove newly created degenerates
  result = removeDegenerateTriangles(result, 0.00001);
  
  // Step 5: Standard merge with tight tolerance
  result = BufferGeometryUtils.mergeVertices(result, 0.0002);
  
  // Step 6: Remove unused vertices
  result = removeUnusedVertices(result);
  
  // Step 7: Final degenerate pass
  result = removeDegenerateTriangles(result, 0.00001);
  
  // Recompute normals and bounds
  result.computeVertexNormals();
  result.computeBoundingBox();
  
  return result;
}

/**
 * MAIN WORKER MESSAGE HANDLER
 */
self.onmessage = (e) => {
    const { base, slots, rotation } = e.data;

    // Helper to recreate geometry from buffer data
    const parseGeometry = (data: any) => {
        const geo = new THREE.BufferGeometry();
        if (data.position) geo.setAttribute('position', new THREE.Float32BufferAttribute(data.position, 3));
        if (data.normal) geo.setAttribute('normal', new THREE.Float32BufferAttribute(data.normal, 3));
        if (data.index) geo.setIndex(new THREE.BufferAttribute(data.index, 1));
        return geo;
    };
    
    // Try to configure BVH with correct options
    const configureBVH = (geometry: any) => {
        try {
            // @ts-ignore
            if (geometry.computeBoundsTree) {
                geometry.computeBoundsTree({
                    maxLeafSize: 16,
                    indirect: true
                });
            }
        } catch (e) {
            // Fallback: ignore if configuration not available
        }
    };

    let baseGeo: THREE.BufferGeometry | null = null;
    let toolBrush: any = null;

    try {
        baseGeo = parseGeometry(base);
        // Ensure base has normals for CSG
        if (!baseGeo.attributes.normal) baseGeo.computeVertexNormals();
        
        configureBVH(baseGeo);
        
        // @ts-ignore
        const baseBrush: any = new Brush(baseGeo);
        if (baseBrush.updateMatrixWorld) baseBrush.updateMatrixWorld();

        for (const slotData of slots) {
            const slotGeo = parseGeometry(slotData);
            
            configureBVH(slotGeo);
            
            // Apply rotation logic inside worker
            slotGeo.rotateX(rotation.x * Math.PI / 180);
            slotGeo.rotateY(rotation.y * Math.PI / 180);
            
            // @ts-ignore
            const brush: any = new Brush(slotGeo);
            if (brush.updateMatrixWorld) brush.updateMatrixWorld();

            if (!toolBrush) {
                toolBrush = brush;
            } else {
                const nextTool: any = evaluator.evaluate(toolBrush, brush, ADDITION);
                // Clean up intermediate geometry
                try {
                  if (toolBrush.geometry && toolBrush.geometry !== brush.geometry) toolBrush.geometry.dispose();
                } catch {}
                try { if (brush.geometry) brush.geometry.dispose(); } catch {}
                toolBrush = nextTool;
            }
        }

        if (!toolBrush) {
            // No slots, return original data
            const pos = base.position;
            const norm = base.normal;
            const idx = base.index;
            (self as any).postMessage({ position: pos, normal: norm, index: idx });
            return;
        }

        if (toolBrush.updateMatrixWorld) toolBrush.updateMatrixWorld();
        
        // Perform CSG subtraction
        const result: any = evaluator.evaluate(baseBrush, toolBrush, SUBTRACTION);
        
        // *** CRITICAL: Apply surgical repair to fix non-manifold edges ***
        let resGeo = result.geometry;
        const preRepairVertices = resGeo.attributes.position.count;
        
        resGeo = surgicalSlotRepair(resGeo);
        
        const postRepairVertices = resGeo.attributes.position.count;
        console.log(`Worker repair: ${preRepairVertices} → ${postRepairVertices} vertices`);
        
        // Clean up
        try { if (toolBrush.geometry) toolBrush.geometry.dispose(); } catch {}
        try { baseGeo.dispose(); } catch {}

        const position = resGeo.attributes.position.array;
        const normal = resGeo.attributes.normal?.array;
        const index = resGeo.index?.array;

        // Use Transferables for performance
        const transferables: Transferable[] = [position.buffer];
        if (normal) transferables.push(normal.buffer);
        if (index) transferables.push(index.buffer);

        (self as any).postMessage({
            position,
            normal,
            index
        }, transferables);

    } catch (error) {
        console.error("Worker CSG Error:", error);
        // Fallback: return original if calculation fails
        (self as any).postMessage({ 
            position: base.position, 
            normal: base.normal, 
            index: base.index 
        });
    }
};
