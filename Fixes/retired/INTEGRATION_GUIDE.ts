/**
 * INTEGRATION GUIDE: Surgical Slot Repair
 * 
 * How to integrate the new surgical repair into your existing codebase
 */

import { surgicalSlotRepair, aggressiveSlotRepair, getTopologyReport } from './surgicalSlotRepair';
import * as THREE from 'three';

/**
 * STEP 1: Replace in csg.worker.ts
 * 
 * After CSG subtraction, apply surgical repair before sending back
 */

// OLD CODE (in csg.worker.ts):
/*
const result: any = evaluator.evaluate(baseBrush, toolBrush, SUBTRACTION);
const resGeo = result.geometry;
*/

// NEW CODE:
/*
import { surgicalSlotRepair } from './surgicalSlotRepair';

const result: any = evaluator.evaluate(baseBrush, toolBrush, SUBTRACTION);
let resGeo = result.geometry;

// Apply surgical repair to fix non-manifold edges
resGeo = surgicalSlotRepair(resGeo);

const position = resGeo.attributes.position.array;
const normal = resGeo.attributes.normal?.array;
const index = resGeo.index?.array;
*/

/**
 * STEP 2: Replace in your main mesh generation code
 * 
 * Wherever you receive geometry back from the worker, verify it's clean
 */

// Example integration:
export async function generateSlotCutMesh(
  baseGeometry: THREE.BufferGeometry,
  slotGeometries: THREE.BufferGeometry[],
  rotation: any
): Promise<THREE.BufferGeometry> {
  
  // Serialize geometries for worker
  const baseData = {
    position: baseGeometry.attributes.position.array,
    normal: baseGeometry.attributes.normal?.array,
    index: baseGeometry.index?.array
  };
  
  const slotData = slotGeometries.map(geo => ({
    position: geo.attributes.position.array,
    normal: geo.attributes.normal?.array,
    index: geo.index?.array
  }));
  
  // Send to worker (your existing code)
  const result = await postCSGJob(baseData, slotData, rotation);
  
  // Reconstruct geometry
  const resultGeo = new THREE.BufferGeometry();
  resultGeo.setAttribute('position', new THREE.Float32BufferAttribute(result.position, 3));
  if (result.normal) {
    resultGeo.setAttribute('normal', new THREE.Float32BufferAttribute(result.normal, 3));
  }
  if (result.index) {
    resultGeo.setIndex(new THREE.BufferAttribute(result.index, 1));
  }
  
  // Get topology report BEFORE repair
  console.log('Before repair:', getTopologyReport(resultGeo));
  
  // Apply surgical repair
  const repairedGeo = surgicalSlotRepair(resultGeo);
  
  // Get topology report AFTER repair
  const report = getTopologyReport(repairedGeo);
  console.log('After repair:', report);
  
  // If still have non-manifold edges, try aggressive repair
  if (report.nonManifoldEdges > 100) {
    console.warn('⚠️  Surgical repair left too many non-manifold edges, trying aggressive repair');
    const aggressiveResult = aggressiveSlotRepair(resultGeo);
    const aggressiveReport = getTopologyReport(aggressiveResult);
    console.log('After aggressive repair:', aggressiveReport);
    
    // Use whichever result is better
    return aggressiveReport.nonManifoldEdges < report.nonManifoldEdges 
      ? aggressiveResult 
      : repairedGeo;
  }
  
  return repairedGeo;
}

/**
 * STEP 3: Update your export code
 * 
 * Before exporting, run one final verification and repair if needed
 */

export function prepareForExport(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  // Get current state
  const report = getTopologyReport(geometry);
  console.log('Export preparation - Current topology:', report);
  
  if (!report.isManifold) {
    console.warn(`⚠️  Geometry has ${report.nonManifoldEdges} non-manifold edges - repairing before export`);
    
    // Try surgical repair first
    let repaired = surgicalSlotRepair(geometry);
    let repairedReport = getTopologyReport(repaired);
    
    // If still bad, try aggressive
    if (repairedReport.nonManifoldEdges > 10) {
      console.warn('⚠️  Surgical repair insufficient, trying aggressive repair');
      repaired = aggressiveSlotRepair(geometry);
      repairedReport = getTopologyReport(repaired);
    }
    
    console.log('After export preparation:', repairedReport);
    return repaired;
  }
  
  console.log('✅ Geometry is already manifold, no repair needed');
  return geometry;
}

/**
 * DEBUGGING: If you still have issues
 * 
 * The surgical repair uses VERY tight tolerances (0.0001 - 0.0002)
 * to preserve detail. If you're still seeing non-manifold edges:
 * 
 * 1. Check the topology report to see WHERE the problem is
 * 2. Try the aggressive repair (uses 0.001 tolerance)
 * 3. Look at your CSG operation - maybe the slot geometry itself has issues
 * 4. Consider if your slicer is being too strict with its manifold check
 */

/**
 * TOLERANCE TUNING
 * 
 * The key tolerances in surgicalSlotRepair:
 * 
 * - Degenerate triangle area: 0.00001 (very small triangles removed)
 * - Coincident vertex welding: 0.0001 (vertices must be nearly identical)
 * - Final merge: 0.0002 (catches remaining near-duplicates)
 * 
 * If you need to preserve MORE detail, make these smaller.
 * If you need to be MORE aggressive, make them larger.
 * 
 * Example - preserve maximum detail:
 */
export function ultraPreciseRepair(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  // Use even tighter tolerances
  // Modify the constants in surgicalSlotRepair.ts:
  // - degenerateArea: 0.000001
  // - weldTolerance: 0.00005
  // - mergeTolerance: 0.0001
  
  return surgicalSlotRepair(geometry);
}

/**
 * Example - be more aggressive:
 */
export function robustRepair(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  // Use looser tolerances
  // Modify the constants in surgicalSlotRepair.ts:
  // - degenerateArea: 0.0001
  // - weldTolerance: 0.0005
  // - mergeTolerance: 0.001
  
  return surgicalSlotRepair(geometry);
}

/**
 * PERFORMANCE NOTE
 * 
 * The surgical repair is O(n) for most operations thanks to spatial hashing.
 * It should be fast even on large meshes (100k+ vertices).
 * 
 * If performance is an issue, you can:
 * 1. Only repair geometries that will be exported (not preview)
 * 2. Cache the repaired geometry
 * 3. Run repair in the worker thread
 */
