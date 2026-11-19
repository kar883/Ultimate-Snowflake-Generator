declare module 'three/examples/jsm/utils/BufferGeometryUtils' {
  import type { BufferGeometry } from 'three';

  export function mergeGeometries(
    geometries: BufferGeometry[],
    useGroups?: boolean
  ): BufferGeometry | null;

  export function mergeBufferGeometries(
    geometries: BufferGeometry[],
    useGroups?: boolean
  ): BufferGeometry | null;

  export function mergeVertices(
    geometry: BufferGeometry,
    tolerance?: number
  ): BufferGeometry;

  export function toCreasedNormals(
    geometry: BufferGeometry,
    creaseAngle?: number
  ): BufferGeometry;
}

declare module 'three/examples/jsm/loaders/SVGLoader' {
  import type { Shape } from 'three';

  export class SVGLoader {
    parse(data: string): { paths: unknown[] };
    static createShapes(path: unknown): Shape[];
  }
}
