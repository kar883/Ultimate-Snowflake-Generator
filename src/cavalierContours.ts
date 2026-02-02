// Cavalier-inspired path operations for superior 2D-3D rendering
// This implementation uses mathematical principles from Cavalier Contours
// but is optimized for web/Three.js usage

import * as THREE from 'three';

export interface PlineVertex {
  x: number;
  y: number;
  bulge: number; // Curvature: 0 = straight line, >0 = CCW arc, <0 = CW arc
}

export interface Polyline {
  vertices: PlineVertex[];
  isClosed: boolean;
}

/**
 * Advanced path offset using Cavalier-inspired algorithms
 * Provides superior curve preservation and corner handling
 */
export class CavalierPathOperations {
  
  /**
   * Parallel offset a polyline with arc preservation
   * Inspired by Cavalier Contours' parallel offset algorithm
   */
  static parallelOffset(polyline: Polyline[], offsetDistance: number): Polyline[] {
    const results: Polyline[] = [];
    
    for (const pline of polyline) {
      const offsetVertices: PlineVertex[] = [];
      const vertexCount = pline.vertices.length;
      
      if (vertexCount < 2) {
        results.push({ vertices: [...pline.vertices], isClosed: pline.isClosed });
        continue;
      }
      
      for (let i = 0; i < vertexCount; i++) {
        const prev = pline.vertices[(i - 1 + vertexCount) % vertexCount];
        const curr = pline.vertices[i];
        const next = pline.vertices[(i + 1) % vertexCount];
        
        // Calculate offset vertex using Cavalier's approach
        const offsetVertex = this.calculateOffsetVertex(prev, curr, next, offsetDistance, pline.isClosed);
        offsetVertices.push(offsetVertex);
      }
      
      results.push({ vertices: offsetVertices, isClosed: pline.isClosed });
    }
    
    return results;
  }
  
  /**
   * Calculate offset vertex with arc preservation
   * Uses normal vector averaging and bulge preservation
   */
  private static calculateOffsetVertex(
    prev: PlineVertex, 
    curr: PlineVertex, 
    next: PlineVertex, 
    offsetDistance: number,
    isClosed: boolean
  ): PlineVertex {
    
    // Calculate direction vectors
    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;
    
    // Calculate lengths
    const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1) || 1;
    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 1;
    
    // Calculate normal vectors (perpendicular to direction)
    const n1x = -dy1 / len1;
    const n1y = dx1 / len1;
    const n2x = -dy2 / len2;
    const n2y = dx2 / len2;
    
    // Average the normals for smooth corner handling
    let avgNx = (n1x + n2x) / 2;
    let avgNy = (n1y + n2y) / 2;
    
    // Normalize the average
    const avgLen = Math.sqrt(avgNx * avgNx + avgNy * avgNy) || 1;
    avgNx /= avgLen;
    avgNy /= avgLen;
    
    // Calculate offset position
    const offsetX = curr.x + avgNx * offsetDistance;
    const offsetY = curr.y + avgNy * offsetDistance;
    
    // Preserve bulge (curvature) with adjustment for offset
    let adjustedBulge = curr.bulge;
    if (Math.abs(curr.bulge) > 0.001) {
      // Adjust bulge based on offset distance and radius
      const radius = this.calculateArcRadius(prev, curr, curr.bulge);
      if (radius > 0) {
        const offsetRadius = radius + offsetDistance * Math.sign(curr.bulge);
        adjustedBulge = curr.bulge * (radius / offsetRadius);
      }
    }
    
