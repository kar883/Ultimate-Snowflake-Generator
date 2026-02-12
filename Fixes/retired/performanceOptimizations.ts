import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils';

/**
 * PERFORMANCE OPTIMIZATION UTILITIES
 * 
 * These functions improve overall 3D model rendering performance:
 * 1. Progressive layer building
 * 2. Parallel processing
 * 3. Lazy computation
 * 4. Geometry batching
 */

/**
 * Progressive layer builder
 * Yields control back to main thread between layers
 * This keeps the UI responsive during long computations
 */
export async function buildLayersProgressively<T, R>(
  items: T[],
  buildItem: (item: T, index: number) => Promise<R>,
  onItemComplete?: (index: number, result: R, total: number) => void
): Promise<R[]> {
  
  const results: R[] = [];
  const total = items.length;
  
  for (let i = 0; i < items.length; i++) {
    console.log(`⚡ Building item ${i + 1}/${total}`);
    
    const result = await buildItem(items[i], i);
    results.push(result);
    
    // Call progress callback
    if (onItemComplete) {
      onItemComplete(i, result, total);
    }
    
    // Yield to main thread to keep UI responsive
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  
  return results;
}

/**
 * Batch multiple geometries into a single merged geometry
 * This reduces draw calls and improves rendering performance
 */
export function batchGeometries(
  geometries: THREE.BufferGeometry[],
  disposeSources: boolean = true
): THREE.BufferGeometry {
  
  if (geometries.length === 0) {
    return new THREE.BufferGeometry();
  }
  
  if (geometries.length === 1) {
    return geometries[0];
  }
  
  console.log(`⚡ Batching ${geometries.length} geometries into single mesh`);
  
  const batched = BufferGeometryUtils.mergeGeometries(geometries, false);
  
  if (!batched) {
    throw new Error('Failed to batch geometries');
  }
  
  // Dispose originals if requested
  if (disposeSources) {
    geometries.forEach(g => {
      try {
        g.dispose();
      } catch (e) {
        console.warn('Failed to dispose geometry during batching:', e);
      }
    });
  }
  
  return batched;
}

/**
 * Lazy bounding box computation
 * Only compute when actually needed
 */
export class LazyBoundingBox {
  private geometry: THREE.BufferGeometry;
  private computed: boolean = false;
  
  constructor(geometry: THREE.BufferGeometry) {
    this.geometry = geometry;
  }
  
  get box(): THREE.Box3 {
    if (!this.computed) {
      this.geometry.computeBoundingBox();
      this.computed = true;
    }
    return this.geometry.boundingBox!;
  }
  
  reset(): void {
    this.computed = false;
  }
}

/**
 * Geometry cache with automatic disposal
 */
export class GeometryCache<T = string> {
  private cache = new Map<T, THREE.BufferGeometry>();
  private maxSize: number;
  
  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }
  
  get(key: T): THREE.BufferGeometry | undefined {
    const geo = this.cache.get(key);
    return geo ? geo.clone() : undefined;
  }
  
  set(key: T, geometry: THREE.BufferGeometry): void {
    // Enforce max size (LRU-style)
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      const old = this.cache.get(firstKey);
      if (old) {
        old.dispose();
      }
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, geometry.clone());
  }
  
  has(key: T): boolean {
    return this.cache.has(key);
  }
  
  clear(): void {
    this.cache.forEach(geo => geo.dispose());
    this.cache.clear();
  }
  
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize
    };
  }
}

/**
 * Performance monitor for profiling
 */
export class PerformanceMonitor {
  private timings: Map<string, number[]> = new Map();
  
  start(label: string): () => void {
    const startTime = performance.now();
    
    return () => {
      const elapsed = performance.now() - startTime;
      
      if (!this.timings.has(label)) {
        this.timings.set(label, []);
      }
      
      this.timings.get(label)!.push(elapsed);
    };
  }
  
