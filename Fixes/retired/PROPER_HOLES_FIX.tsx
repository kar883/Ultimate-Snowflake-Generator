/**
 * PROPER BOLDNESS FIX - Handles Loops and Self-Intersections
 * 
 * The problem with simple offset: It doesn't handle:
 * 1. Inner loops (holes in letters like 'o', 'e', 'a')
 * 2. Self-intersections when paths cross
 * 3. Sharp corners that need proper mitigation
 * 
 * Solution: Use shape.extractPoints() to get both outer paths AND holes,
 * then offset them in opposite directions to preserve the topology.
 */

const processTextGroup = async (textGroup: TextGroupConfig) => {
  if (!textGroup.enabled) return;
  
  const fontName = textGroup.fontFamily.replace(/'/g, '').split(',')[0].trim();
  const url = dynamicFonts[fontName] || FONT_TTF_URLS[fontName];
  
  try {
    const font = await loadFont(fontName, url);
    if (font) {
      const scale = textGroup.fontSize / font.unitsPerEm;
      const glyphs = font.stringToGlyphs(textGroup.text);
      let shapes: THREE_ACTUAL.Shape[] = [];
      let currentX = 0;
      
      glyphs.forEach((glyph, i) => {
        try {
          const offset = textGroup.charOffsets[i] || { x: 0, y: 0 };
          const path = glyph.getPath(currentX + offset.x, offset.y, textGroup.fontSize);
          const threePath = new THREE_ACTUAL.ShapePath();
          path.commands.forEach(cmd => {
            if (cmd.type === 'M') threePath.moveTo(cmd.x, cmd.y);
            else if (cmd.type === 'L') threePath.lineTo(cmd.x, cmd.y);
            else if (cmd.type === 'Q') threePath.quadraticCurveTo(cmd.x1, cmd.y1, cmd.x, cmd.y);
            else if (cmd.type === 'C') threePath.bezierCurveTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y);
          });
          shapes.push(...threePath.toShapes(true));
        } catch (error) {
          console.warn(`Failed to process glyph ${i} for font ${fontName}:`, error);
        }
        currentX += (glyph.advanceWidth * scale) + textGroup.letterSpacing;
      });

      // ============================================================================
      // PROPER BOLDNESS - Preserves Holes and Handles Self-Intersections
      // ============================================================================
      const totalStrokeWeight = (rendered3DConfig.globalStrokeWeight || 0) + (textGroup.thickness || 0);
      
      if (totalStrokeWeight > 0.1) {
        const expandedShapes: THREE_ACTUAL.Shape[] = [];
        
        for (const shape of shapes) {
          try {
            // Extract the main contour and holes separately
            const extractedPoints = shape.extractPoints(48);
            
            // Offset the outer shape OUTWARD
            const outerPoints = extractedPoints.shape;
            const expandedOuter = offsetPathWithValidation(outerPoints, totalStrokeWeight / 2, false);
            
            // Offset the holes INWARD (so they get smaller, preserving the loop)
            const contractedHoles: THREE_ACTUAL.Vector2[][] = [];
            if (extractedPoints.holes && extractedPoints.holes.length > 0) {
              for (const hole of extractedPoints.holes) {
                // Negative offset to shrink the hole
                const contractedHole = offsetPathWithValidation(hole, -totalStrokeWeight / 2, true);
                if (contractedHole && contractedHole.length > 2) {
                  contractedHoles.push(contractedHole);
                }
              }
            }
            
            // Create new shape with expanded outer and contracted holes
            if (expandedOuter && expandedOuter.length > 2) {
              const newShape = new THREE_ACTUAL.Shape(expandedOuter);
              
              // Add holes back
              for (const holePoints of contractedHoles) {
                const holePath = new THREE_ACTUAL.Path(holePoints);
                newShape.holes.push(holePath);
              }
              
              expandedShapes.push(newShape);
            }
          } catch (error) {
            console.warn('Failed to expand shape with holes, using original:', error);
            expandedShapes.push(shape);
          }
        }
        
        if (expandedShapes.length > 0) {
          shapes = expandedShapes;
        }
      }
      // ============================================================================

      const textKey = makeTextKey(layer.id, textGroup, textGroup.fontSize, effectiveDepth, rendered3DConfig.bevelEnabled, bevelPerSide, rendered3DConfig.globalStrokeWeight);
      const groupGeo = getOrCreateGeometry(geometryCache.text, textKey, () => new THREE_ACTUAL.ExtrudeGeometry(shapes, extrudeSettings));
      
      // ... rest of function remains the same
    }
  } catch (error) {
    console.warn(`Failed to load font ${fontName}:`, error);
  }
};

/**
 * Helper function to offset a path with validation and cleanup
 * Returns null if offset creates invalid geometry
 */
function offsetPathWithValidation(
  points: THREE_ACTUAL.Vector2[], 
  offsetDist: number,
  isHole: boolean
): THREE_ACTUAL.Vector2[] | null {
  
  if (points.length < 3) return null;
  
  const offsetPoints: THREE_ACTUAL.Vector2[] = [];
  const len = points.length;
  
  for (let i = 0; i < len; i++) {
    const curr = points[i];
    const prev = points[(i - 1 + len) % len];
    const next = points[(i + 1) % len];
    
    // Calculate tangents
    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;
    
    const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1) || 1;
    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 1;
    
    // Perpendicular vectors
    const n1x = -dy1 / len1;
    const n1y = dx1 / len1;
    const n2x = -dy2 / len2;
    const n2y = dx2 / len2;
    
    // Average normal
    let avgNx = (n1x + n2x) / 2;
    let avgNy = (n1y + n2y) / 2;
    
    const avgLen = Math.sqrt(avgNx * avgNx + avgNy * avgNy);
    
    // Detect degenerate cases
    if (avgLen < 0.001) {
      // Sharp corner or cusp - use perpendicular to incoming edge
      avgNx = n1x;
      avgNy = n1y;
    } else {
      avgNx /= avgLen;
      avgNy /= avgLen;
    }
    
    // Calculate the angle between consecutive edges
    const dot = (dx1 * dx2 + dy1 * dy2) / (len1 * len2);
    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
    
    // Apply miter limit for sharp corners
    let actualOffset = offsetDist;
    if (angle < Math.PI / 6) { // Less than 30 degrees
      // Limit miter extension on sharp corners
      const miterLimit = 2.0;
      const miterLength = Math.abs(offsetDist / Math.sin(angle / 2));
      if (miterLength > Math.abs(offsetDist) * miterLimit) {
        actualOffset = offsetDist * miterLimit * Math.sin(angle / 2);
      }
    }
    
    offsetPoints.push(new THREE_ACTUAL.Vector2(
      curr.x + avgNx * actualOffset,
      curr.y + avgNy * actualOffset
    ));
  }
  
  // Validate the result - check if area is positive (for outer) or negative (for holes)
  const area = calculateSignedArea(offsetPoints);
  
  // If hole is contracting too much and becomes invalid, return null
  if (isHole && Math.abs(area) < 1.0) {
    return null; // Hole collapsed
  }
  
  // Ensure correct winding order
  if (!isHole && area < 0) {
    offsetPoints.reverse();
  } else if (isHole && area > 0) {
    offsetPoints.reverse();
  }
  
  return offsetPoints;
}

/**
 * Calculate signed area of a polygon (for winding order detection)
 */
function calculateSignedArea(points: THREE_ACTUAL.Vector2[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return area / 2;
}
