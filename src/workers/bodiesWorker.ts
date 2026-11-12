// Web worker for identifying disconnected mesh bodies in 3D geometry
// Optimized for performance with progressive analysis and early termination

interface BodiesWorkerMessage {
  type: 'analyze-bodies';
  payload: {
    positionArray: Float32Array;
    indexArray?: Uint32Array | Uint16Array;
    designColor: string;
    maxVertices?: number; // Limit for performance
  };
}

interface BodiesWorkerProgress {
  type: 'bodies-progress';
  payload: {
    progress: number; // 0-1
    stage: string;
  };
}

interface BodiesWorkerResponse {
  type: 'bodies-result';
  payload: {
    bodyPerVertex: Int32Array;
    bodyCount: number;
    bodyColors: Float32Array;
    success: boolean;
    error?: string;
  };
}

// Optimized point-in-triangle test with early rejection
function ptInTri2D(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number
): boolean {
  // Quick bounding box check first
  const minX = Math.min(ax, bx, cx);
  const maxX = Math.max(ax, bx, cx);
  const minY = Math.min(ay, by, cy);
  const maxY = Math.max(ay, by, cy);
  
  if (px < minX || px > maxX || py < minY || py > maxY) {
    return false;
  }
  
  // Sign test
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function findConnectedBodies(
  positionArray: Float32Array, 
  indexArray?: Uint32Array | Uint16Array,
  maxVertices: number = 50000
): {
  bodyPerVertex: Int32Array;
  bodyCount: number;
} {
  const origCount = positionArray.length / 3;
  
  // Adaptive sampling based on geometry size
  let targetVertices = maxVertices;
  if (origCount > 1000000) {
    targetVertices = 30000;
  } else if (origCount > 500000) {
    targetVertices = 40000;
  } else if (origCount > 200000) {
    targetVertices = 50000;
  }
  
  // Sample if geometry is too large
  let workingPositions = positionArray;
  let workingCount = origCount;
  let vertexMap: Int32Array | null = null;
  
  if (origCount > targetVertices) {
    console.warn(`⚠️ Geometry very large (${origCount.toLocaleString()} vertices), implementing adaptive sampling to ${targetVertices.toLocaleString()}`);
    
    const sampleRate = Math.ceil(origCount / targetVertices);
    const sampledCount = Math.floor(origCount / sampleRate);
    
    workingPositions = new Float32Array(sampledCount * 3);
    vertexMap = new Int32Array(origCount).fill(-1);
    
    let sampleIndex = 0;
    for (let i = 0; i < origCount && sampleIndex < sampledCount; i += sampleRate) {
      workingPositions[sampleIndex * 3] = positionArray[i * 3];
      workingPositions[sampleIndex * 3 + 1] = positionArray[i * 3 + 1];
      workingPositions[sampleIndex * 3 + 2] = positionArray[i * 3 + 2];
      vertexMap[i] = sampleIndex;
      sampleIndex++;
    }
    
    workingCount = sampledCount;
  }
  
  // Use spatial proximity to detect connected bodies
  // This is more reliable than triangle adjacency for detecting disconnected components
  const TOUCH_TOLERANCE = 0.1; // 0.1mm tolerance for touching
  const bodyPerVertex = new Int32Array(workingCount).fill(-1);
  let bodyCount = 0;
  
  // Build spatial grid for fast proximity queries
  const bounds = {
    minX: Infinity, maxX: -Infinity,
    minY: Infinity, maxY: -Infinity,
    minZ: Infinity, maxZ: -Infinity
  };
  
  for (let i = 0; i < workingCount; i++) {
    const x = workingPositions[i * 3];
    const y = workingPositions[i * 3 + 1];
    const z = workingPositions[i * 3 + 2];
    bounds.minX = Math.min(bounds.minX, x);
    bounds.maxX = Math.max(bounds.maxX, x);
    bounds.minY = Math.min(bounds.minY, y);
    bounds.maxY = Math.max(bounds.maxY, y);
    bounds.minZ = Math.min(bounds.minZ, z);
    bounds.maxZ = Math.max(bounds.maxZ, z);
  }
  
  const gridSize = TOUCH_TOLERANCE * 2;
  const gridWidth = Math.ceil((bounds.maxX - bounds.minX) / gridSize);
  const gridHeight = Math.ceil((bounds.maxY - bounds.minY) / gridSize);
  const gridDepth = Math.ceil((bounds.maxZ - bounds.minZ) / gridSize);
  
  const spatialGrid = new Map<number, number[]>();
  
  // Function to get grid cell key
  const getGridKey = (x: number, y: number, z: number) => {
    const gx = Math.floor((x - bounds.minX) / gridSize);
    const gy = Math.floor((y - bounds.minY) / gridSize);
    const gz = Math.floor((z - bounds.minZ) / gridSize);
    return gx * gridWidth * gridDepth + gy * gridDepth + gz;
  };
  
  // Populate spatial grid
  for (let i = 0; i < workingCount; i++) {
    const x = workingPositions[i * 3];
    const y = workingPositions[i * 3 + 1];
    const z = workingPositions[i * 3 + 2];
    const key = getGridKey(x, y, z);
    
    if (!spatialGrid.has(key)) {
      spatialGrid.set(key, []);
    }
    spatialGrid.get(key)!.push(i);
  }
  
  // Find connected components using BFS on spatial proximity
  const visited = new Set<number>();
  const queue: number[] = [];
  
  self.postMessage({
    type: 'bodies-progress',
    payload: { progress: 0.3, stage: 'Finding connected bodies' }
  } as BodiesWorkerProgress);
  
  for (let start = 0; start < workingCount; start++) {
    if (visited.has(start)) continue;
    
    // Start new body
    queue.length = 0;
    queue.push(start);
    visited.add(start);
    bodyPerVertex[start] = bodyCount;
    
    let processedInBody = 0;
    
    while (queue.length > 0) {
      const current = queue.shift()!;
      processedInBody++;
      
      const cx = workingPositions[current * 3];
      const cy = workingPositions[current * 3 + 1];
      const cz = workingPositions[current * 3 + 2];
      
      // Check neighboring grid cells
      const gx = Math.floor((cx - bounds.minX) / gridSize);
      const gy = Math.floor((cy - bounds.minY) / gridSize);
      const gz = Math.floor((cz - bounds.minZ) / gridSize);
      
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dz = -1; dz <= 1; dz++) {
            const nx = gx + dx;
            const ny = gy + dy;
            const nz = gz + dz;
            
            if (nx < 0 || nx >= gridWidth || ny < 0 || ny >= gridHeight || nz < 0 || nz >= gridDepth) {
              continue;
            }
            
            const neighborKey = nx * gridWidth * gridDepth + ny * gridDepth + nz;
            const neighbors = spatialGrid.get(neighborKey);
            
            if (neighbors) {
              for (const neighbor of neighbors) {
                if (visited.has(neighbor)) continue;
                
                const nx = workingPositions[neighbor * 3];
                const ny = workingPositions[neighbor * 3 + 1];
                const nz = workingPositions[neighbor * 3 + 2];
                
                // Check if vertices are within touching distance
                const dist = Math.sqrt(
                  (cx - nx) * (cx - nx) +
                  (cy - ny) * (cy - ny) +
                  (cz - nz) * (cz - nz)
                );
                
                if (dist <= TOUCH_TOLERANCE) {
                  visited.add(neighbor);
                  bodyPerVertex[neighbor] = bodyCount;
                  queue.push(neighbor);
                }
              }
            }
          }
        }
      }
      
      // Progress reporting
      if (processedInBody % 1000 === 0) {
        self.postMessage({
          type: 'bodies-progress',
          payload: { 
            progress: 0.3 + (start / workingCount) * 0.6, 
            stage: `Finding connected bodies (${bodyCount + 1})` 
          }
        } as BodiesWorkerProgress);
      }
    }
    
    bodyCount++;
  }
  
  // Map back to original vertices if we sampled
  if (vertexMap) {
    const originalBodyPerVertex = new Int32Array(origCount);
    for (let i = 0; i < origCount; i++) {
      if (vertexMap[i] !== -1) {
        originalBodyPerVertex[i] = bodyPerVertex[vertexMap[i]];
      } else {
        // Find nearest sampled vertex
        let nearestSample = 0;
        let minDist = Infinity;
        const x = positionArray[i * 3];
        const y = positionArray[i * 3 + 1];
        
        for (let j = 0; j < workingCount; j++) {
          const sx = workingPositions[j * 3];
          const sy = workingPositions[j * 3 + 1];
          const dist = (x - sx) * (x - sx) + (y - sy) * (y - sy);
          if (dist < minDist) {
            minDist = dist;
            nearestSample = j;
          }
        }
        
        originalBodyPerVertex[i] = bodyPerVertex[nearestSample];
      }
    }
    
    console.log(`✅ Spatial analysis complete: ${bodyCount} bodies found from ${origCount.toLocaleString()} → ${workingCount.toLocaleString()} vertices (${(workingCount/origCount*100).toFixed(1)}%)`);
    return { bodyPerVertex: originalBodyPerVertex, bodyCount };
  }
  
  console.log(`✅ Spatial analysis complete: ${bodyCount} bodies found from ${workingCount.toLocaleString()} vertices`);
  return { bodyPerVertex, bodyCount };
}