  getStats(label: string): {
    count: number;
    total: number;
    avg: number;
    min: number;
    max: number;
  } | null {
    const times = this.timings.get(label);
    if (!times || times.length === 0) return null;
    
    const total = times.reduce((sum, t) => sum + t, 0);
    const avg = total / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);
    
    return {
      count: times.length,
      total,
      avg,
      min,
      max
    };
  }
  
  report(): void {
    console.log('⚡ PERFORMANCE REPORT:');
    this.timings.forEach((times, label) => {
      const stats = this.getStats(label);
      if (stats) {
        console.log(`  ${label}:`);
        console.log(`    Count: ${stats.count}`);
        console.log(`    Total: ${stats.total.toFixed(1)}ms`);
        console.log(`    Avg: ${stats.avg.toFixed(1)}ms`);
        console.log(`    Min: ${stats.min.toFixed(1)}ms`);
        console.log(`    Max: ${stats.max.toFixed(1)}ms`);
      }
    });
  }
  
  reset(): void {
    this.timings.clear();
  }
}

/**
 * Parallel worker pool for CSG operations
 */
export class ParallelCSGProcessor {
  private maxWorkers: number;
  private queue: Array<{
    base: any;
    slots: any[];
    rotation: any;
    resolve: (result: any) => void;
    reject: (error: any) => void;
  }> = [];
  private activeWorkers: number = 0;
  
  constructor(maxWorkers: number = 4) {
    this.maxWorkers = Math.min(maxWorkers, navigator.hardwareConcurrency || 4);
    console.log(`⚡ Parallel CSG processor initialized with ${this.maxWorkers} workers`);
  }
  
  async processCSG(
    base: any,
    slots: any[],
    rotation: any,
    postCSGJob: (base: any, slots: any[], rotation: any) => Promise<any>
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      this.queue.push({ base, slots, rotation, resolve, reject });
      this.processQueue(postCSGJob);
    });
  }
  
  private async processQueue(
    postCSGJob: (base: any, slots: any[], rotation: any) => Promise<any>
  ): Promise<void> {
    while (this.queue.length > 0 && this.activeWorkers < this.maxWorkers) {
      const job = this.queue.shift();
      if (!job) break;
      
      this.activeWorkers++;
      
      try {
        const result = await postCSGJob(job.base, job.slots, job.rotation);
        job.resolve(result);
      } catch (error) {
        job.reject(error);
      } finally {
        this.activeWorkers--;
        this.processQueue(postCSGJob); // Process next job
      }
    }
  }
  
  getStatus(): { active: number; queued: number; capacity: number } {
    return {
      active: this.activeWorkers,
      queued: this.queue.length,
      capacity: this.maxWorkers
    };
  }
}

/**
 * Debounced async function executor
 * Prevents redundant computations
 */
export class DebouncedExecutor<T> {
  private timeout: NodeJS.Timeout | null = null;
  private delay: number;
  
  constructor(delay: number = 300) {
    this.delay = delay;
  }
  
  execute(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      if (this.timeout) {
        clearTimeout(this.timeout);
      }
      
      this.timeout = setTimeout(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      }, this.delay);
    });
  }
  
  cancel(): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }
}

/**
 * Memory-efficient geometry simplification
 * Reduces vertex/face count for faster processing
 */
export function simplifyGeometry(
  geometry: THREE.BufferGeometry,
  targetReduction: number = 0.5
): THREE.BufferGeometry {
  
  console.log(`⚡ Simplifying geometry (target reduction: ${(targetReduction * 100).toFixed(0)}%)`);
  
  const originalVertices = geometry.attributes.position.count;
  
  // Use aggressive vertex merging as a form of simplification
  const simplified = BufferGeometryUtils.mergeVertices(geometry, 0.01);
  
  const newVertices = simplified.attributes.position.count;
  const reduction = (originalVertices - newVertices) / originalVertices;
  
  console.log(`  ✓ Reduced from ${originalVertices} to ${newVertices} vertices (${(reduction * 100).toFixed(1)}%)`);
  
  return simplified;
}
