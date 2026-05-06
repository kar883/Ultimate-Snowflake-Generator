import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils';
import JSZip from 'jszip';
import { DesignQuality } from './types';
import { getTopologyReport, surgicalSlotRepair } from './surgicalSlotRepair';

type ExportCleanupOptions = {
  optimize?: boolean;
  weldTolerance?: number;
  quality?: DesignQuality;
  nearLosslessDecimation?: boolean;
  enforceManifold?: boolean;
  manifoldFaceLimit?: number;
};

type STLParseOptions = ExportCleanupOptions & {
  binary?: boolean;
};

const DEFAULT_WELD_TOLERANCE = 0.000002;
const DEFAULT_YIELD_INTERVAL = 4000;
const DEFAULT_MANIFOLD_FACE_LIMIT = 450000;

const yieldToBrowser = async (): Promise<void> => {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

const createSequentialIndex = (vertexCount: number): THREE.BufferAttribute => {
  if (vertexCount > 65535) {
    const idx = new Uint32Array(vertexCount);
    for (let i = 0; i < vertexCount; i++) idx[i] = i;
    return new THREE.BufferAttribute(idx, 1);
  }
  const idx = new Uint16Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) idx[i] = i;
  return new THREE.BufferAttribute(idx, 1);
};

const removeDegenerateAndDuplicateTriangles = (source: THREE.BufferGeometry): THREE.BufferGeometry => {
  let geometry = source.index ? source.clone() : source.clone().setIndex(createSequentialIndex((source.getAttribute('position') as THREE.BufferAttribute).count));

  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const indexAttr = geometry.getIndex();

  if (!indexAttr || !position) {
    return geometry;
  }

  const indexArray = indexAttr.array as ArrayLike<number>;
  const uniqueFaceKeys = new Set<string>();
  const filteredTriangles: number[] = [];

  const ax = new THREE.Vector3();
  const bx = new THREE.Vector3();
  const cx = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const cross = new THREE.Vector3();

  for (let i = 0; i < indexArray.length; i += 3) {
    const a = Number(indexArray[i]);
    const b = Number(indexArray[i + 1]);
    const c = Number(indexArray[i + 2]);

    if (a === b || b === c || a === c) {
      continue;
    }

    ax.fromBufferAttribute(position, a);
    bx.fromBufferAttribute(position, b);
    cx.fromBufferAttribute(position, c);

    ab.subVectors(bx, ax);
    ac.subVectors(cx, ax);
    cross.crossVectors(ab, ac);

    if (cross.lengthSq() < 1e-18) {
      continue;
    }

    const sorted = [a, b, c].sort((m, n) => m - n);
    const faceKey = `${sorted[0]}_${sorted[1]}_${sorted[2]}`;
    if (uniqueFaceKeys.has(faceKey)) {
      continue;
    }
    uniqueFaceKeys.add(faceKey);
    filteredTriangles.push(a, b, c);
  }

  if (filteredTriangles.length === indexArray.length) {
    return geometry;
  }

  const vertexCount = position.count;
  const oldToNew = new Int32Array(vertexCount);
  oldToNew.fill(-1);

  let nextVertexCount = 0;
  const remappedIndex = new Uint32Array(filteredTriangles.length);
  for (let i = 0; i < filteredTriangles.length; i++) {
    const oldIndex = filteredTriangles[i];
    let newIndex = oldToNew[oldIndex];
    if (newIndex === -1) {
      newIndex = nextVertexCount++;
      oldToNew[oldIndex] = newIndex;
    }
    remappedIndex[i] = newIndex;
  }

  const compact = new THREE.BufferGeometry();

  for (const [name, attr] of Object.entries(geometry.attributes)) {
    const sourceAttr = attr as THREE.BufferAttribute;
    const ctor = (sourceAttr.array as any).constructor;
    const nextArray = new ctor(nextVertexCount * sourceAttr.itemSize);

    for (let oldIndex = 0; oldIndex < vertexCount; oldIndex++) {
      const newIndex = oldToNew[oldIndex];
      if (newIndex === -1) continue;
      const srcBase = oldIndex * sourceAttr.itemSize;
      const dstBase = newIndex * sourceAttr.itemSize;
      for (let c = 0; c < sourceAttr.itemSize; c++) {
        nextArray[dstBase + c] = (sourceAttr.array as any)[srcBase + c];
      }
    }

    compact.setAttribute(name, new THREE.BufferAttribute(nextArray, sourceAttr.itemSize, sourceAttr.normalized));
  }

  const maxIndex = nextVertexCount - 1;
  const remappedIndexArray = maxIndex > 65535
    ? remappedIndex
    : new Uint16Array(remappedIndex);

  compact.setIndex(new THREE.BufferAttribute(remappedIndexArray, 1));
  compact.computeBoundingBox();
  compact.computeBoundingSphere();

  geometry.dispose();
  return compact;
};

