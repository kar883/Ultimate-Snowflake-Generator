// Find this section in your App.tsx (around line 910-1084) and replace it with this improved version:

/**
 * Apply slot cuts to layer geometry with timeout protection and better error handling
 */
const applySlotCuts = async (
  layerGeo: THREE_ACTUAL.BufferGeometry,
  layer: LayerConfig,
  slotLength: number,
  slotWidth: number,
  extrusionDepth: number,
  bevelEnabled: boolean,
  bevelAmount: number,
  allLayers: LayerConfig[],
  onProgress: () => Promise<void>,
  slotMode: '2-plane' | '3-plane' = '2-plane'
): Promise<THREE_ACTUAL.BufferGeometry> => {
  // CREATE TIMEOUT WRAPPER for CSG operations
  const SLOT_CUT_TIMEOUT = 30000; // 30 seconds timeout
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Slot cutting timed out after 30 seconds')), SLOT_CUT_TIMEOUT);
  });

  try {
    // Get slot geometries using cache
    const cacheKey = makeCacheKey(layer.id, slotLength, slotWidth, extrusionDepth, bevelEnabled, bevelAmount, allLayers, slotMode);
    const slotGeometries = getOrCreateSlotGeometries(layer, slotLength, slotWidth, extrusionDepth, bevelEnabled, bevelAmount, allLayers, slotMode);

    if (slotGeometries.length === 0) {
      console.log('No slots to apply for this layer');
      return layerGeo;
    }

    // Serialize base geometry
    const baseData = {
      position: layerGeo.attributes.position.array,
      normal: layerGeo.attributes.normal?.array,
      index: layerGeo.index?.array
    };

    // OPTIMIZATION: Filter out slots that don't intersect with layer AABB
    try {
      layerGeo.computeBoundingBox();
      const layerBB = layerGeo.boundingBox;
      
      if (layerBB) {
        const keptSlots: THREE_ACTUAL.BufferGeometry[] = [];
        
        for (const g of slotGeometries) {
          try {
            const clone = g.clone();
            clone.computeBoundingBox();
            const gbb = clone.boundingBox;
            if (gbb && layerBB.expandByScalar) {
              const padded = gbb.clone().expandByScalar(0.5);
              if (layerBB.intersectsBox(padded)) keptSlots.push(g);
            } else if (gbb && layerBB.intersectsBox(gbb)) {
              keptSlots.push(g);
            }
            clone.dispose?.();
          } catch (e) {
            keptSlots.push(g);
          }
        }

        if (keptSlots.length === 0) {
          console.log('No slots intersect with layer geometry - skipping CSG');
          slotGeometries.forEach(s => s.dispose());
          return layerGeo;
        }

        const slotsData = keptSlots.map(g => ({
          position: g.attributes.position.array,
          normal: g.attributes.normal?.array,
          index: g.index?.array
        }));

        console.log(`Applying ${keptSlots.length} slot cuts via worker...`);

        // RACE: Worker vs Timeout
        const workerPromise = postCSGJob(baseData, slotsData, layer.rotation3D)
          .then((e: any) => {
            console.log('Worker CSG completed successfully');
            const { position, normal, index } = e;
            const resultGeo = new THREE_ACTUAL.BufferGeometry();
            resultGeo.setAttribute('position', new THREE_ACTUAL.BufferAttribute(position, 3));
            if (normal) resultGeo.setAttribute('normal', new THREE_ACTUAL.BufferAttribute(normal, 3));
            if (index) resultGeo.setIndex(new THREE_ACTUAL.BufferAttribute(index, 1));
            slotGeometries.forEach(g => g.dispose());
            return resultGeo;
          });

        try {
          return await Promise.race([workerPromise, timeoutPromise]);
        } catch (timeoutError: any) {
          if (timeoutError.message?.includes('timed out')) {
            console.error('⏱️ Worker timed out - falling back to synchronous method');
            throw new Error('WORKER_TIMEOUT');
          }
          throw timeoutError;
        }
      }
    } catch (e: any) {
      if (e.message !== 'WORKER_TIMEOUT') {
        console.warn('Slot AABB filtering failed, proceeding with full CSG', e);
      } else {
        throw e; // Re-throw timeout to trigger fallback
      }
    }

    // Fallback: serialize all slots
    console.log('Using full slot set for CSG');
    const allSlotsData = slotGeometries.map(g => ({
      position: g.attributes.position.array,
      normal: g.attributes.normal?.array,
      index: g.index?.array
    }));

    const fullWorkerPromise = postCSGJob(baseData, allSlotsData, layer.rotation3D)
      .then((e: any) => {
        console.log('Full worker CSG completed');
        const { position, normal, index } = e;
        const resultGeo = new THREE_ACTUAL.BufferGeometry();
        resultGeo.setAttribute('position', new THREE_ACTUAL.BufferAttribute(position, 3));
        if (normal) resultGeo.setAttribute('normal', new THREE_ACTUAL.BufferAttribute(normal, 3));
        if (index) resultGeo.setIndex(new THREE_ACTUAL.BufferAttribute(index, 1));
        slotGeometries.forEach(g => g.dispose());
        return resultGeo;
      });

    try {
      return await Promise.race([fullWorkerPromise, timeoutPromise]);
    } catch (timeoutError: any) {
      if (timeoutError.message?.includes('timed out')) {
        console.error('⏱️ Full worker also timed out - trying synchronous fallback');
        throw new Error('WORKER_TIMEOUT');
      }
      throw timeoutError;
    }

  } catch (workerError: any) {
    // SYNCHRONOUS FALLBACK - Show warning to user
    console.warn('⚠️ Using slow synchronous slot cutting - UI may freeze temporarily');
    
    // Show user notification that this might take a while
    const notificationDiv = document.createElement('div');
    notificationDiv.id = 'slot-cut-warning';
    notificationDiv.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(15, 23, 42, 0.95);
      border: 2px solid #f59e0b;
      padding: 2rem;
      border-radius: 1rem;
      z-index: 9999;
      color: white;
      font-family: sans-serif;
      max-width: 500px;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    `;
    notificationDiv.innerHTML = `
      <div style="font-size: 3rem; margin-bottom: 1rem;">⏳</div>
      <div style="font-size: 1.25rem; font-weight: bold; margin-bottom: 0.5rem;">Processing Slot Cuts</div>
      <div style="color: #94a3b8;">This may take a minute. Please wait...</div>
      <div style="margin-top: 1rem; font-size: 0.875rem; color: #f59e0b;">⚠️ Browser may appear frozen</div>
    `;
    document.body.appendChild(notificationDiv);

    try {
      // Import three-bvh-csg dynamically for the fallback
      const { Brush, Evaluator, SUBTRACTION, ADDITION } = await import('three-bvh-csg');
      const evaluator = new Evaluator();
      evaluator.attributes = ['position', 'normal'];
      evaluator.useGroups = false;

      // Create base brush
      const baseBrush = new Brush(layerGeo);
      baseBrush.updateMatrixWorld();

      // Get slot geometries
      const slotGeometries = getOrCreateSlotGeometries(layer, slotLength, slotWidth, extrusionDepth, bevelEnabled, bevelAmount, allLayers, slotMode);
      
      // Combine all slot geometries into a single cutting tool
      let toolBrush: any = null;

      for (let i = 0; i < slotGeometries.length; i++) {
        const slotGeo = slotGeometries[i];
        
        // Update notification with progress
        const progressDiv = notificationDiv.querySelector('div:last-child');
        if (progressDiv) {
          progressDiv.textContent = `Processing slot ${i + 1} of ${slotGeometries.length}...`;
        }

        // Allow UI to breathe every few iterations
        if (i % 2 === 0) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }

        const rotatedSlot = slotGeo.clone();
        rotatedSlot.rotateX(layer.rotation3D.x * Math.PI / 180);
        rotatedSlot.rotateY(layer.rotation3D.y * Math.PI / 180);
        rotatedSlot.rotateZ(layer.rotation3D.z * Math.PI / 180);

        const slotBrush = new Brush(rotatedSlot);
        slotBrush.updateMatrixWorld();

        if (!toolBrush) {
          toolBrush = slotBrush;
        } else {
          const nextTool = evaluator.evaluate(toolBrush, slotBrush, ADDITION);
          if (toolBrush.geometry && toolBrush.geometry !== slotBrush.geometry) {
            toolBrush.geometry.dispose();
          }
          toolBrush = nextTool;
        }
        rotatedSlot.dispose();
      }

      if (!toolBrush) {
        document.body.removeChild(notificationDiv);
        slotGeometries.forEach(g => g.dispose());
        return layerGeo;
      }

      // Update notification for final step
      const progressDiv = notificationDiv.querySelector('div:last-child');
      if (progressDiv) {
        progressDiv.textContent = 'Performing final boolean operation...';
      }

      // Perform subtraction
      const result = evaluator.evaluate(baseBrush, toolBrush, SUBTRACTION);
      
      // Clean up
      toolBrush.geometry.dispose();
      slotGeometries.forEach(g => g.dispose());

      // Remove notification
      document.body.removeChild(notificationDiv);
      
      console.log('✅ Synchronous slot cutting completed successfully');
      return result.geometry;

    } catch (syncError) {
      // Remove notification if it exists
      const existingNotif = document.getElementById('slot-cut-warning');
      if (existingNotif) {
        document.body.removeChild(existingNotif);
      }

      console.error('❌ Synchronous slot cutting failed:', syncError);
      
      // Show error to user
      alert('Slot cutting failed. The model will be shown without slots. Try:\n\n' +
            '1. Reduce text complexity\n' +
            '2. Disable bevel temporarily\n' +
            '3. Use fewer arms\n' +
            '4. Simplify hub/abstract shapes');

      // Final fallback - return original geometry
      const slotGeometries = getOrCreateSlotGeometries(layer, slotLength, slotWidth, extrusionDepth, bevelEnabled, bevelAmount, allLayers, slotMode);
      slotGeometries.forEach(g => g.dispose());
      return layerGeo;
    }
  }
};

// INSTRUCTIONS:
// 1. Find the applySlotCuts function in your App.tsx (around line 910-1084)
// 2. Replace it with the version above
// 3. This adds:
//    - 30-second timeout protection
//    - Visual feedback when using slow synchronous fallback
//    - Progress updates during slot cutting
//    - Better error messages
//    - Graceful degradation if slot cutting fails
