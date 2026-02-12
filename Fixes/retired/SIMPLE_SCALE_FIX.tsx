/**
 * SIMPLER APPROACH: Use opentype.js getPath() with actual stroke conversion
 * 
 * The key insight: opentype.js can give us the raw path, and we can use
 * a simpler technique - just scale the shapes slightly!
 * 
 * For script fonts, a uniform scale approximation works surprisingly well
 * and is much faster than complex path offsetting.
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

      // ==================================================================
      // BOLD FIX: Simple uniform scaling approach
      // Works well for script fonts and is MUCH faster
      // ==================================================================
      const totalStrokeWeight = (rendered3DConfig.globalStrokeWeight || 0) + (textGroup.thickness || 0);
      
      if (totalStrokeWeight > 0.5) {
        // Calculate scale factor based on stroke weight
        // For a given font size, more stroke = slightly larger scale
        const scaleFactor = 1 + (totalStrokeWeight / textGroup.fontSize);
        
        console.log(`📏 Scaling text by ${scaleFactor.toFixed(3)}x for ${totalStrokeWeight}px boldness`);
        
        const boldShapes: THREE_ACTUAL.Shape[] = [];
        
        for (const shape of shapes) {
          try {
            const extracted = shape.extractPoints(64);
            
            // Calculate centroid for scaling origin
            let centerX = 0, centerY = 0, count = 0;
            extracted.shape.forEach(p => {
              centerX += p.x;
              centerY += p.y;
              count++;
            });
            centerX /= count;
            centerY /= count;
            
            // Scale outer shape
            const scaledOuter = extracted.shape.map(p => new THREE_ACTUAL.Vector2(
              centerX + (p.x - centerX) * scaleFactor,
              centerY + (p.y - centerY) * scaleFactor
            ));
            
            const newShape = new THREE_ACTUAL.Shape(scaledOuter);
            
            // Scale holes DOWN (they get smaller, not larger)
            if (extracted.holes && extracted.holes.length > 0) {
              const holeScaleFactor = 1 / scaleFactor; // Inverse scaling for holes
              
              for (const hole of extracted.holes) {
                let holeCenterX = 0, holeCenterY = 0, holeCount = 0;
                hole.forEach(p => {
                  holeCenterX += p.x;
                  holeCenterY += p.y;
                  holeCount++;
                });
                holeCenterX /= holeCount;
                holeCenterY /= holeCount;
                
                const scaledHole = hole.map(p => new THREE_ACTUAL.Vector2(
                  holeCenterX + (p.x - holeCenterX) * holeScaleFactor,
                  holeCenterY + (p.y - holeCenterY) * holeScaleFactor
                ));
                
                if (scaledHole.length >= 3) {
                  const holePath = new THREE_ACTUAL.Path(scaledHole);
                  newShape.holes.push(holePath);
                }
              }
            }
            
            boldShapes.push(newShape);
          } catch (error) {
            console.warn('Scaling failed, using original:', error);
            boldShapes.push(shape);
          }
        }
        
        if (boldShapes.length > 0) {
          shapes = boldShapes;
        }
      }
      // ==================================================================

      const textKey = makeTextKey(layer.id, textGroup, textGroup.fontSize, effectiveDepth, rendered3DConfig.bevelEnabled, bevelPerSide, rendered3DConfig.globalStrokeWeight);
      const groupGeo = getOrCreateGeometry(geometryCache.text, textKey, () => new THREE_ACTUAL.ExtrudeGeometry(shapes, extrudeSettings));
      
      // ... (rest of your underline and positioning logic remains unchanged)
    }
  } catch (error) {
    console.warn(`Failed to load font ${fontName}:`, error);
  }
};
