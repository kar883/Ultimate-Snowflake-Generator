import * as THREE from 'three';

// Streaming geometry manager for real-time visual feedback
export class StreamingGeometryManager {
  private scene: THREE.Scene;
  private pendingMeshes: Map<string, THREE.Mesh> = new Map();
  private updateCallbacks: Set<(progress: number, stage: string) => void> = new Set();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  // Add progress callback
  onProgress(callback: (progress: number, stage: string) => void) {
    this.updateCallbacks.add(callback);
  }

  // Remove progress callback
  offProgress(callback: (progress: number, stage: string) => void) {
    this.updateCallbacks.delete(callback);
  }

  // Notify progress updates
  private notifyProgress(progress: number, stage: string) {
    this.updateCallbacks.forEach(callback => callback(progress, stage));
  }

  // Add a mesh immediately for instant visual feedback
  addMesh(id: string, geometry: THREE.BufferGeometry, material: THREE.Material, position?: THREE.Vector3) {
    const mesh = new THREE.Mesh(geometry, material);
    if (position) {
      mesh.position.copy(position);
    }
    
    this.pendingMeshes.set(id, mesh);
    this.scene.add(mesh);
    
    return mesh;
  }

  // Update an existing mesh (for progressive refinement)
  updateMesh(id: string, geometry: THREE.BufferGeometry) {
    const mesh = this.pendingMeshes.get(id);
    if (mesh) {
      mesh.geometry.dispose();
      mesh.geometry = geometry;
    }
  }

  // Remove a mesh
  removeMesh(id: string) {
    const mesh = this.pendingMeshes.get(id);
    if (mesh) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(m => m.dispose());
      } else {
        mesh.material.dispose();
      }
      this.pendingMeshes.delete(id);
    }
  }

  // Clear all pending meshes
  clear() {
    this.pendingMeshes.forEach((mesh, id) => {
      this.removeMesh(id);
    });
  }

  // Get current mesh count
  getMeshCount(): number {
    return this.pendingMeshes.size;
  }
}

// Utility for progressive mesh refinement
export class ProgressiveMeshRefiner {
  private originalGeometry: THREE.BufferGeometry;
  private levels: number = 3;

  constructor(geometry: THREE.BufferGeometry, levels: number = 3) {
    this.originalGeometry = geometry.clone();
    this.levels = levels;
  }

  // Get geometry at specific refinement level
  getGeometry(level: number): THREE.BufferGeometry {
    if (level >= this.levels) {
      return this.originalGeometry.clone();
    }

    // Create simplified version based on level
    const simplified = this.originalGeometry.clone();
    
    // Reduce vertices based on level (simplified approach)
    if (level < this.levels - 1) {
      const positions = simplified.attributes.position;
      if (positions) {
        const step = Math.pow(2, this.levels - 1 - level);
        const newPositions: number[] = [];
        
        for (let i = 0; i < positions.count; i += step) {
          newPositions.push(
            positions.getX(i),
            positions.getY(i),
            positions.getZ(i)
          );
        }
        
        simplified.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
      }
    }

    return simplified;
  }

  // Get total refinement levels
  getLevels(): number {
    return this.levels;
  }
}
