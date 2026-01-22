import * as THREE from 'three';

const CACHE = new Map<string, THREE.BufferGeometry[]>();

const STATS = {
  hits: 0,
  misses: 0,
  totalHitTime: 0,
  totalMissTime: 0
};

export function makeCacheKey(layerId: string, slotLength: number, slotWidth: number, extrusionDepth: number, bevelEnabled: boolean, bevelAmount: number) {
  return `${layerId}::len=${slotLength.toFixed(3)}::w=${slotWidth.toFixed(3)}::d=${extrusionDepth.toFixed(3)}::bevel=${bevelEnabled ? '1' : '0'}::b=${bevelAmount.toFixed(3)}`;
}

export function getOrCreateSlotGeometries(key: string, creator: () => THREE.BufferGeometry[]) {
  const start = performance.now();
  if (CACHE.has(key)) {
    STATS.hits += 1;
    const originals = CACHE.get(key)!;
    const elapsed = performance.now() - start;
    STATS.totalHitTime += elapsed;
    return originals.map(g => g.clone());
  }
  STATS.misses += 1;
  const geos = creator();
  const elapsed = performance.now() - start;
  STATS.totalMissTime += elapsed;
  // store originals (we'll keep them alive for reuse)
  CACHE.set(key, geos.map(g => g.clone()));
  // return clones to caller
  return geos.map(g => g.clone());
}

export function clearSlotCache() {
  for (const geos of CACHE.values()) {
    geos.forEach(g => g.dispose());
  }
  CACHE.clear();
}

export function getSlotCacheStats() {
  return { ...STATS };
}

export function resetSlotCacheStats() {
  STATS.hits = 0;
  STATS.misses = 0;
  STATS.totalHitTime = 0;
  STATS.totalMissTime = 0;
}
