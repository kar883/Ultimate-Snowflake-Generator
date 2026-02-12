import * as THREE from 'three';

/**
 * BOUNDARY EDGE DIAGNOSTICS
 * 
 * Visualize where holes exist in your mesh to help debug slot cutting issues
 */

interface EdgeInfo {
  count: number;
  faces: number[];
  vertices: [number, number];
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
    
    const edges: [number, number][] = [[i0, i1], [i1, i2], [i2, i0]];
    
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
  
  return edgeMap;
}

/**
 * Create visual markers for boundary edges (holes in mesh)
 */
export function createBoundaryVisualization(geometry: THREE.BufferGeometry): THREE.Group {
  const group = new THREE.Group();
  const edgeMap = buildEdgeTopology(geometry);
  const positions = geometry.attributes.position;
  
  // Find boundary edges
  const boundaryEdges: Array<[number, number]> = [];
  
  edgeMap.forEach((info) => {
    if (info.count === 1) {
      boundaryEdges.push(info.vertices);
    }
  });
  
  console.log(`Found ${boundaryEdges.length} boundary edges (potential holes)`);
  
  if (boundaryEdges.length === 0) {
    console.log('✅ Mesh is watertight - no holes!');
    return group;
  }
  
  // Create line visualization of boundary edges
  const lineGeometry = new THREE.BufferGeometry();
  const linePositions: number[] = [];
  
  for (const [v1, v2] of boundaryEdges) {
    linePositions.push(
      positions.getX(v1), positions.getY(v1), positions.getZ(v1),
      positions.getX(v2), positions.getY(v2), positions.getZ(v2)
    );
  }
  
  lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
  
  const lineMaterial = new THREE.LineBasicMaterial({ 
    color: 0xff0000, 
    linewidth: 3,
    depthTest: false,
    depthWrite: false
  });
  
  const lineSegments = new THREE.LineSegments(lineGeometry, lineMaterial);
  group.add(lineSegments);
  
  // Create sphere markers at boundary vertices
  const boundaryVertices = new Set<number>();
  for (const [v1, v2] of boundaryEdges) {
    boundaryVertices.add(v1);
    boundaryVertices.add(v2);
  }
  
  const sphereGeometry = new THREE.SphereGeometry(0.05, 8, 8);
  const sphereMaterial = new THREE.MeshBasicMaterial({ 
    color: 0xff0000,
    depthTest: false,
    depthWrite: false
  });
  
  for (const vertexIdx of boundaryVertices) {
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.position.set(
      positions.getX(vertexIdx),
      positions.getY(vertexIdx),
      positions.getZ(vertexIdx)
    );
    group.add(sphere);
  }
  
  console.log(`Created visualization with ${boundaryEdges.length} boundary edges and ${boundaryVertices.size} vertices`);
  
  return group;
}

/**
 * Get detailed boundary analysis
 */
