// ============================================================================
// OPTIMIZED SLOT BLADE GEOMETRY
// ============================================================================
// Replace the createSlotGeometries function in App.tsx (around line 906)
// This creates cleaner blades that produce fewer CSG artifacts

const createSlotGeometries = (
  layer: LayerConfig,
  baseSlotLength: number,
  baseSlotWidth: number,
  extrusionDepth: number,
  bevelEnabled: boolean,
  bevelAmount: number,
  allLayers: LayerConfig[],
  slotMode?: '2-plane' | '3-plane'
): THREE_ACTUAL.BufferGeometry[] => {
  if (!layer.slotType || layer.slotType === 'none') return [];
  
  const slots: THREE_ACTUAL.BufferGeometry[] = [];
  const enabledLayers = allLayers.filter(l => l.enabled);
  
  let numPlanes = enabledLayers.length;
  if (slotMode === '2-plane') {
    numPlanes = 2;
  } else if (slotMode === '3-plane') {
    numPlanes = 3;
  }
  
  const adjLength = layer.slotLengthAdjustment || 0;
  const adjWidth = layer.slotWidthOffset || 0;
  
  const slotLength = baseSlotLength + adjLength;
  const rotationOffset = layer.primary.rotationOffset;
  
  const materialThickness = extrusionDepth;
  const bevelPerSide = bevelEnabled ? bevelAmount : 0;
  
  const cutThickness = baseSlotWidth + adjWidth;
  const cutDepth = materialThickness + 3.0; // Reduced from 4.0 - just enough to cut through
  
  const SLOT_EXTENSION = 10; // Reduced from 15 - less extension means fewer artifacts

  /**
   * OPTIMIZED BLADE CREATION
   * Key changes:
   * 1. NO subdivisions (1, 1, 1) - creates minimal geometry
   * 2. NO random noise - allows proper vertex merging
   * 3. Reduced overlap - less duplicate geometry
   * 4. Cleaner positioning
   */
  const createBlade = (
    length: number,
    xOffset: number,
    thickness: number,
    extent: number,
    angleX: number,
    angleZ: number
  ) => {
    // Minimal overlap for clean cuts
    const overlap = 0.1; // Reduced from 0.25
    const totalLen = length + overlap;
    
    // CRITICAL: Use minimal subdivisions (1,1,1) to create cleanest geometry
    // More subdivisions = more vertices = more artifacts
    const geo = new THREE_ACTUAL.BoxGeometry(totalLen, extent, thickness, 1, 1, 1);
    
    // Clean positioning without random noise
    const centerX = xOffset + (length - overlap) / 2;
    geo.translate(centerX, 0, 0);
    
    // Clean rotations without random noise
    geo.rotateX(angleX * Math.PI / 180);
    geo.rotateZ(angleZ * Math.PI / 180);
    
    return geo;
  };

  const createVerticalBlade = (length: number, xOffset: number) => {
    return createBlade(length, xOffset, cutThickness, cutDepth, 90, -rotationOffset);
  };

  // 2-PLANE MODE
  if (numPlanes === 2) {
    slots.push(createVerticalBlade(slotLength + SLOT_EXTENSION, 0));
    return slots;
  }

  // 3-PLANE MODE
  if (numPlanes === 3) {
    const layerIndex = enabledLayers.findIndex(l => l.id === layer.id);
    
    if (layerIndex === 0) {
      // First layer: Two angled cuts at 120° and 240°
      slots.push(createBlade(slotLength + SLOT_EXTENSION, 0, cutThickness, cutDepth, 120, -rotationOffset));
      slots.push(createBlade(slotLength + SLOT_EXTENSION, 0, cutThickness, cutDepth, 240, -rotationOffset));
      
    } else if (layerIndex === 1) {
      // Second layer: Horizontal cut + one angled cut
      slots.push(createBlade(slotLength + SLOT_EXTENSION, 0, cutDepth, cutThickness, 330, -rotationOffset));
      const xOffsetShort = slotLength * 0.75;
      const shortLength = (slotLength * 0.25) + SLOT_EXTENSION;
      slots.push(createBlade(shortLength, xOffsetShort, cutThickness, cutDepth, 60, -rotationOffset + 180));
      
    } else if (layerIndex === 2) {
      // Third layer: Two angled cuts + extended horizontal
      slots.push(createBlade(slotLength + SLOT_EXTENSION, 0, cutThickness, cutDepth, 240, -rotationOffset));
      slots.push(createBlade(slotLength + SLOT_EXTENSION, 0, cutThickness, cutDepth, 120, -rotationOffset));
      const extLen = slotLength * 0.75;
      const extOff = -extLen;
      slots.push(createBlade(extLen, extOff, cutDepth, cutThickness, 30, -rotationOffset));
    }
    return slots;
  }

  // DEFAULT
  slots.push(createVerticalBlade(slotLength + SLOT_EXTENSION, 0));
  return slots;
};
