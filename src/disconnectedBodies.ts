import * as THREE from 'three';

export interface RemovedBody {
  layerId: string;
  min: [number, number, number];
  max: [number, number, number];
}

export function bodyBounds(
  geometry: THREE.BufferGeometry,
  bodyPerVertex: Int32Array,
  bodyCount: number
): { mainBody: number; bounds: Array<{ min: [number, number, number]; max: [number, number, number] }> } {
  const positions = geometry.getAttribute('position');
  if (!positions || bodyPerVertex.length !== positions.count || bodyCount < 1) {
    throw new Error('Disconnected-body analysis does not match the mesh.');
  }
  const sizes = new Int32Array(bodyCount);
  const areas = new Float64Array(bodyCount);
  const bounds = Array.from({ length: bodyCount }, () => ({
    min: [Infinity, Infinity, Infinity] as [number, number, number],
    max: [-Infinity, -Infinity, -Infinity] as [number, number, number],
  }));
  for (let i = 0; i < positions.count; i++) {
    const body = bodyPerVertex[i];
    if (body < 0 || body >= bodyCount) throw new Error('Invalid disconnected-body identifier.');
    sizes[body]++;
    const values = [positions.getX(i), positions.getY(i), positions.getZ(i)];
    for (let axis = 0; axis < 3; axis++) {
      bounds[body].min[axis] = Math.min(bounds[body].min[axis], values[axis]);
      bounds[body].max[axis] = Math.max(bounds[body].max[axis], values[axis]);
    }
  }
  const index = geometry.getIndex();
  const triangleVertices = index ? index.count : positions.count;
  for (let i = 0; i + 2 < triangleVertices; i += 3) {
    const a = index ? index.getX(i) : i;
    const b = index ? index.getX(i + 1) : i + 1;
    const c = index ? index.getX(i + 2) : i + 2;
    const body = bodyPerVertex[a];
    if (body !== bodyPerVertex[b] || body !== bodyPerVertex[c]) {
      throw new Error('A triangle spans multiple disconnected bodies.');
    }
    const abx = positions.getX(b) - positions.getX(a);
    const aby = positions.getY(b) - positions.getY(a);
    const abz = positions.getZ(b) - positions.getZ(a);
    const acx = positions.getX(c) - positions.getX(a);
    const acy = positions.getY(c) - positions.getY(a);
    const acz = positions.getZ(c) - positions.getZ(a);
    areas[body] += Math.hypot(
      aby * acz - abz * acy,
      abz * acx - abx * acz,
      abx * acy - aby * acx
    );
  }
  let mainBody = 0;
  for (let body = 1; body < bodyCount; body++) {
    if (areas[body] > areas[mainBody] || (areas[body] === areas[mainBody] && sizes[body] > sizes[mainBody])) mainBody = body;
  }
  return { mainBody, bounds };
}

export function removeBodies(
  geometry: THREE.BufferGeometry,
  bodyPerVertex: Int32Array,
  removed: ReadonlySet<number>
): THREE.BufferGeometry {
  const positions = geometry.getAttribute('position');
  if (!positions || bodyPerVertex.length !== positions.count) {
    throw new Error('Disconnected-body analysis does not match the mesh.');
  }
  const sourceIndex = geometry.getIndex();
  const count = sourceIndex ? sourceIndex.count : positions.count;
  if (count % 3 !== 0) throw new Error('Cannot remove bodies from an incomplete triangle mesh.');
  const kept: number[] = [];
  for (let i = 0; i < count; i += 3) {
    const a = sourceIndex ? sourceIndex.getX(i) : i;
    const b = sourceIndex ? sourceIndex.getX(i + 1) : i + 1;
    const c = sourceIndex ? sourceIndex.getX(i + 2) : i + 2;
    if (bodyPerVertex[a] !== bodyPerVertex[b] || bodyPerVertex[a] !== bodyPerVertex[c]) {
      throw new Error('A triangle spans multiple disconnected bodies; removal was cancelled.');
    }
    if (!removed.has(bodyPerVertex[a])) kept.push(a, b, c);
  }
  if (kept.length === 0) throw new Error('Removing bodies would leave an empty mesh.');
  const indexed = geometry.clone();
  indexed.setIndex(kept);
  indexed.clearGroups();
  indexed.setDrawRange(0, kept.length);
  const result = indexed.toNonIndexed();
  indexed.dispose();
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}

export function matchRemovedBodies(
  descriptors: RemovedBody[],
  bounds: Array<{ min: [number, number, number]; max: [number, number, number] }>,
  mainBody: number
): Set<number> {
  const removed = new Set<number>();
  for (const descriptor of descriptors) {
    const matches = bounds.flatMap((candidate, body) => {
      if (body === mainBody || removed.has(body)) return [];
      let score = 0;
      for (let axis = 0; axis < 3; axis++) {
        const tolerance = Math.max(0.25, (descriptor.max[axis] - descriptor.min[axis]) * 0.1);
        const minDelta = Math.abs(candidate.min[axis] - descriptor.min[axis]);
        const maxDelta = Math.abs(candidate.max[axis] - descriptor.max[axis]);
        if (minDelta > tolerance || maxDelta > tolerance) return [];
        score += (minDelta + maxDelta) / tolerance;
      }
      return [{ body, score }];
    }).sort((a, b) => a.score - b.score);
    if (matches.length !== 1) {
      throw new Error('Could not uniquely match a removed body in the export mesh. Regenerate and remove it again.');
    }
    removed.add(matches[0].body);
  }
  return removed;
}

export function analyzeBodiesForExport(
  geometry: THREE.BufferGeometry,
  workerCode: string
): Promise<{ bodyPerVertex: Int32Array; bodyCount: number }> {
  const positions = geometry.getAttribute('position');
  if (!positions) return Promise.reject(new Error('Export mesh has no positions.'));
  const positionArray = new Float32Array(positions.array as ArrayLike<number>);
  const index = geometry.getIndex();
  const indices = index ? new Uint32Array(index.array as ArrayLike<number>) : null;
  const url = URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' }));
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(url);
    } catch (error) {
      URL.revokeObjectURL(url);
      reject(error);
      return;
    }
    const cleanup = () => { worker.terminate(); URL.revokeObjectURL(url); };
    worker.onmessage = ({ data }) => {
      cleanup();
      if (!data?.success || !(data.bodyPerVertex instanceof Int32Array) || typeof data.bodyCount !== 'number') {
        reject(new Error(data?.error || 'Export body analysis failed.'));
        return;
      }
      resolve({ bodyPerVertex: data.bodyPerVertex, bodyCount: data.bodyCount });
    };
    worker.onerror = (event) => {
      cleanup();
      reject(new Error(event.message || 'Export body analysis failed.'));
    };
    try {
      const transfer: Transferable[] = [positionArray.buffer];
      if (indices) transfer.push(indices.buffer);
      worker.postMessage({ positions: positionArray, indices, designColor: '#38bdf8' }, transfer);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