const removeDegenerateAndDuplicateTrianglesAsync = async (
  source: THREE.BufferGeometry,
  yieldInterval = DEFAULT_YIELD_INTERVAL
): Promise<THREE.BufferGeometry> => {
  let geometry = source.index ? source.clone() : source.clone().setIndex(createSequentialIndex((source.getAttribute('position') as THREE.BufferAttribute).count));

  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const indexAttr = geometry.getIndex();

  if (!indexAttr || !position) {
    return geometry;
  }

  const indexArray = indexAttr.array as ArrayLike<number>;
  const uniqueFaceKeys = new Set<string>();
  const filteredTriangles: number[] = [];

  const ax = new THREE.Vector3();
  const bx = new THREE.Vector3();
  const cx = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const cross = new THREE.Vector3();

  for (let i = 0; i < indexArray.length; i += 3) {
    const a = Number(indexArray[i]);
    const b = Number(indexArray[i + 1]);
    const c = Number(indexArray[i + 2]);

    if (a === b || b === c || a === c) {
      continue;
    }

    ax.fromBufferAttribute(position, a);
    bx.fromBufferAttribute(position, b);
    cx.fromBufferAttribute(position, c);

    ab.subVectors(bx, ax);
    ac.subVectors(cx, ax);
    cross.crossVectors(ab, ac);

    if (cross.lengthSq() < 1e-18) {
      continue;
    }

    const sorted = [a, b, c].sort((m, n) => m - n);
    const faceKey = `${sorted[0]}_${sorted[1]}_${sorted[2]}`;
    if (uniqueFaceKeys.has(faceKey)) {
      continue;
    }
    uniqueFaceKeys.add(faceKey);
    filteredTriangles.push(a, b, c);

    if (i > 0 && i % (yieldInterval * 3) === 0) {
      await yieldToBrowser();
    }
  }

  if (filteredTriangles.length === indexArray.length) {
    return geometry;
  }

  const vertexCount = position.count;
  const oldToNew = new Int32Array(vertexCount);
  oldToNew.fill(-1);

  let nextVertexCount = 0;
  const remappedIndex = new Uint32Array(filteredTriangles.length);
  for (let i = 0; i < filteredTriangles.length; i++) {
    const oldIndex = filteredTriangles[i];
    let newIndex = oldToNew[oldIndex];
    if (newIndex === -1) {
      newIndex = nextVertexCount++;
      oldToNew[oldIndex] = newIndex;
    }
    remappedIndex[i] = newIndex;

    if (i > 0 && i % (yieldInterval * 3) === 0) {
      await yieldToBrowser();
    }
  }

  const compact = new THREE.BufferGeometry();

  for (const [name, attr] of Object.entries(geometry.attributes)) {
    const sourceAttr = attr as THREE.BufferAttribute;
    const ctor = (sourceAttr.array as any).constructor;
    const nextArray = new ctor(nextVertexCount * sourceAttr.itemSize);

    let scanned = 0;
    for (let oldIndex = 0; oldIndex < vertexCount; oldIndex++) {
      const newIndex = oldToNew[oldIndex];
      if (newIndex !== -1) {
        const srcBase = oldIndex * sourceAttr.itemSize;
        const dstBase = newIndex * sourceAttr.itemSize;
        for (let c = 0; c < sourceAttr.itemSize; c++) {
          nextArray[dstBase + c] = (sourceAttr.array as any)[srcBase + c];
        }
      }
      scanned++;
      if (scanned > 0 && scanned % yieldInterval === 0) {
        await yieldToBrowser();
      }
    }

    compact.setAttribute(name, new THREE.BufferAttribute(nextArray, sourceAttr.itemSize, sourceAttr.normalized));
  }

  const maxIndex = nextVertexCount - 1;
  const remappedIndexArray = maxIndex > 65535
    ? remappedIndex
    : new Uint16Array(remappedIndex);

  compact.setIndex(new THREE.BufferAttribute(remappedIndexArray, 1));
  compact.computeBoundingBox();
  compact.computeBoundingSphere();

  geometry.dispose();
  return compact;
};

