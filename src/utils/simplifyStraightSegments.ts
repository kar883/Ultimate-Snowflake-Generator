import { Vector2 } from 'three';

/** Remove redundant samples without changing a polyline's straight segments. */
export function simplifyStraightSegments(points: Vector2[]): Vector2[] {
  if (points.length < 3) return points.slice();

  const result = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const previous = result[result.length - 1];
    const current = points[i];
    const next = points[i + 1];
    const ax = current.x - previous.x;
    const ay = current.y - previous.y;
    const bx = next.x - current.x;
    const by = next.y - current.y;
    const cross = ax * by - ay * bx;
    const scale = Math.hypot(ax, ay) * Math.hypot(bx, by);
    if (ax * bx + ay * by <= 0 || Math.abs(cross) > scale * 1e-10) {
      result.push(current);
    }
  }
  result.push(points[points.length - 1]);
  return result;
}