function buildBodyColors(
  bodyPerVertex: Int32Array,
  bodyCount: number,
  designColor: string
): Float32Array {
  const FLOAT_PALETTE = [
    [1.0, 0.09, 0.27], // red
    [1.0, 0.92, 0.0], // yellow
    [0.0, 0.9, 0.46], // green
    [0.88, 0.25, 0.98], // purple
    [1.0, 0.43, 0.0], // orange
    [0.0, 0.69, 1.0], // light blue
    [0.96, 0.0, 0.34], // pink
    [0.46, 1.0, 0.01], // lime
    [0.11, 0.91, 0.71], // teal
    [0.57, 0.57, 0.0], // amber
  ];

  const posCount = bodyPerVertex.length;

  const sizes = new Int32Array(bodyCount);
  for (let i = 0; i < posCount; i++) if (bodyPerVertex[i] >= 0) sizes[bodyPerVertex[i]]++;
  let mainBody = 0;
  let maxSize = 0;
  for (let b = 0; b < bodyCount; b++) {
    if (sizes[b] > maxSize) { maxSize = sizes[b]; mainBody = b; }
  }

  // Parse design color
  const mainCol = new Float32Array(3);
  if (designColor.startsWith('#')) {
    const hex = designColor.slice(1);
    mainCol[0] = parseInt(hex.slice(0, 2), 16) / 255;
    mainCol[1] = parseInt(hex.slice(2, 4), 16) / 255;
    mainCol[2] = parseInt(hex.slice(4, 6), 16) / 255;
  }

  const bodyToColor = new Array<Float32Array>(bodyCount);
  let slot = 0;
  for (let b = 0; b < bodyCount; b++) {
    bodyToColor[b] = (b === mainBody) ? mainCol : new Float32Array(FLOAT_PALETTE[slot++ % FLOAT_PALETTE.length]);
  }

  const arr = new Float32Array(posCount * 3);
  for (let i = 0; i < posCount; i++) {
    const c = bodyPerVertex[i] >= 0 ? bodyToColor[bodyPerVertex[i]] : mainCol;
    arr[i * 3] = c[0]; arr[i * 3 + 1] = c[1]; arr[i * 3 + 2] = c[2];
  }
  return arr;
}