const cleanupGeometryForExport = (
  source: THREE.BufferGeometry,
  options?: ExportCleanupOptions
): THREE.BufferGeometry => {
  const optimize = options?.optimize !== false;
  const weldTolerance = options?.weldTolerance ?? DEFAULT_WELD_TOLERANCE;
  const quality = options?.quality ?? 'med';
  const nearLosslessDecimation = options?.nearLosslessDecimation !== false;
  const enforceManifold = options?.enforceManifold === true;
  const manifoldFaceLimit = options?.manifoldFaceLimit ?? DEFAULT_MANIFOLD_FACE_LIMIT;

  let geometry = source.clone();

  if (optimize) {
    const welded = BufferGeometryUtils.mergeVertices(geometry, weldTolerance) as THREE.BufferGeometry;
    if (welded !== geometry) {
      geometry.dispose();
      geometry = welded;
    }

    const cleaned = removeDegenerateAndDuplicateTriangles(geometry);
    if (cleaned !== geometry) {
      geometry.dispose();
      geometry = cleaned;
    }

    const index = geometry.getIndex();
    const triangleCount = index ? Math.floor(index.count / 3) : Math.floor((geometry.getAttribute('position') as THREE.BufferAttribute).count / 3);

    if (nearLosslessDecimation && triangleCount > 120000) {
      // Near-lossless decimation: tiny, quality-aware weld on top of exact cleanup.
      // This primarily removes micro-fragmentation from CSG seams without visible change.
      geometry.computeBoundingBox();
      const bbox = geometry.boundingBox;
      if (bbox) {
        const diagonal = bbox.min.distanceTo(bbox.max);
        const qualityFactor = quality === 'high' ? 0.0000012 : quality === 'med' ? 0.0000025 : 0.000004;
        const decimationTolerance = Math.max(weldTolerance, diagonal * qualityFactor);

        const decimated = BufferGeometryUtils.mergeVertices(geometry, decimationTolerance) as THREE.BufferGeometry;
        if (decimated !== geometry) {
          geometry.dispose();
          geometry = decimated;
        }

        const cleanedDecimated = removeDegenerateAndDuplicateTriangles(geometry);
        if (cleanedDecimated !== geometry) {
          geometry.dispose();
          geometry = cleanedDecimated;
        }
      }
    }
  }

  if (enforceManifold && geometry.getIndex()) {
    const report = getTopologyReport(geometry);
    if (!report.isManifold && report.faces <= manifoldFaceLimit) {
      const repaired = surgicalSlotRepair(geometry);
      if (repaired !== geometry) {
        geometry.dispose();
        geometry = repaired;
      }
    }
  }

  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
};

