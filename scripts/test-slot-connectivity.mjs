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
      if (file === appPath) return readFile(id, 'utf8').then((s) => `${s}\nexport { applyWatertightSlotCuts, createAngledSlotCuttersForLayer, createBakedBridgePlanesForLayer, createSlotProfilesForLayer, createFactoryInitialState, getSlotPlanePreset, loadStartupStateBase, scaleGeometryInPlane, scaleShapeInstancesInPlane };`);
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
  const { applyWatertightSlotCuts, createAngledSlotCuttersForLayer, createBakedBridgePlanesForLayer, createSlotProfilesForLayer, createFactoryInitialState, getSlotPlanePreset, loadStartupStateBase, scaleGeometryInPlane, scaleShapeInstancesInPlane } = await vite.ssrLoadModule('/src/App.tsx');
  const { BODIES_WORKER_CODE } = await vite.ssrLoadModule('/src/components/Snowflake3D.tsx');
  const { simplifyStraightSegments } = await vite.ssrLoadModule('/src/utils/simplifyStraightSegments.ts');
  const { createSlotProfileOutline, manifoldRemoveTinyComponents, manifoldSubtract, manifoldUnionGeometries } = await vite.ssrLoadModule('/src/manifoldCSG.ts');
  const { getTopologyReport } = await vite.ssrLoadModule('/src/surgicalSlotRepair.ts');
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
  const startupConfig = createFactoryInitialState();
  assert.equal(startupConfig.projectName, 'Snow', 'factory startup should load the supplied Snow example');
  assert.equal(startupConfig.layers[0].primary.text, 'Snow');
  assert.equal(startupConfig.layers[0].enabled, true);
  assert.equal(startupConfig.layers[1].enabled, false);
  assert.equal(startupConfig.layers[2].enabled, false);
  assert.equal(startupConfig.slotEnabled, false);
  assert.equal(startupConfig.inPlaneScale, 1, 'factory startup should use 100% in-plane scale');
  assert.equal(startupConfig.measurementColor, '#38bdf8', 'factory startup should use the default measurement color');
  assert.notEqual(startupConfig.layers, createFactoryInitialState().layers, 'startup config should be cloned per launch');
  const localStorageValues = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => localStorageValues.get(key) ?? null,
      setItem: (key, value) => localStorageValues.set(key, value),
      removeItem: (key) => localStorageValues.delete(key),
    },
  };
  const staleDefault = structuredClone(startupConfig);
  staleDefault.projectName = 'Legacy Saved Snow';
  localStorageValues.set('snowflake-user-defaults-v1', JSON.stringify(staleDefault));
  assert.equal(loadStartupStateBase().projectName, 'Snow', 'stale v1 defaults should not override the bundled factory example');
  const currentUserDefault = structuredClone(startupConfig);
  currentUserDefault.projectName = 'Current User Default';
  localStorageValues.set('snowflake-user-defaults-v2', JSON.stringify(currentUserDefault));
  assert.equal(loadStartupStateBase().projectName, 'Current User Default', 'new user-saved defaults should still be applied');
  delete globalThis.window;

  const componentGeometries = [
    new THREE.BoxGeometry(20, 20, 5),
    new THREE.BoxGeometry(0.2, 0.2, 0.2),
    new THREE.BoxGeometry(2, 2, 2),
  ];
  componentGeometries[1].translate(30, 0, 0);
  componentGeometries[2].translate(50, 0, 0);
  const mixedComponents = await manifoldUnionGeometries(componentGeometries);
  componentGeometries.forEach((geometry) => geometry.dispose());
  assert.equal(bodyCount(mixedComponents), 3, 'fragment cleanup fixture should have two detached components');
  const cleanedComponents = await manifoldRemoveTinyComponents(mixedComponents);
  try {
    assert.notEqual(cleanedComponents, mixedComponents, 'tiny detached components should trigger a cleaned mesh');
    assert.equal(bodyCount(cleanedComponents), 2, 'cleanup should remove the tiny fragment and preserve a larger detached solid');
    assert.equal(getTopologyReport(cleanedComponents).isManifold, true, 'fragment cleanup should preserve closed manifold topology');
  } finally {
    cleanedComponents.dispose();
    mixedComponents.dispose();
  }

  const nearSeamBox = new THREE.BoxGeometry(20, 20, 5);
  const nearSeamPosition = nearSeamBox.getAttribute('position');
  nearSeamPosition.setX(0, nearSeamPosition.getX(0) + 0.0002);
  nearSeamPosition.needsUpdate = true;
  const repairedNearSeam = await manifoldSubtract(nearSeamBox, [], {
    baseIsManifold: false,
    baseWeldTolerance: 5e-4,
  });
  try {
    assert.equal(
      getTopologyReport(repairedNearSeam).isManifold,
      true,
      'wider manifold import weld should close sub-millimeter seams'
    );
  } finally {
    repairedNearSeam.dispose();
    nearSeamBox.dispose();
  }

  const contourConfig = structuredClone(createDefaultConfig());
  contourConfig.slotEnabled = true;
  contourConfig.slotMode = '2-plane';
  contourConfig.automaticSlotLength = false;
  contourConfig.slotLength = 30;
  contourConfig.bevelEnabled = false;
  contourConfig.layers[0].enabled = true;
  contourConfig.layers[0].slotBridgeEnabled = true;
  contourConfig.layers[0].slotBridges = [];
  contourConfig.layers[0].primary.rotationOffset = 0;
  contourConfig.layers[0].rotation3D.x = 0;
  const trapezoid = new THREE.Shape();
  trapezoid.moveTo(-10, -5);
  trapezoid.lineTo(20, -5);
  trapezoid.lineTo(5, 5);
  trapezoid.lineTo(-15, 5);
  trapezoid.closePath();
  const contourSource = new THREE.ExtrudeGeometry(trapezoid, { depth: 3, bevelEnabled: false });
  contourSource.translate(0, 0, -contourConfig.extrusionDepth / 2);
  const twoPlaneConfig = structuredClone(contourConfig);
  twoPlaneConfig.layers[1].enabled = true;
  twoPlaneConfig.layers[0].slotBridgeEnabled = false;
  twoPlaneConfig.slotBridgesEnabled = false;
  [0, 1].forEach((layerIndex) => {
    const profiles = createSlotProfilesForLayer(
      twoPlaneConfig.layers[layerIndex],
      layerIndex,
      twoPlaneConfig.layers,
      twoPlaneConfig,
      twoPlaneConfig.extrusionDepth,
      30,
      75,
      65
    );
    assert.ok(profiles.length > 0, `2-plane layer ${layerIndex} should generate a slot profile`);
    profiles.forEach((profile) => {
      const outline = createSlotProfileOutline(profile);
      const minY = Math.min(...outline.map((point) => point[1]));
      const maxY = Math.max(...outline.map((point) => point[1]));
      assert.ok(
        Math.abs((minY + maxY) / 2 - (profile.yOffset ?? 0)) < 1e-6,
        `2-plane layer ${layerIndex} baked slot profile should center its width on yOffset`
      );
    });
  });
  const twoPlaneBase = await applyWatertightSlotCuts(
    contourSource,
    twoPlaneConfig.layers[0],
    0,
    twoPlaneConfig.layers,
    twoPlaneConfig,
    0.4,
    { baseIsManifold: true, useBakedProfile: true }
  );
  try {
    assert.equal(
      getTopologyReport(twoPlaneBase).isManifold,
      true,
      '2-plane base slot should produce a closed manifold'
    );
    twoPlaneBase.computeBoundingBox();
    const basePreset = getSlotPlanePreset(twoPlaneConfig.layers, 0, '2-plane');
    assert.equal(basePreset.rotationX, 0, 'restore the previous Base plane orientation');
    assert.equal(basePreset.normalOffset, 0, 'Base extrusion should remain centered on its midline');
    twoPlaneBase.translate(0, 0, basePreset.normalOffset);
    twoPlaneBase.rotateX(basePreset.rotationX * Math.PI / 180);
    twoPlaneBase.computeBoundingBox();
    assert.ok(
      Math.abs(twoPlaneBase.boundingBox.getCenter(new THREE.Vector3()).z) < 1e-5,
      '2-plane Base extrusion midline should remain at the assembly centerline'
    );
  } finally {
    twoPlaneBase.dispose();
  }
  const twoPlaneCross = await applyWatertightSlotCuts(
    contourSource,
    twoPlaneConfig.layers[1],
    1,
    twoPlaneConfig.layers,
    twoPlaneConfig,
    0.4,
    { baseIsManifold: true, useBakedProfile: true }
  );
  try {
    const crossPreset = getSlotPlanePreset(twoPlaneConfig.layers, 1, '2-plane');
    assert.equal(crossPreset.rotationX, 90, 'restore the previous Cross plane orientation');
    assert.equal(crossPreset.normalOffset, 0, 'Cross extrusion should remain centered on its midline');
    twoPlaneCross.translate(0, 0, crossPreset.normalOffset);
    twoPlaneCross.rotateX(crossPreset.rotationX * Math.PI / 180);
    twoPlaneCross.computeBoundingBox();
    const center = twoPlaneCross.boundingBox.getCenter(new THREE.Vector3());
    assert.ok(
      Math.abs(center.y) < 1e-5,
      '2-plane Cross extrusion midline should remain at the assembly centerline'
    );
    assert.equal(
      getTopologyReport(twoPlaneCross).isManifold,
      true,
      '2-plane cross slot should produce a closed manifold'
    );
  } finally {
    twoPlaneCross.dispose();
  }

  const contourBridges = createBakedBridgePlanesForLayer(
    contourConfig.layers[0],
    0,
    contourConfig.layers,
    contourConfig,
    contourConfig.extrusionDepth,
    1.5,
    3,
    -15,
    20,
    contourSource,
    40
  );
  try {
    assert.ok(contourBridges.length > 0, 'contour test should generate a base bridge');
    const bridgePositions = contourBridges[0].attributes.position;
    const rows = new Map();
    for (let i = 0; i < bridgePositions.count; i++) {
      const y = bridgePositions.getY(i);
      const key = y.toFixed(3);
      const row = rows.get(key) ?? { y, minX: Number.POSITIVE_INFINITY, maxX: Number.NEGATIVE_INFINITY };
      row.minX = Math.min(row.minX, bridgePositions.getX(i));
      row.maxX = Math.max(row.maxX, bridgePositions.getX(i));
      rows.set(key, row);
    }
    const orderedRows = [...rows.values()].sort((a, b) => a.y - b.y);
    assert.ok(orderedRows.length >= 2, 'contoured bridge should contain multiple silhouette cross-sections');
    assert.ok(
      Math.abs(orderedRows[0].minX - orderedRows[orderedRows.length - 1].minX) > 0.5
        || Math.abs(orderedRows[0].maxX - orderedRows[orderedRows.length - 1].maxX) > 0.5,
      'bridge endpoints should follow a sloped mesh contour instead of remaining rectangular'
    );
  } finally {
    contourBridges.forEach((geometry) => geometry.dispose());
    contourSource.dispose();
  }

  const scaledGeometry = new THREE.BoxGeometry(10, 20, 6);
  scaleGeometryInPlane(scaledGeometry, 0.5);
  scaledGeometry.computeBoundingBox();
  assert.deepEqual(
    scaledGeometry.boundingBox.getSize(new THREE.Vector3()).toArray(),
    [5, 10, 6],
    'in-plane scaling should change XY dimensions without changing thickness'
  );
  scaledGeometry.dispose();
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  const scaledInstances = scaleShapeInstancesInPlane([{
    shape,
    transform: new THREE.Matrix3().set(1, 0, 5, 0, 1, 7, 0, 0, 1),
    strokeWidth: 1,
  }], 0.5);
  const scaledOrigin = new THREE.Vector2(2, 3).applyMatrix3(scaledInstances[0].transform);
  assert.deepEqual(scaledOrigin.toArray(), [3.5, 5], 'slot profile transforms should scale around the shared origin');
  assert.equal(scaledInstances[0].strokeWidth, 0.5, 'in-plane profile scaling should also scale profile stroke width');
  Object.assign(config, { slotEnabled: true, manifoldExact: true, slotWidth: 0.2, quality: 'low' });
  Object.assign(config, { slotMode: '3-plane', automaticSlotLength: true });
  const abstracts = [
    { type: 'sine', innerRadius: 2.7, outerRadius: 31.3, amplitude: 5, frequency: 0.4, thickness: 0.6 },
    { type: 'zigzag', innerRadius: 16.5, outerRadius: 48.8, amplitude: 6.1, frequency: 0.57, thickness: 0.7 },
  ];
  config.layers.forEach((layer) => {
    layer.enabled = true;
    layer.primary.enabled = false;
  });

  const baseCutters = createAngledSlotCuttersForLayer(
    config.layers[0],
    0,
    config.layers,
    config,
    config.extrusionDepth,
    0,
    40
  );
  assert.equal(baseCutters.length, 2, 'base plane should have opposing 3-plane slot chamfers');
  const smallScaleBaseCutters = createAngledSlotCuttersForLayer(
    config.layers[0],
    0,
    config.layers,
    config,
    config.extrusionDepth,
    0,
    40,
    30,
    75,
    65
  );
  const extendedCutterBounds = new THREE.Box3().setFromBufferAttribute(
    smallScaleBaseCutters[0].attributes.position
  );
  const extendedCutterSize = extendedCutterBounds.getSize(new THREE.Vector3());
  assert.ok(
    Math.max(extendedCutterSize.x, extendedCutterSize.y) > 70,
    'automatic base slot cutters should reach the measured scaled plane edge'
  );
  const baseProfiles = createSlotProfilesForLayer(
    config.layers[0],
    0,
    config.layers,
    config,
    config.extrusionDepth,
    30,
    75,
    65
  );
  assert.ok(
    Math.abs(baseProfiles[0].xOffset) + baseProfiles[0].length >= 75,
    'automatic base slot profiles should cover the measured scaled plane edge'
  );
  const crossProfiles = createSlotProfilesForLayer(
    config.layers[1],
    1,
    config.layers,
    config,
    config.extrusionDepth,
    30,
    75,
    65
  );
  assert.ok((crossProfiles[0].chamferStart ?? 0) > 0, 'cross main slot should keep its start chamfer');
  assert.ok((crossProfiles[0].chamferEnd ?? 0) > 0, 'cross main slot should keep its end chamfer');
  assert.equal(crossProfiles[1].chamferStart ?? 0, 0, 'cross tip-in slot should have a square outer end');
  assert.ok(crossProfiles[1].singleChamferEnd, 'cross tip-in slot should use one diagonal across its inner end');
  const tipInOutline = createSlotProfileOutline(crossProfiles[1]);
  assert.equal(tipInOutline.length, 4, 'single-slope tip-in outline should have four corners');
  const diagonalEdges = tipInOutline.filter((point, index) => {
    const next = tipInOutline[(index + 1) % tipInOutline.length];
    return Math.abs(point[0] - next[0]) > 1e-6 && Math.abs(point[1] - next[1]) > 1e-6;
  });
  assert.equal(diagonalEdges.length, 1, 'tip-in outline should have exactly one diagonal end edge');
  assert.ok(
    tipInOutline[2][0] < tipInOutline[1][0] && tipInOutline[2][1] < tipInOutline[1][1],
    'tip-in diagonal should slope in the flipped direction'
  );
  const crossCutters = createAngledSlotCuttersForLayer(
    config.layers[1],
    1,
    config.layers,
    config,
    config.extrusionDepth,
    0,
    40,
    30,
    75,
    65
  );
  assert.equal(crossCutters.length, 2, 'cross plane should have one main cutter and one single-blade tip-in cutter');
  crossCutters.forEach((cutter) => cutter.dispose());
  baseCutters.forEach((cutter) => cutter.dispose());
  smallScaleBaseCutters.forEach((cutter) => cutter.dispose());

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
        const cutTopology = getTopologyReport(output);
        assert.equal(cutTopology.isManifold, true, 'Manifold slot subtraction should retain closed indexed topology');
        const cleanedOutput = await manifoldRemoveTinyComponents(output);
        try {
          cleanedOutput.rotateX(240 * Math.PI / 180);
          const rotatedTopology = getTopologyReport(cleanedOutput);
          assert.equal(rotatedTopology.isManifold, true, 'display rotation should preserve slot topology');
          return bodyCount(cleanedOutput);
        } finally {
          if (cleanedOutput !== output) cleanedOutput.dispose();
        }
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
