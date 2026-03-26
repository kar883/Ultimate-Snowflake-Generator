/**
 * PATCH: Replace createSlotGeometries in App.tsx (lines ~580-686)
 * ================================================================
 *
 * CHANGE: Slot width is now derived directly from material thickness
 * ──────────────────────────────────────────────────────────────────
 * The slot must accept the mating plane sliding in.  The mating plane's
 * cross-section at the slot is its CORE thickness (extrusionDepth minus
 * the two bevel faces, because the bevel is chamfered/filleted and tapers
 * to a narrower cross-section).  A flat 0.1mm total clearance is added so
 * the planes slide together with a snug press-fit.
 *
 *   cutThickness = coreThickness + 0.1
 *                = (extrusionDepth − 2×bevelAmount) + 0.1   [bevel on]
 *                = extrusionDepth + 0.1                     [bevel off]
 *
 * The user-supplied slotWidth and the old scaling tolerance are removed
 * from the width calculation entirely — they were causing over-wide slots
 * that looked sloppy and didn't match the image reference.
 *
 * The per-layer slotWidthOffset adjustment is preserved so users can still
 * fine-tune per-layer fit if needed.
 *
 * Everything else (blade creation, FULL_PUNCH extent, half-slot positioning,
 * 3-plane slot angles) is carried forward from the previous patch.
 */

const createSlotGeometries = (
  layer: LayerConfig,
  baseSlotLength: number,
  baseSlotWidth: number,         // kept in signature for API compat; no longer
  extrusionDepth: number,        // drives slot width directly
  bevelEnabled: boolean,
  bevelAmount: number,
  allLayers: LayerConfig[],
  globalStrokeWeight: number = 0
): THREE_ACTUAL.BufferGeometry[] => {

  if (!layer.slotType || layer.slotType === 'none') return [];

  const slots: THREE_ACTUAL.BufferGeometry[] = [];
  const enabledLayers = allLayers.filter(l => l.enabled);
  const numPlanes     = enabledLayers.length;

  const adjLength = layer.slotLengthAdjustment ?? 0;
  const adjWidth  = layer.slotWidthOffset      ?? 0;   // per-layer fine-tune

  const slotLength     = baseSlotLength + adjLength;
  const rotationOffset = layer.primary.rotationOffset;

  // ── Slot width: material core thickness + 0.1 mm clearance ───────────────
  //
  // The mating plane slides into this slot.  Its visible face width is the
  // core (between the two bevel transitions).  We add 0.1 mm total so the
  // fit is snug but not press-fit-tight.
  //
  // bevelPerSide is the thickness consumed by ONE bevel face.
  // For a chamfer/fillet bevel both top and bottom faces are bevelled,
  // so total bevel removal = 2 × bevelPerSide.
  const bevelPerSide   = bevelEnabled ? bevelAmount : 0;
  const coreThickness  = Math.max(0.5, extrusionDepth - bevelPerSide * 2);
  const CLEARANCE      = 0.1;  // mm — total gap, not per-side
  const cutThickness   = coreThickness + CLEARANCE + adjWidth;

  console.log(`🔧 Slot geometry for layer ${layer.id} (${layer.slotType}):`, {
    extrusionDepth,
    bevelPerSide,
    coreThickness,
    CLEARANCE,
    adjWidth,
    cutThickness,
    slotLength,
    rotationOffset,
  });

  // ── Blade extent: always punch fully through the mesh ─────────────────────
  // 500 mm safely exceeds any snowflake bounding-box diagonal regardless of
  // the layer's 3D rotation (0°, 120°, 240°, or anything else).
  const FULL_PUNCH = 500;

  // ── createBlade ────────────────────────────────────────────────────────────
  // BoxGeometry(totalLen, extent, thickness):
  //   totalLen  = long axis (slot length direction, X before rotations)
  //   extent    = FULL_PUNCH (becomes Z penetration after rotateX(90°))
  //   thickness = cutThickness (the narrow slot opening)
  //
  // xOffset: where along +X the blade starts
  // angleX:  rotateX degrees — 90 makes the extent axis into Z (vertical cut)
  // angleZ:  rotateZ degrees — controls slot direction in XY plane
  //
  // Random jitter removed — it was non-deterministic, broke caching, and is
  // unnecessary now that FULL_PUNCH eliminates coplanarity as a concern.
  const createBlade = (
    length:    number,
    xOffset:   number,
    thickness: number,
    extent:    number,
    angleX:    number,
    angleZ:    number
  ): THREE_ACTUAL.BufferGeometry => {
    const overlap  = 2.0;
    const totalLen = length + overlap;
    const geo = new THREE_ACTUAL.BoxGeometry(totalLen, extent, thickness, 4, 2, 2);
    const centerX = xOffset + (length - overlap) / 2;
    geo.translate(centerX, 0, 0);
    geo.rotateX(angleX * Math.PI / 180);
    geo.rotateZ(angleZ * Math.PI / 180);
    return geo;
  };

  const createVerticalBlade = (length: number, xOffset: number) =>
    createBlade(length, xOffset, cutThickness, FULL_PUNCH, 90, -rotationOffset);

  // ── 2-plane assembly (perpendicular cross, 90°) ───────────────────────────
  //
  //   half-back  (layer 0, rotateX 0°):
  //     Slot opens from outer +X edge inward to center.
  //     Layer 1 slides UP into it.
  //
  //   half-front (layer 1, rotateX 90°):
  //     Slot opens from center outward to −X edge.
  //     Layer 0 slides DOWN into it.
  //
  //   halfLen = radius + 2 mm to guarantee the slots overlap at center.
  if (numPlanes === 2) {
    const halfLen = slotLength / 2 + 2;

    if (layer.slotType === 'half-back') {
      slots.push(createVerticalBlade(halfLen, 0));
    } else if (layer.slotType === 'half-front') {
      slots.push(createVerticalBlade(halfLen, -halfLen));
    } else {
      // Custom / fallback: full slot centred on origin
      slots.push(createVerticalBlade(slotLength, -slotLength / 2));
    }
    return slots;
  }

  // ── 3-plane assembly (120° spacing) ───────────────────────────────────────
  //
  // Each plane needs exactly two half-slots so the other two planes can
  // slide in from opposite sides and meet at the hub centre.
  //
  //   Layer 0 (third-back,   rotateX   0°):
  //     Cut A at +120°: outer edge → centre  (accepts layer 1 sliding in)
  //     Cut B at +240°: outer edge → centre  (accepts layer 2 sliding in)
  //
  //   Layer 1 (third-middle, rotateX 120°):
  //     Cut A at   0°: outer edge → centre   (accepts layer 0 from this side)
  //     Cut B at 180°: centre → outer edge   (accepts layer 2 from that side)
  //
  //   Layer 2 (third-front,  rotateX 240°):
  //     Cut A at   0°: outer edge → centre   (accepts layer 0)
  //     Cut B at  60°: centre → outer edge   (accepts layer 1)
  //
  //   All blades use FULL_PUNCH so they always punch through regardless of the
  //   layer's 3D rotation.
  if (numPlanes === 3) {
    const layerIndex = enabledLayers.findIndex(l => l.id === layer.id);
    const halfLen    = slotLength / 2 + 2;

    if (layerIndex === 0) {
      slots.push(createBlade(halfLen, 0, cutThickness, FULL_PUNCH, 90, -rotationOffset + 120));
      slots.push(createBlade(halfLen, 0, cutThickness, FULL_PUNCH, 90, -rotationOffset + 240));

    } else if (layerIndex === 1) {
      slots.push(createBlade(halfLen,  0,       cutThickness, FULL_PUNCH, 90, -rotationOffset));
      slots.push(createBlade(halfLen, -halfLen, cutThickness, FULL_PUNCH, 90, -rotationOffset + 180));

    } else if (layerIndex === 2) {
      slots.push(createBlade(halfLen,  0,       cutThickness, FULL_PUNCH, 90, -rotationOffset));
      slots.push(createBlade(halfLen, -halfLen, cutThickness, FULL_PUNCH, 90, -rotationOffset + 60));
    }

    return slots;
  }

  // ── 4+ planes: single full slot centred on origin ─────────────────────────
  slots.push(createVerticalBlade(slotLength, -slotLength / 2));
  return slots;
};

