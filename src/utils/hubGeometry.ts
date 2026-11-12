import type { HubConfig } from '../types';

export interface HubOutlinePoint {
  x: number;
  y: number;
}

export const getHubOutlinePoints = (
  hub: HubConfig,
  radius: number,
  requestedResolution: number
): HubOutlinePoint[] => {
  const sides = Math.max(3, Math.floor(hub.sides || 6));
  const vertexCount = hub.shape === 'star'
    ? sides * 2
    : hub.shape === 'polygon'
      ? sides
      : Math.max(3, Math.floor(requestedResolution));
  const oscillationEnabled = hub.oscillationEnabled;
  const resolution = oscillationEnabled
    ? hub.shape === 'circle'
      ? Math.max(vertexCount, Math.ceil(requestedResolution))
      : vertexCount * Math.ceil(Math.max(vertexCount, requestedResolution) / vertexCount)
    : vertexCount;
  const oscillationAmplitude = Number.isFinite(hub.oscillationAmplitude) ? hub.oscillationAmplitude : 0;
  const oscillationFrequency = Number.isFinite(hub.oscillationFrequency) ? hub.oscillationFrequency : 0;
  const starRatio = Number.isFinite(hub.starRatio) ? hub.starRatio : 0.5;
  const edgeAngle = (Math.PI * 2) / vertexCount;
  const points: HubOutlinePoint[] = [];

  for (let i = 0; i < resolution; i++) {
    const angle = (i / resolution) * Math.PI * 2;
    let outlineRadius = radius;

    if (hub.shape === 'star' && !oscillationEnabled) {
      outlineRadius = i % 2 === 0 ? radius : radius * starRatio;
    } else if (oscillationEnabled && hub.shape !== 'circle') {
      const edgeIndex = Math.floor(angle / edgeAngle) % vertexCount;
      const startAngle = edgeIndex * edgeAngle;
      const endAngle = startAngle + edgeAngle;
      const startRadius = hub.shape === 'star' && edgeIndex % 2 !== 0
        ? radius * starRatio
        : radius;
      const nextIndex = (edgeIndex + 1) % vertexCount;
      const endRadius = hub.shape === 'star' && nextIndex % 2 !== 0
        ? radius * starRatio
        : radius;
      const startX = startRadius * Math.cos(startAngle);
      const startY = startRadius * Math.sin(startAngle);
      const edgeX = (endRadius * Math.cos(endAngle)) - startX;
      const edgeY = (endRadius * Math.sin(endAngle)) - startY;
      const rayX = Math.cos(angle);
      const rayY = Math.sin(angle);
      const denominator = (rayX * edgeY) - (rayY * edgeX);
      outlineRadius = Math.abs(denominator) > 1e-9
        ? ((startX * edgeY) - (startY * edgeX)) / denominator
        : startRadius;
    }

    if (oscillationEnabled) {
      outlineRadius += Math.sin(angle * oscillationFrequency) * oscillationAmplitude;
    }
    outlineRadius = Math.max(0.1, outlineRadius);
    points.push({
      x: Math.cos(angle) * outlineRadius,
      y: Math.sin(angle) * outlineRadius,
    });
  }

  return points;
};
