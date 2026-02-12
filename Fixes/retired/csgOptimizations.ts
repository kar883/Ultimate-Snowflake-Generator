import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils';

/**
 * CSG-SPECIFIC OPTIMIZATIONS
 * 
 * These functions dramatically improve slot cutting performance by:
 * 1. Filtering out non-intersecting slots
 * 2. Merging multiple slots into single CSG operand
 * 3. Preprocessing geometries for optimal CSG
 */

/**
 * Smart slot filtering - only cut with slots that actually intersect
 * This prevents expensive CSG operations on slots that don't affect the geometry
 */
export function filterIntersectingSlots(
  baseGeometry: THREE.BufferGeometry,
  slotGeometries: THREE.BufferGeometry[],
  rotation: { x?: number; y?: number; z?: number }
): THREE.BufferGeometry[] {
  
  if (!baseGeometry.boundingBox) {
    baseGeometry.computeBoundingBox();
  }
  
  const baseBB = baseGeometry.boundingBox!.clone();
  
  // Build rotation matrix
  const rotX = (rotation.x || 0) * Math.PI / 180;
  const rotY = (rotation.y || 0) * Math.PI / 180;
  const rotZ = (rotation.z || 0) * Math.PI / 180;
  
  const rotMat = new THREE.Matrix4()
    .makeRotationX(rotX)
    .multiply(new THREE.Matrix4().makeRotationY(rotY))
    .multiply(new THREE.Matrix4().makeRotationZ(rotZ));
  
  const intersecting: THREE.BufferGeometry[] = [];
  let filtered = 0;
  
  for (const slot of slotGeometries) {
    const rotated = slot.clone();
    rotated.applyMatrix4(rotMat);
    rotated.computeBoundingBox();
    
    // Generous padding for edge cases (1.0 unit padding)
    const slotBB = rotated.boundingBox!.clone().expandByScalar(1.0);
    
    if (baseBB.intersectsBox(slotBB)) {
      intersecting.push(slot);
    } else {
      filtered++;
    }
    
    rotated.dispose();
  }
  
  if (filtered > 0) {
    console.log(`⚡ Filtered ${filtered} non-intersecting slots (${intersecting.length} remain)`);
  }
  
  return intersecting;
}

/**
 * Merge all slots into single geometry before CSG
 * This MASSIVELY speeds up CSG operations
 * 
 * Instead of: base - slot1 - slot2 - slot3 - slot4 - slot5
 * We do: base - (slot1 + slot2 + slot3 + slot4 + slot5)
 * 
 * Performance improvement: 3-10x faster
 */
export function mergeSlotGeometries(slots: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (slots.length === 0) {
    throw new Error('No slots to merge');
  }
  
  if (slots.length === 1) {
    return slots[0];
  }
  
  console.log(`⚡ Merging ${slots.length} slots into single CSG operand`);
  
  const merged = BufferGeometryUtils.mergeGeometries(slots, false);
  
  if (!merged) {
    throw new Error('Failed to merge slot geometries');
  }
  
  // Optimize merged geometry
  merged.computeBoundingBox();
  merged.computeVertexNormals();
  
  return merged;
}

/**
 * Pre-process slot geometries for optimal CSG performance
 * 
 * This ensures slots have:
 * - Proper vertex normals
 * - Bounding boxes computed
 * - Merged vertices to reduce complexity
 */
export function preprocessSlotGeometries(
  slots: THREE.BufferGeometry[]
): THREE.BufferGeometry[] {
  
  console.log(`⚡ Preprocessing ${slots.length} slot geometries`);
  
  return slots.map((slot, i) => {
    // Ensure proper normals
    if (!slot.attributes.normal) {
      slot.computeVertexNormals();
    }
    
    // Ensure bounding box
    if (!slot.boundingBox) {
      slot.computeBoundingBox();
    }
    
    // Merge vertices to reduce complexity (conservative tolerance)
    const optimized = BufferGeometryUtils.mergeVertices(slot.clone(), 0.001);
    
    return optimized;
  });
}

/**
 * Batch-optimize slot creation
 * This function takes the slot creation parameters and optimizes the entire pipeline
 */
export function optimizedSlotPipeline(
  baseGeometry: THREE.BufferGeometry,
  slotGeometries: THREE.BufferGeometry[],
  rotation: { x?: number; y?: number; z?: number }
): {
  mergedSlots: THREE.BufferGeometry | null;
  shouldSkipCSG: boolean;
} {
  
  if (slotGeometries.length === 0) {
    return { mergedSlots: null, shouldSkipCSG: true };
  }
  
  // Step 1: Preprocess all slots
  const preprocessed = preprocessSlotGeometries(slotGeometries);
  
  // Step 2: Filter by intersection
  const intersecting = filterIntersectingSlots(baseGeometry, preprocessed, rotation);
  
  // Dispose non-intersecting slots
  preprocessed.forEach(slot => {
    if (!intersecting.includes(slot)) {
      slot.dispose();
    }
  });
  
  if (intersecting.length === 0) {
    console.log('⚡ No intersecting slots - skipping CSG entirely');
    return { mergedSlots: null, shouldSkipCSG: true };
  }
  
  // Step 3: Merge all intersecting slots
  const merged = mergeSlotGeometries(intersecting);
  
  return { mergedSlots: merged, shouldSkipCSG: false };
}

/**
 * Estimate CSG complexity to decide on optimization strategy
 */
export function estimateCSGComplexity(
  baseGeometry: THREE.BufferGeometry,
  slotGeometries: THREE.BufferGeometry[]
): {
  baseFaces: number;
  slotFaces: number;
  totalComplexity: number;
  shouldMergeSlots: boolean;
} {
  
  const baseFaces = baseGeometry.index ? baseGeometry.index.count / 3 : 0;
  const slotFaces = slotGeometries.reduce((sum, slot) => {
    return sum + (slot.index ? slot.index.count / 3 : 0);
  }, 0);
  
  // Simple complexity estimate: O(base * slots)
  const totalComplexity = baseFaces * slotFaces;
  
  // If we have multiple slots, merging is almost always beneficial
  const shouldMergeSlots = slotGeometries.length > 1;
  
  return {
    baseFaces,
    slotFaces,
    totalComplexity,
    shouldMergeSlots
  };
}