const cleanupGeometryForExportAsync = async (
  source: THREE.BufferGeometry,
  options?: ExportCleanupOptions
): Promise<THREE.BufferGeometry> => {
  const optimize = options?.optimize !== false;
  const weldTolerance = options?.weldTolerance ?? DEFAULT_WELD_TOLERANCE;
  const quality = options?.quality ?? 'med';
  const nearLosslessDecimation = options?.nearLosslessDecimation !== false;
  const enforceManifold = options?.enforceManifold === true;
  const manifoldFaceLimit = options?.manifoldFaceLimit ?? DEFAULT_MANIFOLD_FACE_LIMIT;

  let geometry = source.clone();

  if (optimize) {
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    const canWeld = Boolean(position && position.count <= 1200000);

    if (canWeld) {
      const welded = BufferGeometryUtils.mergeVertices(geometry, weldTolerance) as THREE.BufferGeometry;
      if (welded !== geometry) {
        geometry.dispose();
        geometry = welded;
      }
    }

    const cleaned = await removeDegenerateAndDuplicateTrianglesAsync(geometry);
    if (cleaned !== geometry) {
      geometry.dispose();
      geometry = cleaned;
    }

    const index = geometry.getIndex();
    const triangleCount = index ? Math.floor(index.count / 3) : Math.floor((geometry.getAttribute('position') as THREE.BufferAttribute).count / 3);

    if (nearLosslessDecimation && triangleCount > 120000) {
      geometry.computeBoundingBox();
      const bbox = geometry.boundingBox;
      if (bbox) {
        const diagonal = bbox.min.distanceTo(bbox.max);
        const qualityFactor = quality === 'high' ? 0.0000012 : quality === 'med' ? 0.0000025 : 0.000004;
        const decimationTolerance = Math.max(weldTolerance, diagonal * qualityFactor);

        const decimated = BufferGeometryUtils.mergeVertices(geometry, decimationTolerance) as THREE.BufferGeometry;
        if (decimated !== geometry) {
          geometry.dispose();
          geometry = decimated;
        }

        const cleanedDecimated = await removeDegenerateAndDuplicateTrianglesAsync(geometry);
        if (cleanedDecimated !== geometry) {
          geometry.dispose();
          geometry = cleanedDecimated;
        }
        await yieldToBrowser();
      }
    }
  }

  if (enforceManifold && geometry.getIndex()) {
    const report = getTopologyReport(geometry);
    if (!report.isManifold && report.faces <= manifoldFaceLimit) {
      const repaired = surgicalSlotRepair(geometry);
      if (repaired !== geometry) {
        geometry.dispose();
        geometry = repaired;
      }
    }
  }

  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
};

/**
 * Simple STL Exporter for Three.js geometries
 * Exports geometries to binary STL format
 */
export class STLExporter {
  /**
   * Parse a Three.js object (Group, Mesh, or Geometry) and return binary STL data
   */
  parse(object: THREE.Object3D | THREE.BufferGeometry, options?: STLParseOptions): ArrayBuffer {
    const binary = options?.binary !== false;

    let geometry: THREE.BufferGeometry | null = null;

    if (object instanceof THREE.BufferGeometry) {
      geometry = object;
    } else if (object instanceof THREE.Mesh) {
      geometry = object.geometry as THREE.BufferGeometry;
    } else if (object instanceof THREE.Group) {
      // Merge all meshes in the group
      geometry = this.mergeGeometries(object);
    }

    if (!geometry) {
      throw new Error('No valid geometry found to export');
    }

    const cleanedGeometry = cleanupGeometryForExport(geometry, options);

    try {
      if (binary) {
        return this.writeBinary(cleanedGeometry);
      }

      // ASCII path kept for compatibility with legacy callers.
      const ascii = this.writeASCII(cleanedGeometry);
      const encoded = new TextEncoder().encode(ascii);
      return encoded.buffer;
    } finally {
      cleanedGeometry.dispose();
    }

  }

