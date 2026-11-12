/**
 * IMPROVED SLOT CUT PRE-COMPUTATION SYSTEM
 * 
 * Problem with the old system:
 * 1. Pre-compute creates geometry via generateMesh()
 * 2. Actual render creates DIFFERENT geometry (content may change)
 * 3. Cache keys don't match → always misses
 * 4. Re-generates every time → slow
 * 
 * New approach:
 * 1. Cache the SLOT GEOMETRIES themselves (not the cut result)
 * 2. Cache the BASE layer geometry with content hash
 * 3. Only compute slots once per config
 * 4. Apply cached slots to current geometry on-the-fly
 */

import * as THREE from 'three';

/**
 * Generate a stable hash for layer content
 * This ensures we can tell when layer geometry actually changed
 */
export function hashLayerContent(layer: any, config: any): string {
  const relevantData = {
    // Layer identification
    layerId: layer.id,
    enabled: layer.enabled,
    rotation3D: layer.rotation3D,
    
    // Text content
    primaryText: layer.primary?.enabled ? {
      text: layer.primary.text,
      fontFamily: layer.primary.fontFamily,
      fontSize: layer.primary.fontSize,
      letterSpacing: layer.primary.letterSpacing,
      arms: layer.primary.arms,
      mirrorEnabled: layer.primary.mirrorEnabled,
      mirrorOffset: layer.primary.mirrorOffset,
      textX: layer.primary.textX,
      strokeWeight: layer.primary.strokeWeight,
      underline: layer.primary.underline
    } : null,
    
    secondaryText: layer.secondary?.enabled ? {
      text: layer.secondary.text,
      fontFamily: layer.secondary.fontFamily,
      fontSize: layer.secondary.fontSize,
      letterSpacing: layer.secondary.letterSpacing,
      arms: layer.secondary.arms,
      mirrorEnabled: layer.secondary.mirrorEnabled,
      mirrorOffset: layer.secondary.mirrorOffset,
      textX: layer.secondary.textX,
      strokeWeight: layer.secondary.strokeWeight,
      underline: layer.secondary.underline
    } : null,
    
    // Hubs
    hubs: layer.hubs?.enabled ? {
      outerRadius: layer.hubs.outerRadius,
      wallThickness: layer.hubs.wallThickness,
      starRatio: layer.hubs.starRatio,
      oscillationAmplitude: layer.hubs.oscillationAmplitude,
      oscillationFrequency: layer.hubs.oscillationFrequency,
      sides: layer.hubs.sides,
      shape: layer.hubs.shape,
      oscillationEnabled: layer.hubs.oscillationEnabled,
      hollow: layer.hubs.hollow,
      rotationOffset: layer.hubs.rotationOffset
    } : null,
    
    // Abstracts
    abstracts: layer.abstracts?.enabled ? {
      type: layer.abstracts.type,
      size: layer.abstracts.size,
      recursionDepth: layer.abstracts.recursionDepth,
      lengthDecay: layer.abstracts.lengthDecay,
      trunkLength: layer.abstracts.trunkLength,
      initialLength: layer.abstracts.initialLength,
      randomSeed: layer.abstracts.randomSeed,
      arms: layer.abstracts.arms,
      mirrorEnabled: layer.abstracts.mirrorEnabled,
      mirrorOffset: layer.abstracts.mirrorOffset
    } : null,
    
    // Extrusion settings
    extrusionDepth: config.extrusionDepth,
    bevelEnabled: config.bevelEnabled,
    bevelAmount: config.bevelAmount,
    globalStrokeWeight: config.globalStrokeWeight,
  };
  
  return JSON.stringify(relevantData);
}

/**
 * Generate cache key for slot-cut geometry
 * This includes BOTH the layer content AND slot parameters
 */
export function makeSlotCutCacheKey(
  layerContentHash: string,
  slotLength: number,
  slotWidth: number,
  extrusionDepth: number,
  bevelEnabled: boolean,
  bevelAmount: number,
  globalStrokeWeight: number,
  slotType: string,
  rotation3D: any
): string {
  return `slotcut::${layerContentHash}::len=${slotLength.toFixed(3)}::w=${slotWidth.toFixed(3)}::d=${extrusionDepth.toFixed(3)}::bevel=${bevelEnabled}::b=${bevelAmount.toFixed(3)}::bold=${globalStrokeWeight.toFixed(3)}::type=${slotType}::rot=${rotation3D.x}_${rotation3D.y}_${rotation3D.z || 0}`;
}

/**
 * Improved slot cut cache
 * Stores both base geometries and final cut results
 */
export class ImprovedSlotCutCache {
  // Cache for layer base geometries (before slot cuts)
  private baseGeometryCache = new Map<string, THREE.BufferGeometry>();
  
  // Cache for final slot-cut geometries
  private slotCutCache = new Map<string, THREE.BufferGeometry>();
  