/**
 * ── SUMMARY OF CHANGES ──────────────────────────────────────────────────────
 *
 * SLOT WIDTH (the key change in this patch):
 *   Old: cutThickness = slotWidth + globalStrokeWeight + textBoldness
 *                       + baseTolerance × (extrusionDepth / 5)
 *        e.g. 4.0 + 0 + 0 + 0.2 × 0.6 = 4.12 mm for a 3mm-thick part
 *        This was too wide and not derived from material thickness at all.
 *
 *   New: cutThickness = (extrusionDepth − 2×bevelAmount) + 0.1
 *        e.g. (3.0 − 2×0.4) + 0.1 = 2.3 mm for a 3mm part with 0.4mm bevel
 *        The slot is exactly wide enough for the mating plane to slide in
 *        with 0.1mm total clearance — matching the reference image.
 *
 *   slotWidthOffset (per-layer) is still applied as an additive fine-tune.
 *   The user-set slotWidth config value is no longer used for cut width
 *   (it can be repurposed as a UI display value or removed from config).
 *
 * FULL_PUNCH = 500 mm (carried from previous patch):
 *   Blade extent always punches fully through regardless of layer rotation.
 *
 * NO RANDOM JITTER (carried from previous patch):
 *   Deterministic geometry → cache always hits on repeated renders.
 *
 * HALF-SLOT POSITIONING (carried from previous patch):
 *   Slots cut the correct half so planes physically slide together.
 */