export function analyzeBoundaries(geometry: THREE.BufferGeometry): {
  totalEdges: number;
  boundaryEdges: number;
  interiorEdges: number;
  nonManifoldEdges: number;
  isWatertight: boolean;
  boundaryLoops: number;
  averageGapSize: number;
  maxGapSize: number;
} {
  const edgeMap = buildEdgeTopology(geometry);
  const positions = geometry.attributes.position;
  
  let boundaryEdges = 0;
  let interiorEdges = 0;
  let nonManifoldEdges = 0;
  
  const boundaryEdgeList: Array<[number, number]> = [];
  
  edgeMap.forEach((info) => {
    if (info.count === 1) {
      boundaryEdges++;
      boundaryEdgeList.push(info.vertices);
    } else if (info.count === 2) {
      interiorEdges++;
    } else {
      nonManifoldEdges++;
    }
  });
  
  // Calculate gap sizes
  let totalGapSize = 0;
  let maxGapSize = 0;
  
  for (const [v1, v2] of boundaryEdgeList) {
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
    
    const gapSize = p1.distanceTo(p2);
    totalGapSize += gapSize;
    maxGapSize = Math.max(maxGapSize, gapSize);
  }
  
  // Count boundary loops
  const adjacency = new Map<number, Set<number>>();
  
  for (const [v1, v2] of boundaryEdgeList) {
    if (!adjacency.has(v1)) adjacency.set(v1, new Set());
    if (!adjacency.has(v2)) adjacency.set(v2, new Set());
    adjacency.get(v1)!.add(v2);
    adjacency.get(v2)!.add(v1);
  }
  
  const visited = new Set<number>();
  let boundaryLoops = 0;
  
  for (const startVertex of adjacency.keys()) {
    if (!visited.has(startVertex)) {
      boundaryLoops++;
      
      // BFS to mark all vertices in this loop
      const queue = [startVertex];
      while (queue.length > 0) {
        const vertex = queue.shift()!;
        if (visited.has(vertex)) continue;
        visited.add(vertex);
        
        const neighbors = adjacency.get(vertex)!;
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            queue.push(neighbor);
          }
        }
      }
    }
  }
  
  return {
    totalEdges: edgeMap.size,
    boundaryEdges,
    interiorEdges,
    nonManifoldEdges,
    isWatertight: boundaryEdges === 0 && nonManifoldEdges === 0,
    boundaryLoops,
    averageGapSize: boundaryEdges > 0 ? totalGapSize / boundaryEdges : 0,
    maxGapSize
  };
}

/**
 * Print detailed boundary report to console
 */
export function printBoundaryReport(geometry: THREE.BufferGeometry): void {
  const analysis = analyzeBoundaries(geometry);
  
  console.log('==========================================');
  console.log('BOUNDARY EDGE ANALYSIS');
  console.log('==========================================');
  console.log(`Total Edges: ${analysis.totalEdges}`);
  console.log(`  Interior Edges (2 faces): ${analysis.interiorEdges}`);
  console.log(`  Boundary Edges (1 face): ${analysis.boundaryEdges} ${analysis.boundaryEdges > 0 ? '⚠️  HOLES' : '✅'}`);
  console.log(`  Non-Manifold Edges (3+ faces): ${analysis.nonManifoldEdges} ${analysis.nonManifoldEdges > 0 ? '⚠️  PROBLEMS' : '✅'}`);
  console.log('');
  console.log(`Watertight: ${analysis.isWatertight ? '✅ YES' : '❌ NO'}`);
  
  if (analysis.boundaryEdges > 0) {
    console.log('');
    console.log('HOLE DETAILS:');
    console.log(`  Number of boundary loops: ${analysis.boundaryLoops}`);
    console.log(`  Average gap size: ${analysis.averageGapSize.toFixed(3)} units`);
    console.log(`  Maximum gap size: ${analysis.maxGapSize.toFixed(3)} units`);
    console.log('');
    console.log('RECOMMENDATION:');
    if (analysis.maxGapSize > 1.0) {
      console.log('  ⚠️  Large gaps detected - use aggressive boundary welding (tolerance: 1.0)');
    } else if (analysis.maxGapSize > 0.5) {
      console.log('  ⚠️  Medium gaps detected - use moderate boundary welding (tolerance: 0.5)');
    } else {
      console.log('  ℹ️  Small gaps detected - use tight boundary welding (tolerance: 0.3)');
    }
  }
  
  console.log('==========================================');
}

/**
 * Usage example:
 * 
 * import { createBoundaryVisualization, printBoundaryReport } from './boundaryDiagnostics';
 * 
 * // After CSG operation:
 * const mesh = ... // your mesh
 * 
 * // Print report
 * printBoundaryReport(mesh.geometry);
 * 
 * // Add visualization to scene
 * const boundaryViz = createBoundaryVisualization(mesh.geometry);
 * boundaryViz.name = 'BoundaryVisualization';
 * scene.add(boundaryViz);
 * 
 * // Later, to remove:
 * const viz = scene.getObjectByName('BoundaryVisualization');
 * if (viz) scene.remove(viz);
 */