  // Stats
  private stats = {
    baseHits: 0,
    baseMisses: 0,
    cutHits: 0,
    cutMisses: 0
  };
  
  /**
   * Get or generate base layer geometry (before slots)
   */
  async getOrCreateBaseGeometry(
    contentHash: string,
    generator: () => Promise<THREE.BufferGeometry>
  ): Promise<THREE.BufferGeometry> {
    
    if (this.baseGeometryCache.has(contentHash)) {
      this.stats.baseHits++;
      console.log(`⚡ Base geometry cache HIT (${this.stats.baseHits} hits, ${this.stats.baseMisses} misses)`);
      return this.baseGeometryCache.get(contentHash)!.clone();
    }
    
    this.stats.baseMisses++;
    console.log(`⚡ Base geometry cache MISS - generating (${this.stats.baseHits} hits, ${this.stats.baseMisses} misses)`);
    
    const geometry = await generator();
    
    // Store in cache
    this.baseGeometryCache.set(contentHash, geometry.clone());
    
    return geometry;
  }
  
  /**
   * Get or generate slot-cut geometry
   */
  async getOrCreateSlotCutGeometry(
    cacheKey: string,
    generator: () => Promise<THREE.BufferGeometry>
  ): Promise<THREE.BufferGeometry> {
    
    if (this.slotCutCache.has(cacheKey)) {
      this.stats.cutHits++;
      console.log(`⚡ Slot cut cache HIT (${this.stats.cutHits} hits, ${this.stats.cutMisses} misses)`);
      return this.slotCutCache.get(cacheKey)!.clone();
    }
    
    this.stats.cutMisses++;
    console.log(`⚡ Slot cut cache MISS - computing (${this.stats.cutHits} hits, ${this.stats.cutMisses} misses)`);
    
    const geometry = await generator();
    
    // Store in cache
    this.slotCutCache.set(cacheKey, geometry.clone());
    
    return geometry;
  }
  
  /**
   * Clear all caches
   */
  clear(): void {
    // Dispose all geometries
    this.baseGeometryCache.forEach(geo => geo.dispose());
    this.slotCutCache.forEach(geo => geo.dispose());
    
    // Clear maps
    this.baseGeometryCache.clear();
    this.slotCutCache.clear();
    
    // Reset stats
    this.stats = {
      baseHits: 0,
      baseMisses: 0,
      cutHits: 0,
      cutMisses: 0
    };
    
    console.log('🗑️ Slot cut caches cleared');
  }
  
  /**
   * Get cache statistics
   */
  getStats() {
    const baseTotal = this.stats.baseHits + this.stats.baseMisses;
    const cutTotal = this.stats.cutHits + this.stats.cutMisses;
    
    return {
      base: {
        hits: this.stats.baseHits,
        misses: this.stats.baseMisses,
        total: baseTotal,
        hitRate: baseTotal > 0 ? (this.stats.baseHits / baseTotal * 100).toFixed(1) : '0.0'
      },
      cut: {
        hits: this.stats.cutHits,
        misses: this.stats.cutMisses,
        total: cutTotal,
        hitRate: cutTotal > 0 ? (this.stats.cutHits / cutTotal * 100).toFixed(1) : '0.0'
      },
      sizes: {
        baseGeometries: this.baseGeometryCache.size,
        slotCutGeometries: this.slotCutCache.size
      }
    };
  }
  
  /**
   * Print statistics to console
   */
  printStats(): void {
    const stats = this.getStats();
    console.log('📊 SLOT CUT CACHE STATISTICS:');
    console.log(`  Base Geometry: ${stats.base.hits}/${stats.base.total} hits (${stats.base.hitRate}%)`);
    console.log(`  Slot Cuts: ${stats.cut.hits}/${stats.cut.total} hits (${stats.cut.hitRate}%)`);
    console.log(`  Cache Sizes: ${stats.sizes.baseGeometries} base, ${stats.sizes.slotCutGeometries} cut`);
  }
  
  /**
   * Invalidate cache for specific layer
   */
  invalidateLayer(layerContentHash: string): void {
    // Remove base geometry
    const baseGeo = this.baseGeometryCache.get(layerContentHash);
    if (baseGeo) {
      baseGeo.dispose();
      this.baseGeometryCache.delete(layerContentHash);
    }
    
    // Remove all slot cuts that depend on this base
    const keysToRemove: string[] = [];
    this.slotCutCache.forEach((geo, key) => {
      if (key.includes(layerContentHash)) {
        geo.dispose();
        keysToRemove.push(key);
      }
    });
    
    keysToRemove.forEach(key => this.slotCutCache.delete(key));
    
    console.log(`🗑️ Invalidated layer cache: ${keysToRemove.length + 1} entries removed`);
  }
}

// Create singleton instance
export const improvedSlotCutCache = new ImprovedSlotCutCache();
