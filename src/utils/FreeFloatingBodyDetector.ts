import * as THREE from 'three';

// Advanced free floating body detection based on actual 3D geometry analysis
export class FreeFloatingBodyDetector {
  
  // Analyze a mesh to detect disconnected components - optimized for complex geometries
  static analyzeMesh(mesh: THREE.Mesh, layerName: string): boolean {
    if (!mesh.geometry) return false;
    
    const geometry = mesh.geometry;
    const positions = geometry.attributes.position;
    const index = geometry.index;
    
    if (!positions || !index) return false;
    
    // Quick check: if geometry is too complex, skip detailed analysis
    const vertexCount = positions.count;
    const triangleCount = index.count / 3;
    
    // Skip analysis for very complex geometries (likely to timeout)
    if (vertexCount > 10000 || triangleCount > 20000) {
      console.log(`⚡ Skipping free floating detection for ${layerName}: too complex (${vertexCount} vertices, ${triangleCount} triangles)`);
      return false;
    }
    
    // Build adjacency graph to find connected components
    const components = this.findConnectedComponents(geometry);
    
    // If we have multiple components, analyze their properties
    if (components.length > 1) {
      return this.hasSmallDisconnectedComponents(components, geometry);
    }
    
    return false;
  }
  
  // Find connected components in the mesh using edge connectivity - optimized
  private static findConnectedComponents(geometry: THREE.BufferGeometry): number[][] {
    const positions = geometry.attributes.position;
    const index = geometry.index;
    
    if (!positions || !index) return [];
    
    const vertexCount = positions.count;
    const triangleCount = index.count / 3;
    
    // Performance optimization: limit analysis for complex geometries
    const maxTriangles = 10000;
    if (triangleCount > maxTriangles) {
      console.log(`⚡ Skipping component analysis: ${triangleCount} triangles exceeds limit of ${maxTriangles}`);
      return []; // Return single component (no free floating detection)
    }
    
    const visited = new Array(vertexCount).fill(false);
    const components: number[][] = [];
    
    // Build adjacency list more efficiently
    const adjacency = this.buildAdjacencyList(geometry);
    
    // Find connected components with early termination
    for (let i = 0; i < vertexCount; i++) {
      if (!visited[i]) {
        const component: number[] = [];
        this.dfs(i, adjacency, visited, component);
        
        // Early termination: if we find too many small components, stop
        if (components.length >= 10) {
          console.log(`⚡ Early termination: found ${components.length} components, stopping analysis`);
          break;
        }
        
        components.push(component);
      }
    }
    
    return components;
  }
  
  // Build adjacency list from triangle faces
  private static buildAdjacencyList(geometry: THREE.BufferGeometry): Map<number, Set<number>> {
    const positions = geometry.attributes.position;
    const index = geometry.index;
    
    if (!positions || !index) return new Map();
    
    const adjacency = new Map<number, Set<number>>();
    const vertexCount = positions.count;
    
    // Initialize adjacency list
    for (let i = 0; i < vertexCount; i++) {
      adjacency.set(i, new Set());
    }
    
    // Process each triangle face
    for (let i = 0; i < index.count; i += 3) {
      const v1 = index.getX(i);
      const v2 = index.getX(i + 1);
      const v3 = index.getX(i + 2);
      
      // Add edges (undirected)
      adjacency.get(v1)!.add(v2);
      adjacency.get(v1)!.add(v3);
      adjacency.get(v2)!.add(v1);
      adjacency.get(v2)!.add(v3);
      adjacency.get(v3)!.add(v1);
      adjacency.get(v3)!.add(v2);
    }
    
    return adjacency;
  }
  
  // Depth-first search to find connected component
  private static dfs(vertex: number, adjacency: Map<number, Set<number>>, visited: boolean[], component: number[]): void {
    visited[vertex] = true;
    component.push(vertex);
    
    const neighbors = adjacency.get(vertex);
    if (neighbors) {
      for (const neighbor of neighbors) {
        if (!visited[neighbor]) {
          this.dfs(neighbor, adjacency, visited, component);
        }
      }
    }
  }
  
  // Analyze components to identify small disconnected ones
  private static hasSmallDisconnectedComponents(components: number[][], geometry: THREE.BufferGeometry): boolean {
    if (components.length <= 1) return false;
    
    const positions = geometry.attributes.position;
    if (!positions) return false;
    
    // Calculate bounding boxes and volumes for each component
    const componentInfo = components.map(component => {
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      let minZ = Infinity, maxZ = -Infinity;
      
      for (const vertexIndex of component) {
        const x = positions.getX(vertexIndex);
        const y = positions.getY(vertexIndex);
        const z = positions.getZ(vertexIndex);
        
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
      }
      
      const volume = (maxX - minX) * (maxY - minY) * (maxZ - minZ);
      const vertexCount = component.length;
      
      return {
        vertexCount,
        volume,
        boundingBox: { minX, maxX, minY, maxY, minZ, maxZ }
      };
    });
    
    // Sort by volume (largest first)
    componentInfo.sort((a, b) => b.volume - a.volume);
    
    // Check if smaller components exist (potential free floating bodies)
    const largestComponent = componentInfo[0];
    const thresholdRatio = 0.3; // Small components are less than 30% of largest
    
    for (let i = 1; i < componentInfo.length; i++) {
      const component = componentInfo[i];
      const volumeRatio = component.volume / largestComponent.volume;
      const vertexRatio = component.vertexCount / largestComponent.vertexCount;
      
      // If component is significantly smaller, it's likely a free floating body
      if (volumeRatio < thresholdRatio && vertexRatio < thresholdRatio) {
        return true;
      }
    }
    
    return false;
  }
  
  // Enhanced detection for text-based components
  static analyzeTextComponent(text: string, fontSize: number, mesh?: THREE.Mesh): boolean {
    // Heuristic for text components like "now" in "Snow"
    const words = text.trim().split(/\s+/);
    const shortWords = words.filter(word => word.length <= 3);
    
    // Check for patterns that indicate disconnected components
    const hasShortWords = shortWords.length > 0;
    const isSmallFont = fontSize < 15; // Adjust based on your typical font sizes
    const hasMultipleWords = words.length > 1;
    
    // If we have mesh data, use geometric analysis
    if (mesh) {
      return this.analyzeMesh(mesh, text);
    }
    
    // Fallback to heuristic analysis
    return hasShortWords && (isSmallFont || hasMultipleWords);
  }
}
