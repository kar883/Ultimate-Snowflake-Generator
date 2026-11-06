import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import * as THREE from 'three';

// Run with: node scripts/test-abstract-manifold.mjs
const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true, include: [] },
});
const originalFetch = globalThis.fetch;
const originalDocument = globalThis.document;
globalThis.document = { baseURI: 'http://localhost/' };
globalThis.fetch = async () => {
  const wasm = await readFile(new URL('../node_modules/manifold-3d/manifold.wasm', import.meta.url));
  return {
    ok: true,
    arrayBuffer: async () => wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength),
  };
};

const owned = [];
const own = (geometry) => {
  owned.push(geometry);
  return geometry;
};

try {
  const { simplifyStraightSegments } = await vite.ssrLoadModule('/src/utils/simplifyStraightSegments.ts');
  const { manifoldUnionGeometries, manifoldSubtract } = await vite.ssrLoadModule('/src/manifoldCSG.ts');
  const { getTopologyReport } = await vite.ssrLoadModule('/src/surgicalSlotRepair.ts');
  const { makeAbstractKey } = await vite.ssrLoadModule('/src/geometryCache.ts');

  const corner = [new THREE.Vector2(0, 0), new THREE.Vector2(1, 0), new THREE.Vector2(2, 0), new THREE.Vector2(2, 1)];
  assert.deepEqual(simplifyStraightSegments(corner), [corner[0], corner[2], corner[3]]);
  const reversal = [new THREE.Vector2(0, 0), new THREE.Vector2(1, 0), new THREE.Vector2(0, 0)];
  assert.deepEqual(simplifyStraightSegments(reversal), reversal);
  const bend = [new THREE.Vector2(0, 0), new THREE.Vector2(1, 1e-6), new THREE.Vector2(2, 0)];
  assert.deepEqual(simplifyStraightSegments(bend), bend);

  const abstracts = [
    { type: 'sine', innerRadius: 2.7, outerRadius: 31.3, amplitude: 5, frequency: 0.4, thickness: 0.6, rotationOffset: 0 },
    { type: 'zigzag', innerRadius: 16.5, outerRadius: 48.8, amplitude: 6.1, frequency: 0.57, thickness: 0.7, rotationOffset: 30 },
  ];
  assert.notEqual(
    makeAbstractKey('layer', abstracts[1], 3, true, 0.4, 0),
    makeAbstractKey('layer', { ...abstracts[1], frequency: 0.6 }, 3, true, 0.4, 0),
  );
  assert.notEqual(
    makeAbstractKey('layer', abstracts[1], 3, true, 0.4, 0),
    makeAbstractKey('layer', { ...abstracts[1], thickness: 0.8 }, 3, true, 0.4, 0),
  );

  const pieces = [];
  for (const abstract of abstracts) {
    const points = [];
    for (let i = 0; i <= 70; i++) {
      const x = abstract.innerRadius + (i / 70) * (abstract.outerRadius - abstract.innerRadius);
      const distance = x - abstract.innerRadius;
      const phase = (distance % (2 * Math.PI / abstract.frequency)) / (2 * Math.PI / abstract.frequency);
      const y = abstract.type === 'sine'
        ? Math.sin(distance * abstract.frequency) * abstract.amplitude
        : (phase < 0.5 ? phase * 4 - 1 : (1 - phase) * 4 - 1) * abstract.amplitude;
      points.push(new THREE.Vector2(x, y));
    }
    const profile = abstract.type === 'zigzag' ? simplifyStraightSegments(points) : points;
    if (abstract.type === 'zigzag') {
      assert.ok(profile.length < points.length);
      let segment = 0;
      for (const point of points) {
        while (segment < profile.length - 2 && point.x > profile[segment + 1].x) segment++;
        const start = profile[segment];
        const end = profile[segment + 1];
        const expectedY = start.y + (end.y - start.y) * (point.x - start.x) / (end.x - start.x);
        assert.ok(Math.abs(point.y - expectedY) < 1e-9, 'simplification must preserve the sampled outline');
      }
    }

    for (const mirrored of [false, true]) {
      const shape = new THREE.Shape();
      const y = (point) => mirrored ? -point.y : point.y;
      profile.forEach((point, index) => {
        if (index === 0) shape.moveTo(point.x, y(point) + abstract.thickness / 2);
        else shape.lineTo(point.x, y(point) + abstract.thickness / 2);
      });
      for (const point of [...profile].reverse()) shape.lineTo(point.x, y(point) - abstract.thickness / 2);
      shape.closePath();
      const base = own(new THREE.ExtrudeGeometry(shape, {
        depth: 2.2, bevelEnabled: true, bevelThickness: 0.4, bevelSize: 0.4, bevelSegments: 3, curveSegments: 5,
      }));
      for (let arm = 0; arm < 6; arm++) {
        const instance = own(base.clone());
        instance.translate(0, 0, -1.1);
        instance.rotateZ(arm * Math.PI / 3 + abstract.rotationOffset * Math.PI / 180);
        pieces.push(instance);
      }
    }
  }

  const union = own(await manifoldUnionGeometries(pieces));
  assert.equal(getTopologyReport(union).isManifold, true);
  assert.ok(Math.abs(union.boundingBox.max.z - union.boundingBox.min.z - 3) < 1e-5);
  const cutter = own(new THREE.BoxGeometry(50, 3.2, 8));
  cutter.translate(25, 0, 0);
  const cut = own(await manifoldSubtract(union, [cutter], { baseIsManifold: true, strict: true }));
  assert.equal(getTopologyReport(cut).isManifold, true);
  assert.ok(Math.abs(cut.boundingBox.max.z - cut.boundingBox.min.z - 3) < 1e-5);
  const volume = (geometry) => {
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    let signed = 0;
    for (let i = 0; i < index.count; i += 3) {
      a.fromBufferAttribute(position, index.getX(i));
      b.fromBufferAttribute(position, index.getX(i + 1));
      c.fromBufferAttribute(position, index.getX(i + 2));
      signed += a.dot(b.cross(c)) / 6;
    }
    return Math.abs(signed);
  };
  assert.ok(volume(cut) < volume(union) - 0.01, 'subtraction must remove material');
  console.log('Abstract profile, cache keys, beveled union and strict subtraction passed.');
} finally {
  owned.forEach((geometry) => geometry.dispose());
  globalThis.fetch = originalFetch;
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
  await vite.close();
}
