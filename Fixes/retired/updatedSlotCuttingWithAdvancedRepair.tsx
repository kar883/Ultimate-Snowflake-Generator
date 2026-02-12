// ============================================================================
// UPDATED SLOT CUTTING WITH ADVANCED REPAIR
// ============================================================================
// Replace the CSG result handling in applyCombinedSlotCuts (around line 1126-1200)

    try {
      // Apply CSG operation
      const result = await postCSGJob(baseData, slotsData, layer.rotation3D);
      const { position, normal, index } = result;
      
      let resultGeo = new THREE_ACTUAL.BufferGeometry();
      resultGeo.setAttribute('position', new THREE_ACTUAL.BufferAttribute(position, 3));
      if (normal) resultGeo.setAttribute('normal', new THREE_ACTUAL.BufferAttribute(normal, 3));
      if (index) resultGeo.setIndex(new THREE_ACTUAL.BufferAttribute(index, 1));
      
      resultGeo.computeBoundingBox();
      resultGeo.computeVertexNormals();
      
      // ========================================================================
      // CRITICAL: Apply ADVANCED geometry repair to eliminate slot cut artifacts
      // 
      // This 10-pass repair system addresses:
      // - Non-manifold edges (edges shared by >2 faces)
      // - Degenerate triangles (zero/near-zero area)
      // - Micro-edges from CSG operations
      // - Duplicate vertices from blade overlap
      // - Far-extended faces beyond model bounds
      // - Unused/orphaned vertices
      // ========================================================================
      try {
        console.log(`🔧 Applying ADVANCED repair for layer: ${layer.name || i}`);
        
        // Use advanced repair function (import from advancedGeometryRepair.ts)
        resultGeo = advancedRepairSlotCutGeometry(resultGeo);
        
        console.log(`✅ ADVANCED repair successful for layer: ${layer.name || i}`);
        
      } catch (repairError) {
        console.error(`❌ ADVANCED repair failed for layer ${layer.name || i}:`, repairError);
        
        // Fallback to aggressive basic repair if advanced fails
        try {
          console.log(`  Attempting aggressive fallback repair...`);
          
          // Aggressive fallback: multiple merge passes
          resultGeo = BufferGeometryUtils.mergeVertices(resultGeo, 0.01); // Very aggressive
          resultGeo = removeDegenerateTriangles(resultGeo, 0.001);
          resultGeo = BufferGeometryUtils.mergeVertices(resultGeo, 0.005); // Medium aggressive
          resultGeo = removeIsolatedVertices(resultGeo);
          resultGeo = BufferGeometryUtils.mergeVertices(resultGeo, 0.001); // Final merge
          
          resultGeo.computeVertexNormals();
          resultGeo.computeBoundingBox();
          
          console.log(`  ✓ Aggressive fallback successful`);
          
        } catch (fallbackError) {
          console.error(`  ❌ Aggressive fallback also failed:`, fallbackError);
          
          // Last resort: basic merge only
          try {
            resultGeo = BufferGeometryUtils.mergeVertices(resultGeo, 0.001);
            resultGeo.computeVertexNormals();
            resultGeo.computeBoundingBox();
            console.log(`  ✓ Basic merge successful`);
          } catch (basicError) {
            console.error(`  ❌ All repairs failed, using raw CSG output`);
          }
        }
      }

      results.push({ geometry: resultGeo, layer, finalPosition });
      
    } catch (error) {
      console.error(`Slot cutting failed for layer ${i}:`, error);
      // Return original geometry if cutting fails
      results.push({ geometry: layerGeo, layer, finalPosition });
    }

// ============================================================================
// HELPER FUNCTIONS (if not already imported from advancedGeometryRepair.ts)
// ============================================================================

/**
 * Simple degenerate triangle removal (fallback)
 */
function removeDegenerateTriangles(geometry: THREE_ACTUAL.BufferGeometry, threshold = 0.001): THREE_ACTUAL.BufferGeometry {
  const positions = geometry.attributes.position;
  const indices = geometry.index;
  if (!indices) return geometry;
  
  const newIndices: number[] = [];
  const v0 = new THREE_ACTUAL.Vector3();
  const v1 = new THREE_ACTUAL.Vector3();
  const v2 = new THREE_ACTUAL.Vector3();
  const edge1 = new THREE_ACTUAL.Vector3();
  const edge2 = new THREE_ACTUAL.Vector3();
  const cross = new THREE_ACTUAL.Vector3();
  
  for (let i = 0; i < indices.count; i += 3) {
    const i0 = indices.getX(i);
    const i1 = indices.getX(i + 1);
    const i2 = indices.getX(i + 2);
    
    if (i0 === i1 || i1 === i2 || i2 === i0) continue;
    
    v0.fromBufferAttribute(positions as THREE_ACTUAL.BufferAttribute, i0);
    v1.fromBufferAttribute(positions as THREE_ACTUAL.BufferAttribute, i1);
    v2.fromBufferAttribute(positions as THREE_ACTUAL.BufferAttribute, i2);
    
    edge1.subVectors(v1, v0);
    edge2.subVectors(v2, v0);
    cross.crossVectors(edge1, edge2);
    
    const area = cross.length() * 0.5;
    if (area > threshold) {
      newIndices.push(i0, i1, i2);
    }
  }
  
  const newGeo = geometry.clone();
  newGeo.setIndex(newIndices);
  return newGeo;
}

/**
 * Simple isolated vertex removal (fallback)
 */
function removeIsolatedVertices(geometry: THREE_ACTUAL.BufferGeometry): THREE_ACTUAL.BufferGeometry {
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
  
  const newGeo = new THREE_ACTUAL.BufferGeometry();
  newGeo.setAttribute('position', new THREE_ACTUAL.Float32BufferAttribute(newPositions, 3));
  if (normals) {
    newGeo.setAttribute('normal', new THREE_ACTUAL.Float32BufferAttribute(newNormals, 3));
  }
  newGeo.setIndex(newIndices);
  
  return newGeo;
}
