/**
 * THE ACTUAL SOLUTION
 * 
 * The 2D SVG uses: fill + stroke (both the same color)
 * The visual thickness comes from BOTH being rendered
 * 
 * In THREE.js, we can replicate this by:
 * 1. Extruding the filled path (base geometry)
 * 2. Creating "stroke" geometry using ExtrudeGeometry on an offset path
 * 3. Merging them together
 * 
 * BUT - there's an even simpler way:
 * Just use the extrude settings' bevelSize to add thickness!
 * 
 * WAIT - that won't work either because bevel is different from stroke.
 * 
 * The REAL real solution: Create TWO sets of geometry and merge:
 * - The base glyph shapes (filled)
 * - An offset version for the stroke
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
      let baseShapes: THREE_ACTUAL.Shape[] = [];
      let currentX = 0;
      
      // Create base shapes from glyphs
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
          baseShapes.push(...threePath.toShapes(true));
        } catch (error) {
          console.warn(`Failed to process glyph ${i} for font ${fontName}:`, error);
        }
        currentX += (glyph.advanceWidth * scale) + textGroup.letterSpacing;
      });

      // ==================================================================
      // CORRECT BOLDNESS: Match SVG fill+stroke by creating stroke geometry
      // ==================================================================
      const totalStrokeWeight = (rendered3DConfig.globalStrokeWeight || 0) + (textGroup.thickness || 0);
      
      let finalShapes = baseShapes;
      
      if (totalStrokeWeight > 0.5) {
        // We need to create BOTH filled AND stroked versions
        // Then merge them into a single geometry
        
        const allShapes: THREE_ACTUAL.Shape[] = [];
        
        for (const baseShape of baseShapes) {
          // Add the base filled shape
          allShapes.push(baseShape);
          
          // Create stroke outline using simple offset
          try {
            const extracted = baseShape.extractPoints(48);
            const outerPoints = extracted.shape;
            
            // Create offset outline (this represents the stroke)
            const offsetOuter = offsetClosedPath(outerPoints, totalStrokeWeight / 2);
            
            if (offsetOuter && offsetOuter.length >= 3) {
              // Create a shape that's a ring: outer expanded, inner is original
              const strokeShape = new THREE_ACTUAL.Shape(offsetOuter);
              
              // The "hole" is the original shape
              const originalPath = new THREE_ACTUAL.Path(outerPoints);
              strokeShape.holes.push(originalPath);
              
              allShapes.push(strokeShape);
            }
          } catch (error) {
            console.warn('Failed to create stroke geometry:', error);
          }
        }
        
        finalShapes = allShapes;
        console.log(`✅ Created fill+stroke geometry: ${baseShapes.length} filled + stroke outlines`);
      }
      // ==================================================================

      const textKey = makeTextKey(layer.id, textGroup, textGroup.fontSize, effectiveDepth, rendered3DConfig.bevelEnabled, bevelPerSide, rendered3DConfig.globalStrokeWeight);
      const groupGeo = getOrCreateGeometry(geometryCache.text, textKey, () => new THREE_ACTUAL.ExtrudeGeometry(finalShapes, extrudeSettings));
      
      // ... (rest remains the same)
    }
  } catch (error) {
    console.warn(`Failed to load font ${fontName}:`, error);
  }
};

/**
 * Simple closed path offset - works for outer boundaries
 */
function offsetClosedPath(
  points: THREE_ACTUAL.Vector2[],
  distance: number
): THREE_ACTUAL.Vector2[] | null {
  
  if (points.length < 3) return null;
  
  const result: THREE_ACTUAL.Vector2[] = [];
  const n = points.length;
  
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    
    const e1x = p1.x - p0.x;
    const e1y = p1.y - p0.y;
    const e2x = p2.x - p1.x;
    const e2y = p2.y - p1.y;
    
    const e1len = Math.sqrt(e1x * e1x + e1y * e1y) || 0.001;
    const e2len = Math.sqrt(e2x * e2x + e2y * e2y) || 0.001;
    
    const n1x = -e1y / e1len;
    const n1y = e1x / e1len;
    const n2x = -e2y / e2len;
    const n2y = e2x / e2len;
    
    let bisX = n1x + n2x;
    let bisY = n1y + n2y;
    const bisLen = Math.sqrt(bisX * bisX + bisY * bisY) || 0.001;
    bisX /= bisLen;
    bisY /= bisLen;
    
    result.push(new THREE_ACTUAL.Vector2(
      p1.x + bisX * distance,
      p1.y + bisY * distance
    ));
  }
  
  return result;
}