  async parseAsync(object: THREE.Object3D | THREE.BufferGeometry, options?: STLParseOptions): Promise<ArrayBuffer> {
    const binary = options?.binary !== false;

    let geometry: THREE.BufferGeometry | null = null;

    if (object instanceof THREE.BufferGeometry) {
      geometry = object;
    } else if (object instanceof THREE.Mesh) {
      geometry = object.geometry as THREE.BufferGeometry;
    } else if (object instanceof THREE.Group) {
      geometry = this.mergeGeometries(object);
    }

    if (!geometry) {
      throw new Error('No valid geometry found to export');
    }

    const cleanedGeometry = await cleanupGeometryForExportAsync(geometry, options);

    try {
      if (binary) {
        return await this.writeBinaryAsync(cleanedGeometry);
      }

      const ascii = this.writeASCII(cleanedGeometry);
      const encoded = new TextEncoder().encode(ascii);
      return encoded.buffer;
    } finally {
      cleanedGeometry.dispose();
    }
  }

  /**
   * Merge all geometries from a group into a single geometry
   */
  private mergeGeometries(group: THREE.Group): THREE.BufferGeometry {
    const geometries: THREE.BufferGeometry[] = [];

    group.updateMatrixWorld(true);

    group.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        const transformed = (child.geometry as THREE.BufferGeometry).clone();
        transformed.applyMatrix4(child.matrixWorld);
        geometries.push(transformed);
      }
    });

    if (geometries.length === 0) {
      throw new Error('No geometries found in group');
    }

    // Merge using BufferGeometry merge approach
    const merged = new THREE.BufferGeometry();
    const positions: number[] = [];
    const indices: number[] = [];
    let indexOffset = 0;

    geometries.forEach((geom) => {
      const pos = geom.getAttribute('position');
      if (pos) {
        for (let i = 0; i < pos.count; i++) {
          positions.push(
            pos.getX(i),
            pos.getY(i),
            pos.getZ(i)
          );
        }

        if (geom.index) {
          for (let i = 0; i < geom.index.count; i++) {
            indices.push((geom.index.getX(i) as number) + indexOffset);
          }
        } else {
          for (let i = 0; i < pos.count; i++) {
            indices.push(i + indexOffset);
          }
        }

        indexOffset += pos.count;
      }

      geom.dispose();
    });

    merged.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    merged.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));

    return merged;
  }

  /**
   * Write geometry as ASCII STL
   */
  private writeASCII(geometry: THREE.BufferGeometry): string {
    let output = 'solid geometry\n';

    geometry.computeVertexNormals();

    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    const normal = geometry.getAttribute('normal') as THREE.BufferAttribute;
    const index = geometry.getIndex();

    if (index) {
      // Indexed geometry
      for (let i = 0; i < index.count; i += 3) {
        const a = index.getX(i) as number;
        const b = index.getX(i + 1) as number;
        const c = index.getX(i + 2) as number;

        const nx = normal ? normal.getX(a) : 0;
        const ny = normal ? normal.getY(a) : 0;
        const nz = normal ? normal.getZ(a) : 0;

        output += this.writeFace(
          position.getX(a) as number, position.getY(a) as number, position.getZ(a) as number,
          position.getX(b) as number, position.getY(b) as number, position.getZ(b) as number,
          position.getX(c) as number, position.getY(c) as number, position.getZ(c) as number,
          nx, ny, nz
        );
      }
    } else {
      // Non-indexed geometry
      for (let i = 0; i < position.count; i += 3) {
        const nx = normal ? normal.getX(i) : 0;
        const ny = normal ? normal.getY(i) : 0;
        const nz = normal ? normal.getZ(i) : 0;

        output += this.writeFace(
          position.getX(i) as number, position.getY(i) as number, position.getZ(i) as number,
          position.getX(i + 1) as number, position.getY(i + 1) as number, position.getZ(i + 1) as number,
          position.getX(i + 2) as number, position.getY(i + 2) as number, position.getZ(i + 2) as number,
          nx, ny, nz
        );
      }
    }

    output += 'endsolid geometry\n';

    return output;
  }

  /**
   * Write face to ASCII STL format
   */
  private writeFace(
    x1: number, y1: number, z1: number,
    x2: number, y2: number, z2: number,
    x3: number, y3: number, z3: number,
    nx: number, ny: number, nz: number
  ): string {
    let output = '';
    output += `  facet normal ${nx} ${ny} ${nz}\n`;
    output += '    outer loop\n';
    output += `      vertex ${x1} ${y1} ${z1}\n`;
    output += `      vertex ${x2} ${y2} ${z2}\n`;
    output += `      vertex ${x3} ${y3} ${z3}\n`;
    output += '    endloop\n';
    output += '  endfacet\n';
    return output;
  }

  /**
   * Write geometry as binary STL
   */
  private writeBinary(geometry: THREE.BufferGeometry): ArrayBuffer {
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    const index = geometry.getIndex();

    let triangles = 0;

    if (index) {
      triangles = index.count / 3;
    } else {
      triangles = position.count / 3;
    }

    // Header: 80 bytes + triangle count: 4 bytes = 84 bytes total
    const headerArrayBuffer = new ArrayBuffer(84);
    const header = new Uint8Array(headerArrayBuffer);
    const headerText = 'binary STL exported from Three.js';

    for (let i = 0; i < headerText.length && i < 80; i++) {
      header[i] = headerText.charCodeAt(i);
    }

    // Write triangle count at offset 80
    const headerView = new DataView(headerArrayBuffer);
    headerView.setUint32(80, triangles, true);

    const triangleArrayBuffer = new ArrayBuffer(triangles * 50);
    const triangleView = new DataView(triangleArrayBuffer);

    let offset = 0;

    const posArray = position.array as ArrayLike<number>;
    const idxArray = index ? (index.array as ArrayLike<number>) : null;

    for (let i = 0; i < triangles; i++) {
      const ia = idxArray ? Number(idxArray[i * 3]) : i * 3;
      const ib = idxArray ? Number(idxArray[i * 3 + 1]) : i * 3 + 1;
      const ic = idxArray ? Number(idxArray[i * 3 + 2]) : i * 3 + 2;

      const a3 = ia * 3;
      const b3 = ib * 3;
      const c3 = ic * 3;

      const ax = Number(posArray[a3]);
      const ay = Number(posArray[a3 + 1]);
      const az = Number(posArray[a3 + 2]);
      const bx = Number(posArray[b3]);
      const by = Number(posArray[b3 + 1]);
      const bz = Number(posArray[b3 + 2]);
      const cx = Number(posArray[c3]);
      const cy = Number(posArray[c3 + 1]);
      const cz = Number(posArray[c3 + 2]);

      // Calculate face normal directly from triangle vertices.
      const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
      const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);

      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      const nnx = len > 0 ? nx / len : 0;
      const nny = len > 0 ? ny / len : 0;
      const nnz = len > 0 ? nz / len : 0;

      triangleView.setFloat32(offset, nnx, true);
      offset += 4;
      triangleView.setFloat32(offset, nny, true);
      offset += 4;
      triangleView.setFloat32(offset, nnz, true);
      offset += 4;

      triangleView.setFloat32(offset, ax, true);
      offset += 4;
      triangleView.setFloat32(offset, ay, true);
      offset += 4;
      triangleView.setFloat32(offset, az, true);
      offset += 4;

      triangleView.setFloat32(offset, bx, true);
      offset += 4;
      triangleView.setFloat32(offset, by, true);
      offset += 4;
      triangleView.setFloat32(offset, bz, true);
      offset += 4;

      triangleView.setFloat32(offset, cx, true);
      offset += 4;
      triangleView.setFloat32(offset, cy, true);
      offset += 4;
      triangleView.setFloat32(offset, cz, true);
      offset += 4;

      // Attribute byte count
      triangleView.setUint16(offset, 0, true);
      offset += 2;
    }

    const combinedArrayBuffer = new ArrayBuffer(headerArrayBuffer.byteLength + triangleArrayBuffer.byteLength);
    const combinedView = new Uint8Array(combinedArrayBuffer);
    combinedView.set(new Uint8Array(headerArrayBuffer), 0);
    combinedView.set(new Uint8Array(triangleArrayBuffer), headerArrayBuffer.byteLength);

    return combinedArrayBuffer;
  }

  private async writeBinaryAsync(geometry: THREE.BufferGeometry): Promise<ArrayBuffer> {
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    const index = geometry.getIndex();

    const triangles = index ? index.count / 3 : position.count / 3;

    const headerArrayBuffer = new ArrayBuffer(84);
    const header = new Uint8Array(headerArrayBuffer);
    const headerText = 'binary STL exported from Three.js';

    for (let i = 0; i < headerText.length && i < 80; i++) {
      header[i] = headerText.charCodeAt(i);
    }

    const headerView = new DataView(headerArrayBuffer);
    headerView.setUint32(80, triangles, true);

    const triangleArrayBuffer = new ArrayBuffer(triangles * 50);
    const triangleView = new DataView(triangleArrayBuffer);

    let offset = 0;
    const posArray = position.array as ArrayLike<number>;
    const idxArray = index ? (index.array as ArrayLike<number>) : null;

    for (let i = 0; i < triangles; i++) {
      const ia = idxArray ? Number(idxArray[i * 3]) : i * 3;
      const ib = idxArray ? Number(idxArray[i * 3 + 1]) : i * 3 + 1;
      const ic = idxArray ? Number(idxArray[i * 3 + 2]) : i * 3 + 2;

      const a3 = ia * 3;
      const b3 = ib * 3;
      const c3 = ic * 3;

      const ax = Number(posArray[a3]);
      const ay = Number(posArray[a3 + 1]);
      const az = Number(posArray[a3 + 2]);
      const bx = Number(posArray[b3]);
      const by = Number(posArray[b3 + 1]);
      const bz = Number(posArray[b3 + 2]);
      const cx = Number(posArray[c3]);
      const cy = Number(posArray[c3 + 1]);
      const cz = Number(posArray[c3 + 2]);

      const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
      const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);

      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      const nnx = len > 0 ? nx / len : 0;
      const nny = len > 0 ? ny / len : 0;
      const nnz = len > 0 ? nz / len : 0;

      triangleView.setFloat32(offset, nnx, true); offset += 4;
      triangleView.setFloat32(offset, nny, true); offset += 4;
      triangleView.setFloat32(offset, nnz, true); offset += 4;

      triangleView.setFloat32(offset, ax, true); offset += 4;
      triangleView.setFloat32(offset, ay, true); offset += 4;
      triangleView.setFloat32(offset, az, true); offset += 4;

      triangleView.setFloat32(offset, bx, true); offset += 4;
      triangleView.setFloat32(offset, by, true); offset += 4;
      triangleView.setFloat32(offset, bz, true); offset += 4;

      triangleView.setFloat32(offset, cx, true); offset += 4;
      triangleView.setFloat32(offset, cy, true); offset += 4;
      triangleView.setFloat32(offset, cz, true); offset += 4;

      triangleView.setUint16(offset, 0, true); offset += 2;

      if (i > 0 && i % DEFAULT_YIELD_INTERVAL === 0) {
        await yieldToBrowser();
      }
    }

    const combinedArrayBuffer = new ArrayBuffer(headerArrayBuffer.byteLength + triangleArrayBuffer.byteLength);
    const combinedView = new Uint8Array(combinedArrayBuffer);
    combinedView.set(new Uint8Array(headerArrayBuffer), 0);
    combinedView.set(new Uint8Array(triangleArrayBuffer), headerArrayBuffer.byteLength);

    return combinedArrayBuffer;
  }
}

