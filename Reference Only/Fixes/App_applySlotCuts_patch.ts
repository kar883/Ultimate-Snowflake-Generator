/**
 * PATCH for App.tsx
 * =================
 * Replace the entire `applySlotCuts` function (lines ~688–813) with the
 * version below.  Also add the import for holeFillingRepair at the top.
 *
 * ── ADD to imports (top of App.tsx) ─────────────────────────────────────────
 *
 *   import { fillHolesManifold } from './holeFillingRepair';
 *
 * ── REPLACE `applySlotCuts` (lines ~688–813) with: ──────────────────────────
 */

// ─── Helpers used by applySlotCuts ──────────────────────────────────────────

/**
 * Parse the WorkerOutput envelope and build a THREE.BufferGeometry.
 * The CSG worker posts:
 *   { success, geometry: { positions, indices, normals }, stats }
 * Old callers mistakenly destructured { position, index } directly from `e`.
 */
function workerOutputToGeometry(
  e: any,
  fallback: THREE_ACTUAL.BufferGeometry
): THREE_ACTUAL.BufferGeometry | null {
  if (!e || !e.success || !e.geometry) {
    console.error('CSG Worker returned failure:', e?.error ?? 'unknown');
    return null;
  }
  const { positions, indices, normals } = e.geometry;
  if (!positions || positions.length === 0) {
    console.error('CSG Worker returned empty positions');
    return null;
  }
  const geo = new THREE_ACTUAL.BufferGeometry();
  geo.setAttribute(
    'position',
    new THREE_ACTUAL.BufferAttribute(new Float32Array(positions), 3)
  );
  if (normals && normals.length > 0) {
    geo.setAttribute(
      'normal',
      new THREE_ACTUAL.BufferAttribute(new Float32Array(normals), 3)
    );
  }
  if (indices && indices.length > 0) {
    geo.setIndex(
      new THREE_ACTUAL.BufferAttribute(new Uint32Array(indices), 1)
    );
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Post-process a freshly BSP-cut geometry:
 *   1. Fill open boundary loops (B)
 *   2. Attempt Manifold re-subtraction with wider merge tolerance (C)
 *
 * The slotGeometries are passed to Manifold so it can redo the boolean on
 * the now-closed mesh.  If Manifold fails, the hole-filled result is returned
 * (still valid for preview and STL export).
 */
async function postProcessCutGeometry(
  cutGeo: THREE_ACTUAL.BufferGeometry,
  slotGeometries: THREE_ACTUAL.BufferGeometry[]
): Promise<THREE_ACTUAL.BufferGeometry> {
  try {
    // Lazy import — avoids bundling manifold-3d unless actually needed
    const { fillHolesManifold } = await import('./holeFillingRepair');
    return await fillHolesManifold(cutGeo, slotGeometries);
  } catch (err) {
    console.warn('postProcessCutGeometry failed, returning raw cut geo:', err);
    return cutGeo;
  }
}

// ─── applySlotCuts ───────────────────────────────────────────────────────────

const applySlotCuts = async (
  layerGeo: THREE_ACTUAL.BufferGeometry,
  layer: LayerConfig,
  slotLength: number,
  slotWidth: number,
  extrusionDepth: number,
  bevelEnabled: boolean,
  bevelAmount: number,
  allLayers: LayerConfig[],
  globalStrokeWeight: number = 0,
  onProgress?: () => Promise<void>
): Promise<THREE_ACTUAL.BufferGeometry> => {

  const cacheKey = makeCacheKey(
    layer.id || 'layer',
    slotLength, slotWidth, extrusionDepth,
    bevelEnabled, bevelAmount, globalStrokeWeight
  );
  const slotGeometries = getOrCreateSlotGeometries(
    cacheKey,
    () => createSlotGeometries(
      layer, slotLength, slotWidth, extrusionDepth,
      bevelEnabled, bevelAmount, allLayers, globalStrokeWeight
    )
  );
  if (slotGeometries.length === 0) return layerGeo;

  // ── Serialise base with CORRECT plural key names ─────────────────────────
  const baseData = {
    positions: Array.from(layerGeo.attributes.position.array as Float32Array),
    indices:   layerGeo.index
      ? Array.from(layerGeo.index.array as Uint32Array)
      : null,
  };

  // ── Helper: build result from worker response + run B+C repair ───────────
  const buildResult = async (
    e: any,
    usedSlots: THREE_ACTUAL.BufferGeometry[]
  ): Promise<THREE_ACTUAL.BufferGeometry> => {
    const rawGeo = workerOutputToGeometry(e, layerGeo);
    if (!rawGeo) {
      usedSlots.forEach(g => g.dispose());
      return layerGeo;
    }

    const report = getTopologyReport(rawGeo);
    console.log(`📊 Post-CSG topology [${layer.name}]:`, report);

    // Run B+C: fill holes → attempt Manifold with wider merge tolerance
    const repairedGeo = await postProcessCutGeometry(rawGeo, usedSlots);

    usedSlots.forEach(g => g.dispose());
    return repairedGeo;
  };

  // ── Fast AABB filter ──────────────────────────────────────────────────────
  try {
    if (!layerGeo.boundingBox) layerGeo.computeBoundingBox();
    const layerBB = layerGeo.boundingBox ? layerGeo.boundingBox.clone() : null;

    if (layerBB) {
      const rotX = (layer.rotation3D?.x ?? 0) * Math.PI / 180;
      const rotY = (layer.rotation3D?.y ?? 0) * Math.PI / 180;
      const rotMat = new THREE_ACTUAL.Matrix4()
        .makeRotationX(rotX)
        .multiply(new THREE_ACTUAL.Matrix4().makeRotationY(rotY));

      const keptSlots: THREE_ACTUAL.BufferGeometry[] = [];
      for (const g of slotGeometries) {
        try {
          const clone = g.clone();
          clone.applyMatrix4(rotMat);
          clone.computeBoundingBox();
          const gbb = clone.boundingBox;
          if (gbb) {
            const padded = gbb.clone().expandByScalar(0.5);
            if (layerBB.intersectsBox(padded)) keptSlots.push(g);
          }
          clone.dispose?.();
        } catch {
          keptSlots.push(g); // conservative: keep on error
        }
      }

      if (keptSlots.length === 0) {
        slotGeometries.forEach(s => s.dispose());
        return layerGeo;
      }

      // Serialise with CORRECT plural key names
      const slotsData = keptSlots.map(g => ({
        positions: Array.from(g.attributes.position.array as Float32Array),
        indices:   g.index
          ? Array.from(g.index.array as Uint32Array)
          : null,
        rotation: layer.rotation3D ?? { x: 0, y: 0, z: 0 },
      }));

      return postCSGJob(baseData, slotsData, layer.rotation3D)
        .then((e: any) => buildResult(e, keptSlots))
        .catch((err: any) => {
          console.error('CSG Worker Error (filtered path):', err);
          slotGeometries.forEach(g => g.dispose());
          return layerGeo;
        });
    }
  } catch (e) {
    console.warn('Slot AABB filtering failed, proceeding with full CSG', e);
  }

  // ── Fallback: send all slots ──────────────────────────────────────────────
  const allSlotsData = slotGeometries.map(g => ({
    positions: Array.from(g.attributes.position.array as Float32Array),
    indices:   g.index
      ? Array.from(g.index.array as Uint32Array)
      : null,
    rotation: layer.rotation3D ?? { x: 0, y: 0, z: 0 },
  }));

  return postCSGJob(baseData, allSlotsData, layer.rotation3D)
    .then((e: any) => buildResult(e, slotGeometries))
    .catch((err: any) => {
      console.error('CSG Worker Error (full fallback path):', err);
      slotGeometries.forEach(g => g.dispose());
      return layerGeo;
    });
};

/**
 * ── SUMMARY OF CHANGES ──────────────────────────────────────────────────────
 *
 * BUG #2 FIX (Worker crash: "Cannot read properties of undefined (reading 'length')")
 * -----------------------------------------------------------------------------------
 * Root cause A — key name mismatch:
 *   Old code sent  { position, index }  (singular)
 *   Worker read    slot.positions / slot.indices  (plural)  → undefined → crash
 *   Fix: serialise as  { positions, indices }  everywhere.
 *
 * Root cause B — response envelope not unwrapped:
 *   Worker posts  { success, geometry: { positions, indices, normals }, stats }
 *   Old code read  const { position, normal, index } = e  → all undefined
 *   → BufferAttribute constructor received undefined → "Cannot read 'constructor'"
 *   Fix: new workerOutputToGeometry() helper reads e.geometry correctly, and
 *   checks e.success before touching any fields.
 *
 * BUG #2 FIX (csg_worker.ts)
 * --------------------------
 * Added dual-key normalisation in the worker's onmessage so it accepts BOTH
 * 'positions' (new) AND 'position' (legacy singular) for back-compat:
 *   const rawPositions = slot.positions ?? slot.position;
 *
 * ISSUE #1 FIX — Post-cut remesh to close slot holes (Strategy B + C)
 * -------------------------------------------------------------------
 *   B) fillHolesAndRepair (holeFillingRepair.ts):
 *      - Builds boundary edge map (valence-1 edges)
 *      - Chains edges into closed loops
 *      - Fan-triangulates each loop from its centroid (winding auto-corrected)
 *      - Stitches caps back onto the geometry
 *
 *   C) fillHolesManifold (holeFillingRepair.ts):
 *      - After B, runs mergeVertices(0.02) — wider than the 0.001 used before
 *        to weld the aberrant non-adjacent seam vertices that caused Manifold
 *        to fail previously
 *      - Lazy-imports manifoldCSG and attempts manifoldSubtract on the now-
 *        closed mesh
 *      - On Manifold failure, returns the hole-filled geometry (valid for STL
 *        export and visually correct in the 3D viewer)
 *
 * ISSUE #3 NOTE — Lighting / centering in Snowflake3D.tsx
 * -------------------------------------------------------
 * The per-mesh c.position.sub(center) in Snowflake3D.tsx displaces cross-plane
 * and tilt-plane meshes away from the base plane's origin because each mesh
 * has a different bounding-box centre.  Replace it with a single group-level
 * centre after all meshes are added:
 *
 *   // REMOVE per-mesh centering block inside group.traverse(c => { … })
 *   // ADD after sceneRef.current.add(group):
 *   const groupBox = new THREE.Box3().setFromObject(group);
 *   const groupCenter = new THREE.Vector3();
 *   groupBox.getCenter(groupCenter);
 *   group.position.sub(groupCenter);
 */