    return {
      x: offsetX,
      y: offsetY,
      bulge: adjustedBulge
    };
  }
  
  /**
   * Calculate arc radius from bulge value
   * Uses the standard CAD bulge to radius conversion
   */
  private static calculateArcRadius(start: PlineVertex, end: PlineVertex, bulge: number): number {
    if (Math.abs(bulge) < 0.001) return Infinity; // Straight line
    
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const chordLength = Math.sqrt(dx * dx + dy * dy);
    
    // Bulge = tan(angle/4), so radius = chordLength / (2 * sin(angle/2))
    const angle = 4 * Math.atan(Math.abs(bulge));
    const radius = chordLength / (2 * Math.sin(angle / 2));
    
    return radius;
  }
  
  /**
   * Convert polyline to Three.js Vector2 array with arc interpolation
   * Preserves curves by interpolating arc segments
   */
  static polylineToVector2Array(polyline: Polyline, resolution: number = 20): THREE.Vector2[] {
    const points: THREE.Vector2[] = [];
    const vertexCount = polyline.vertices.length;
    
    for (let i = 0; i < vertexCount; i++) {
      const curr = polyline.vertices[i];
      const next = polyline.vertices[(i + 1) % vertexCount];
      
      if (Math.abs(curr.bulge) < 0.001) {
        // Straight line segment
        points.push(new THREE.Vector2(curr.x, curr.y));
      } else {
        // Arc segment - interpolate points along the arc
        const arcPoints = this.interpolateArc(curr, next, curr.bulge, resolution);
        points.push(...arcPoints);
      }
      
      // Add the next vertex if it's the last iteration or if not closed
      if (i === vertexCount - 1 && !polyline.isClosed) {
        points.push(new THREE.Vector2(next.x, next.y));
      }
    }
    
    return points;
  }
  
  /**
   * Interpolate points along an arc defined by bulge
   * Uses parametric equations for precise arc generation
   */
  private static interpolateArc(
    start: PlineVertex, 
    end: PlineVertex, 
    bulge: number, 
    resolution: number
  ): THREE.Vector2[] {
    
    const points: THREE.Vector2[] = [];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const chordLength = Math.sqrt(dx * dx + dy * dy);
    
    if (chordLength < 0.001) return [new THREE.Vector2(start.x, start.y)];
    
    // Calculate arc properties
    const angle = 4 * Math.atan(Math.abs(bulge));
    const radius = chordLength / (2 * Math.sin(angle / 2));
    
    // Calculate arc center
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    
    // Perpendicular to chord
    const perpX = -dy / chordLength;
    const perpY = dx / chordLength;
    
    // Distance from midpoint to arc center
    const centerDist = Math.sqrt(radius * radius - (chordLength / 2) * (chordLength / 2));
    
    // Arc center (account for bulge direction)
    const centerX = midX + perpX * centerDist * Math.sign(bulge);
    const centerY = midY + perpY * centerDist * Math.sign(bulge);
    
    // Start and end angles
    const startAngle = Math.atan2(start.y - centerY, start.x - centerX);
    const endAngle = Math.atan2(end.y - centerY, end.x - centerX);
    
    // Interpolate points along arc
    for (let i = 0; i <= resolution; i++) {
      const t = i / resolution;
      let currentAngle;
      
      if (bulge > 0) {
        // Counter-clockwise arc
        currentAngle = startAngle + (endAngle - startAngle) * t;
      } else {
        // Clockwise arc
        currentAngle = startAngle - (startAngle - endAngle) * t;
      }
      
      const x = centerX + radius * Math.cos(currentAngle);
      const y = centerY + radius * Math.sin(currentAngle);
      points.push(new THREE.Vector2(x, y));
    }
    
    return points;
  }
  
  /**
   * Convert Three.js Vector2 array to polyline with arc detection
   * Detects curves and creates appropriate bulge values
   */
  static vector2ArrayToPolyline(points: THREE.Vector2[], isClosed: boolean = true): Polyline {
    if (points.length < 2) {
      return { vertices: points.map(p => ({ x: p.x, y: p.y, bulge: 0 })), isClosed };
    }
    
    const vertices: PlineVertex[] = [];
    
    for (let i = 0; i < points.length; i++) {
      const curr = points[i];
      const next = points[(i + 1) % points.length];
      const nextNext = points[(i + 2) % points.length];
      
      // Simple bulge calculation (can be enhanced with curve fitting)
      let bulge = 0;
      
      if (points.length > 2) {
        // Detect curvature using three consecutive points
        const angle1 = Math.atan2(next.y - curr.y, next.x - curr.x);
        const angle2 = Math.atan2(nextNext.y - next.y, nextNext.x - next.x);
        const angleDiff = angle2 - angle1;
        
        // Normalize angle difference to [-π, π]
        let normalizedDiff = angleDiff;
        while (normalizedDiff > Math.PI) normalizedDiff -= 2 * Math.PI;
        while (normalizedDiff < -Math.PI) normalizedDiff += 2 * Math.PI;
        
        // Convert angle to bulge (simplified)
        bulge = Math.tan(normalizedDiff / 4);
        
        // Clamp bulge to reasonable values
        bulge = Math.max(-10, Math.min(10, bulge));
      }
      
      vertices.push({ x: curr.x, y: curr.y, bulge });
    }
    
    return { vertices, isClosed };
  }
}