export class ThreeMFExporter {
  async parse(object: THREE.Object3D | THREE.BufferGeometry, options?: ExportCleanupOptions): Promise<Blob> {
    let geometry: THREE.BufferGeometry | null = null;

    if (object instanceof THREE.BufferGeometry) {
      geometry = object;
    } else if (object instanceof THREE.Mesh) {
      geometry = object.geometry as THREE.BufferGeometry;
    } else if (object instanceof THREE.Group) {
      geometry = this.mergeGeometries(object);
    }

    if (!geometry) {
      throw new Error('No valid geometry found to export');
    }

    const cleaned = await cleanupGeometryForExportAsync(geometry, options);

    try {
      const indexed = cleaned.index ? cleaned : cleaned.clone().setIndex(createSequentialIndex((cleaned.getAttribute('position') as THREE.BufferAttribute).count));
      const position = indexed.getAttribute('position') as THREE.BufferAttribute;
      const indexAttr = indexed.getIndex();

      if (!indexAttr || !position) {
        throw new Error('Geometry has no index/position for 3MF export');
      }

      const positionArray = position.array as ArrayLike<number>;
      const indexArray = indexAttr.array as ArrayLike<number>;

      const vertexXml: string[] = [];
      for (let i = 0; i < position.count; i++) {
        const i3 = i * 3;
        vertexXml.push(
          `<vertex x="${Number(positionArray[i3]).toFixed(6)}" y="${Number(positionArray[i3 + 1]).toFixed(6)}" z="${Number(positionArray[i3 + 2]).toFixed(6)}" />`
        );
        if (i > 0 && i % DEFAULT_YIELD_INTERVAL === 0) {
          await yieldToBrowser();
        }
      }

      const triangleXml: string[] = [];
      for (let i = 0; i < indexArray.length; i += 3) {
        triangleXml.push(
          `<triangle v1="${Number(indexArray[i])}" v2="${Number(indexArray[i + 1])}" v3="${Number(indexArray[i + 2])}" />`
        );
        if (i > 0 && i % (DEFAULT_YIELD_INTERVAL * 3) === 0) {
          await yieldToBrowser();
        }
      }

      const modelXml = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="1" type="model">
      <mesh>
        <vertices>
          ${vertexXml.join('\n          ')}
        </vertices>
        <triangles>
          ${triangleXml.join('\n          ')}
        </triangles>
      </mesh>
    </object>
  </resources>
  <build>
    <item objectid="1" />
  </build>
</model>`;

      const relsXml = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" />
</Relationships>`;

      const contentTypesXml = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" />
</Types>`;

      const zip = new JSZip();
      zip.file('[Content_Types].xml', contentTypesXml);
      zip.file('_rels/.rels', relsXml);
      zip.file('3D/3dmodel.model', modelXml);

      return await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });
    } finally {
      cleaned.dispose();
    }
  }

  private mergeGeometries(group: THREE.Group): THREE.BufferGeometry {
    const geometries: THREE.BufferGeometry[] = [];
    group.updateMatrixWorld(true);

    group.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        const transformed = (child.geometry as THREE.BufferGeometry).clone();
        transformed.applyMatrix4(child.matrixWorld);
        geometries.push(transformed);
      }
    });

    if (geometries.length === 0) {
      throw new Error('No geometries found in group');
    }

    const merged = new THREE.BufferGeometry();
    const positions: number[] = [];
    const indices: number[] = [];
    let indexOffset = 0;

    geometries.forEach((geom) => {
      const pos = geom.getAttribute('position');
      if (pos) {
        for (let i = 0; i < pos.count; i++) {
          positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
        }

        if (geom.index) {
          for (let i = 0; i < geom.index.count; i++) {
            indices.push((geom.index.getX(i) as number) + indexOffset);
          }
        } else {
          for (let i = 0; i < pos.count; i++) {
            indices.push(i + indexOffset);
          }
        }

        indexOffset += pos.count;
      }

      geom.dispose();
    });

    merged.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    merged.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
    return merged;
  }
}
