// FIXED VERSION - Search for "// FIX:" comments to see the changes

// The key issue: The 2D SVG preview uses strokeWidth which expands the text outward,
// but the 3D geometry was just extruding the raw glyph paths without any expansion.
// 
// Solution: Apply the Cavalier Contours parallel offset algorithm to expand the text shapes
// before extrusion, matching what SVG stroke does visually.

// Around line 1085-1120, replace the processTextGroup function with this fixed version:

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

      // FIX: Apply boldness offset using Cavalier Contours algorithm
      // This matches what SVG stroke does in the 2D preview
      const totalStrokeWeight = (rendered3DConfig.globalStrokeWeight || 0) + (textGroup.thickness || 0);
      
      if (totalStrokeWeight > 0.1) {
        // Import CavalierPathOperations at the top of the file
        // import { CavalierPathOperations } from './cavalierContours';
        
        const offsetShapes: THREE_ACTUAL.Shape[] = [];
        
        shapes.forEach(shape => {
          try {
            // Convert THREE.Shape to polyline format
            const points = shape.getPoints();
            const polyline = CavalierPathOperations.vector2ArrayToPolyline(points, true);
            
            // Apply parallel offset (half stroke on each side, so divide by 2)
            const offsetPolylines = CavalierPathOperations.parallelOffset([polyline], totalStrokeWeight / 2);
            
            // Convert back to THREE.Shape
            offsetPolylines.forEach(offsetPline => {
              const offsetPoints = CavalierPathOperations.polylineToVector2Array(offsetPline, 20);
              if (offsetPoints.length > 0) {
                const offsetShape = new THREE_ACTUAL.Shape(offsetPoints);
                offsetShapes.push(offsetShape);
              }
            });
          } catch (error) {
            console.warn('Failed to offset shape, using original:', error);
            offsetShapes.push(shape);
          }
        });
        
        shapes = offsetShapes;
      }

      const textKey = makeTextKey(layer.id, textGroup, textGroup.fontSize, effectiveDepth, rendered3DConfig.bevelEnabled, bevelPerSide, rendered3DConfig.globalStrokeWeight);
      const groupGeo = getOrCreateGeometry(geometryCache.text, textKey, () => new THREE_ACTUAL.ExtrudeGeometry(shapes, extrudeSettings));
      
      // ... rest of the function (underline logic, arm positioning, etc) remains the same
    }
  } catch (error) {
    console.warn(`Failed to load font ${fontName}:`, error);
  }
};
