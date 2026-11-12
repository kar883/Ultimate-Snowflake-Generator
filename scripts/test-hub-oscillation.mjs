import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({
  appType: 'custom',
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true, include: [] },
});

try {
  const { getHubOutlinePoints } = await vite.ssrLoadModule('/src/utils/hubGeometry.ts');
  const createHub = (shape, overrides = {}) => ({
    id: 'test-hub',
    enabled: true,
    shape,
    sides: 6,
    outerRadius: 20,
    hollow: false,
    wallThickness: 2,
    starRatio: 0.5,
    rotationOffset: 0,
    oscillationEnabled: false,
    oscillationAmplitude: 5,
    oscillationFrequency: 6,
    ...overrides,
  });
  const radialDistance = ({ x, y }) => Math.hypot(x, y);

  const polygon = getHubOutlinePoints(createHub('polygon', { sides: 5 }), 20, 128);
  assert.equal(polygon.length, 5, 'non-oscillating polygon keeps its original vertex count');
  polygon.forEach((point) => assert.ok(Math.abs(radialDistance(point) - 20) < 1e-8));

  const star = getHubOutlinePoints(createHub('star', { sides: 5 }), 20, 128);
  assert.equal(star.length, 10, 'non-oscillating star keeps alternating outer and inner vertices');
  star.forEach((point, index) => {
    const expectedRadius = index % 2 === 0 ? 20 : 10;
    assert.ok(Math.abs(radialDistance(point) - expectedRadius) < 1e-8);
  });

  for (const shape of ['circle', 'polygon', 'star']) {
    const baseHub = createHub(shape, { sides: 7 });
    const oscillatingHub = { ...baseHub, oscillationEnabled: true };
    const base = getHubOutlinePoints(baseHub, 20, 384);
    const oscillating = getHubOutlinePoints(oscillatingHub, 20, 384);
    assert.ok(oscillating.length >= base.length, `${shape} oscillation should use enough outline samples`);
    const zeroAmplitude = getHubOutlinePoints({ ...oscillatingHub, oscillationAmplitude: 0 }, 20, 384);
    assert.equal(zeroAmplitude.length, oscillating.length, `${shape} zero-amplitude comparison should use the same sampling`);
    assert.ok(
      oscillating.some((point, index) => Math.abs(radialDistance(point) - radialDistance(zeroAmplitude[index])) > 1),
      `${shape} oscillation should visibly change the radial outline`
    );
    assert.ok(oscillating.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)));
  }

  console.log('Hub oscillation regression passed for circle, polygon, and star outlines.');
} finally {
  await vite.close();
}
