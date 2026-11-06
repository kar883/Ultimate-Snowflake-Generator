import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { createServer } from 'vite';
import * as THREE from 'three';

// Run with: node scripts/test-slot-connectivity.mjs
const appPath = path.resolve('src/App.tsx').replaceAll('\\', '/');
const viewerPath = path.resolve('src/components/Snowflake3D.tsx').replaceAll('\\', '/');
const vite = await createServer({
  appType: 'custom',
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true, include: [] },
  plugins: [{
    name: 'expose-connectivity-test-subjects',
    enforce: 'pre',
    load(id) {
      const file = id.replaceAll('\\', '/');
      if (file === appPath) return readFile(id, 'utf8').then((s) => `${s}\nexport { applyWatertightSlotCuts };`);
      if (file === viewerPath) return readFile(id, 'utf8').then((s) => `${s}\nexport { BODIES_WORKER_CODE };`);
    },
  }],
});

globalThis.document = { baseURI: 'http://localhost/' };
globalThis.fetch = async () => {
  const wasm = await readFile(new URL('../node_modules/manifold-3d/manifold.wasm', import.meta.url));
  return { ok: true, arrayBuffer: async () => wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) };
};

try {
  const { applyWatertightSlotCuts } = await vite.ssrLoadModule('/src/App.tsx');
  const { BODIES_WORKER_CODE } = await vite.ssrLoadModule('/src/components/Snowflake3D.tsx');
  const { simplifyStraightSegments } = await vite.ssrLoadModule('/src/utils/simplifyStraightSegments.ts');
  const { manifoldUnionGeometries } = await vite.ssrLoadModule('/src/manifoldCSG.ts');
  const { createDefaultConfig } = await vite.ssrLoadModule('/src/defaults.ts');
  const bodyCount = (geometry) => {
    let response;
    const self = { postMessage: (result) => { response = result; } };
    vm.runInNewContext(BODIES_WORKER_CODE, { self, console, Math, Map, Float32Array, Int32Array, Uint32Array });
    self.onmessage({
      data: {
        positions: new Float32Array(geometry.attributes.position.array),
        indices: geometry.index ? new Uint32Array(geometry.index.array) : null,
        designColor: '#38bdf8',
      },
    });
    assert.equal(response?.success, true, response?.error);
    return response.bodyCount;
  };

  const config = createDefaultConfig();
  Object.assign(config, { slotEnabled: true, manifoldExact: true, slotWidth: 0.2, quality: 'low' });
  const abstracts = [
    { type: 'sine', innerRadius: 2.7, outerRadius: 31.3, amplitude: 5, frequency: 0.4, thickness: 0.6 },
    { type: 'zigzag', innerRadius: 16.5, outerRadius: 48.8, amplitude: 6.1, frequency: 0.57, thickness: 0.7 },
  ];
  config.layers.forEach((layer) => {
    layer.enabled = true;
    layer.primary.enabled = false;
  });

  async function checkOrientation(sineAngle, zigzagAngle) {
    const pieces = [];
    for (const [index, abs] of abstracts.entries()) {
      let points = [];
      for (let i = 0; i <= 70; i++) {
        const x = abs.innerRadius + (i / 70) * (abs.outerRadius - abs.innerRadius);
        const distance = x - abs.innerRadius;
        const period = 2 * Math.PI / abs.frequency;
        const phase = (distance % period) / period;
        const y = abs.type === 'sine'
          ? Math.sin(distance * abs.frequency) * abs.amplitude
          : (phase < 0.5 ? phase * 4 - 1 : (1 - phase) * 4 - 1) * abs.amplitude;
        points.push(new THREE.Vector2(x, y));
      }
      if (abs.type === 'zigzag') points = simplifyStraightSegments(points);
      for (let arm = 0; arm < 6; arm++) {
        for (const mirrored of [false, true]) {
          const shape = new THREE.Shape();
          const y = (point) => mirrored ? -point.y : point.y;
          points.forEach((point, i) => {
            if (i === 0) shape.moveTo(point.x, y(point) + abs.thickness / 2);
            else shape.lineTo(point.x, y(point) + abs.thickness / 2);
          });
          for (const point of [...points].reverse()) shape.lineTo(point.x, y(point) - abs.thickness / 2);
          shape.closePath();
          const geometry = new THREE.ExtrudeGeometry(shape, {
            depth: 2.2, bevelEnabled: true, bevelThickness: 0.4, bevelSize: 0.4, bevelSegments: 3, curveSegments: 5,
          });
          geometry.translate(0, 0, -1.1);
          geometry.rotateZ(arm * Math.PI / 3 + (index === 0 ? sineAngle : zigzagAngle) * Math.PI / 180);
          pieces.push(geometry);
        }
      }
    }
    const source = await manifoldUnionGeometries(pieces);
    pieces.forEach((piece) => piece.dispose());
    try {
      assert.equal(bodyCount(source), 1, 'source design should be connected');
      const output = await applyWatertightSlotCuts(source, config.layers[2], 2, config.layers, config, 0.4, { baseIsManifold: true });
      try {
        output.rotateX(240 * Math.PI / 180);
        return bodyCount(output);
      } finally {
        output.dispose();
      }
    } finally {
      source.dispose();
    }
  }

  assert.ok(await checkOrientation(0, 30) > 1, 'original tilt plane split should trigger a warning');
  assert.equal(await checkOrientation(30, 0), 1, 'rotated tilt plane should not trigger a warning');
  console.log('Slotted tilt connectivity warning regression passed for both orientations.');
} finally {
  await vite.close();
}