// Handle messages from main thread
self.addEventListener('message', (event: MessageEvent<BodiesWorkerMessage>) => {
  const { type, payload } = event.data;
  
  if (type === 'analyze-bodies') {
    try {
      const { positionArray, indexArray, designColor, maxVertices = 50000 } = payload;
      
      console.log(`🔍 Bodies Worker: Starting analysis of ${positionArray.length / 3} vertices`);
      
      // Run the body analysis
      const { bodyPerVertex, bodyCount } = findConnectedBodies(positionArray, indexArray, maxVertices);
      
      // Generate colors
      const bodyColors = buildBodyColors(bodyPerVertex, bodyCount, designColor);
      
      console.log(`✅ Bodies Worker: Found ${bodyCount} bodies`);
      
      // Send final progress update
      self.postMessage({
        type: 'bodies-progress',
        payload: { progress: 1.0, stage: 'Complete' }
      } as BodiesWorkerProgress);
      
      // Send result back to main thread
      const response: BodiesWorkerResponse = {
        type: 'bodies-result',
        payload: {
          bodyPerVertex,
          bodyCount,
          bodyColors,
          success: true
        }
      };
      
      self.postMessage(response);
    } catch (error) {
      console.error('❌ Bodies worker error:', error);
      const response: BodiesWorkerResponse = {
        type: 'bodies-result',
        payload: {
          bodyPerVertex: new Int32Array(0),
          bodyCount: 0,
          bodyColors: new Float32Array(0),
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      };
      self.postMessage(response);
    }
  }
});
