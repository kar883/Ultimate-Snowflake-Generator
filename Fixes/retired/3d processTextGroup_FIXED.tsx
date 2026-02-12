/**
 * COMPLETE FIX FOR BOLDNESS IN 3D TEXT
 * 
 * Replace the processTextGroup function (lines ~1085-1273 in App.tsx) with this version.
 * 
 * IMPORTANT: Add this import at the top of App.tsx:
 * import { CavalierPathOperations } from './cavalierContours';
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
      // FIX: Apply boldness offset using Cavalier Contours algorithm
      // This creates the exact visual match between 2D stroke and 3D geometry
      // ============================================================================
      const totalStrokeWeight = (rendered3DConfig.globalStrokeWeight || 0) + (textGroup.thickness || 0);
      
      if (totalStrokeWeight > 0.1) {
        const offsetShapes: THREE_ACTUAL.Shape[] = [];
        
        for (const shape of shapes) {
          try {
            // Get the points from the THREE.Shape
            const points = shape.getPoints(50); // Increase point count for smooth curves
            
            // Convert to polyline format for Cavalier processing
            const polyline = CavalierPathOperations.vector2ArrayToPolyline(points, true);
            
            // Apply parallel offset - SVG stroke expands equally on both sides,
            // so we use half the stroke weight as the offset distance
            const offsetDistance = totalStrokeWeight / 2;
            const offsetPolylines = CavalierPathOperations.parallelOffset([polyline], offsetDistance);
            
            // Convert the offset polylines back to THREE.Shape objects
            for (const offsetPline of offsetPolylines) {
              const offsetPoints = CavalierPathOperations.polylineToVector2Array(offsetPline, 30);
              
              if (offsetPoints.length > 2) {
                const offsetShape = new THREE_ACTUAL.Shape(offsetPoints);
                offsetShapes.push(offsetShape);
              }
            }
          } catch (error) {
            console.warn('Failed to offset shape, using original:', error);
            // Fallback: use the original shape if offset fails
            offsetShapes.push(shape);
          }
        }
        
        // Replace the original shapes with the offset (bold) shapes
        if (offsetShapes.length > 0) {
          shapes = offsetShapes;
        }
      }
      // ============================================================================
      // END FIX
      // ============================================================================

      const textKey = makeTextKey(layer.id, textGroup, textGroup.fontSize, effectiveDepth, rendered3DConfig.bevelEnabled, bevelPerSide, rendered3DConfig.globalStrokeWeight);
      const groupGeo = getOrCreateGeometry(geometryCache.text, textKey, () => new THREE_ACTUAL.ExtrudeGeometry(shapes, extrudeSettings));
      
      // Underline Logic (unchanged)
      const uConf = textGroup.underline;
      let underlineShapes: THREE_ACTUAL.Shape[] = [];

      if (uConf && uConf.enabled) {
        const t = uConf.thickness;
        const halfT = t / 2;
        const startX = textGroup.textX + uConf.startXOffset;
        const endX = startX + uConf.length;
        
        if (!textGroup.mirrorEnabled) {
          const topY = (textGroup.mirrorOffset / 2) + uConf.yOffset;
          const shape = new THREE_ACTUAL.Shape();
          shape.moveTo(startX, topY + halfT);
          shape.lineTo(endX, topY + halfT);
          shape.lineTo(endX, topY - halfT);
          shape.lineTo(startX, topY - halfT);
          shape.closePath();
          underlineShapes.push(shape);
        } else {
          if (uConf.capType === 'none') {
            const topY = (textGroup.mirrorOffset / 2) + uConf.yOffset;
            const botY = -(textGroup.mirrorOffset / 2) - uConf.yOffset;

            const shape1 = new THREE_ACTUAL.Shape();
            shape1.moveTo(startX, topY + halfT);
            shape1.lineTo(endX, topY + halfT);
            shape1.lineTo(endX, topY - halfT);
            shape1.lineTo(startX, topY - halfT);
            shape1.closePath();
            underlineShapes.push(shape1);

            const shape2 = new THREE_ACTUAL.Shape();
            shape2.moveTo(startX, botY + halfT);
            shape2.lineTo(endX, botY + halfT);
            shape2.lineTo(endX, botY - halfT);
            shape2.lineTo(startX, botY - halfT);
            shape2.closePath();
            underlineShapes.push(shape2);
          } else {
            const y1 = (textGroup.mirrorOffset / 2) + uConf.yOffset;
            const y2 = -(textGroup.mirrorOffset / 2) - uConf.yOffset;
            
            const actualTopY = Math.max(y1, y2);
            const actualBotY = Math.min(y1, y2);
            
            const outerTop = actualTopY + halfT;
            const innerTop = actualTopY - halfT;
            const outerBot = actualBotY - halfT;
            const innerBot = actualBotY + halfT;
            
            const capOuterX = endX + uConf.capWidth;
            const capInnerX = Math.max(endX, endX + uConf.capWidth - (t * 1.5));
            
            const shape = new THREE_ACTUAL.Shape();
            shape.moveTo(startX, outerTop);
            if (uConf.capType === 'square') {
              shape.lineTo(endX, outerTop);
              shape.lineTo(capOuterX, outerTop);
              shape.lineTo(capOuterX, outerBot);
              shape.lineTo(endX, outerBot);
            } else if (uConf.capType === 'round') {
              const ry = (outerTop - outerBot) / 2;
              const rx = uConf.capWidth;
              const cy = (outerTop + outerBot) / 2;
              shape.absellipse(endX, cy, rx, ry, Math.PI/2, -Math.PI/2, true);
            } else if (uConf.capType === 'chevron') {
              shape.lineTo(endX, outerTop);
              const cy = (outerTop + outerBot) / 2;
              shape.lineTo(capOuterX, cy);
              shape.lineTo(endX, outerBot);
            } else { 
              shape.lineTo(endX, outerTop);
              shape.lineTo(endX, outerBot);
            }
            shape.lineTo(startX, outerBot);
            shape.lineTo(startX, innerBot);
            if (uConf.capType === 'square') {
              shape.lineTo(endX, innerBot);
              if (capInnerX > endX + 0.001) {
                shape.lineTo(capInnerX, innerBot);
                shape.lineTo(capInnerX, innerTop);
              }
              shape.lineTo(endX, innerTop);
            } else if (uConf.capType === 'round') {
              const ry = (innerTop - innerBot) / 2;
              if (ry > 0.001) {
                const rx = Math.max(0.001, uConf.capWidth - t);
                const cy = (outerTop + outerBot) / 2;
                shape.absellipse(endX, cy, rx, ry, -Math.PI/2, Math.PI/2, false);
              } else {
                shape.lineTo(endX, innerBot); 
                shape.lineTo(endX, innerTop);
              }
            } else if (uConf.capType === 'chevron') {
              shape.lineTo(endX, innerBot);
              const innerTipX = Math.max(endX, endX + uConf.capWidth - (t * 1.5));
              const cy = (outerTop + outerBot) / 2;
              if (innerTipX > endX + 0.001 && (innerTop > innerBot)) {
                shape.lineTo(innerTipX, cy);
              }
              shape.lineTo(endX, innerTop);
            } else {
              shape.lineTo(endX, innerBot);
              shape.lineTo(endX, innerTop);
            }
            shape.lineTo(startX, innerTop);
            shape.closePath();
            underlineShapes.push(shape);
          }
        }
      }
      
      // Apply the same offset to underlines if needed
      if (underlineShapes.length > 0 && totalStrokeWeight > 0.1) {
        const offsetUnderlineShapes: THREE_ACTUAL.Shape[] = [];
        
        for (const shape of underlineShapes) {
          try {
            const points = shape.getPoints(50);
            const polyline = CavalierPathOperations.vector2ArrayToPolyline(points, true);
            const offsetPolylines = CavalierPathOperations.parallelOffset([polyline], totalStrokeWeight / 2);
            
            for (const offsetPline of offsetPolylines) {
              const offsetPoints = CavalierPathOperations.polylineToVector2Array(offsetPline, 30);
              if (offsetPoints.length > 2) {
                const offsetShape = new THREE_ACTUAL.Shape(offsetPoints);
                offsetUnderlineShapes.push(offsetShape);
              }
            }
          } catch (error) {
            console.warn('Failed to offset underline, using original:', error);
            offsetUnderlineShapes.push(shape);
          }
        }
        
        if (offsetUnderlineShapes.length > 0) {
          underlineShapes = offsetUnderlineShapes;
        }
      }
      
      let underlineGeo = null;
      if (underlineShapes.length > 0) {
        const underlineKey = makeUnderlineKey(layer.id, textGroup, effectiveDepth, rendered3DConfig.bevelEnabled, bevelPerSide);
        underlineGeo = getOrCreateGeometry(geometryCache.text, underlineKey, () => new THREE_ACTUAL.ExtrudeGeometry(underlineShapes, extrudeSettings));
      }

      const angleStep = (Math.PI * 2) / textGroup.arms;
      
      // Center the extrusion on Z-axis
      const centerZOffset = -extrudeSettings.depth / 2;

      for (let i = 0; i < textGroup.arms; i++) {
        const angle = i * angleStep + (textGroup.rotationOffset * Math.PI / 180);
        const inst = groupGeo.clone();
        inst.translate(textGroup.textX, textGroup.mirrorOffset / 2, centerZOffset);
        inst.rotateX(Math.PI); 
        inst.rotateZ(-angle);
        layerGeometries.push(inst);
        
        if (textGroup.mirrorEnabled) {
          const mirrored = groupGeo.clone();
          mirrored.translate(textGroup.textX, -textGroup.mirrorOffset / 2, centerZOffset);
          mirrored.rotateZ(-angle); 
          layerGeometries.push(mirrored);
        }
        
        if (underlineGeo) {
          const uInst = underlineGeo.clone();
          uInst.translate(0, 0, centerZOffset);
          uInst.rotateX(Math.PI);
          uInst.rotateZ(-angle);
          layerGeometries.push(uInst);
        }
      }
    }
  } catch (error) {
    console.warn(`Failed to load font ${fontName}:`, error);
  }
};
