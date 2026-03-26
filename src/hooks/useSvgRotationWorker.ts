import { useState, useRef, useEffect, useCallback } from 'react';
import { ImageConfig } from '../types';

interface UseSvgRotationWorkerReturn {
  rotatedPaths: Map<string, string[]>;
  isRotating: boolean;
  rotateSvg: (imageId: string, svgPaths: string[], svgWidth: number, svgHeight: number, rotation: number) => void;
  clearCache: () => void;
}

export const useSvgRotationWorker = (): UseSvgRotationWorkerReturn => {
  const [rotatedPaths, setRotatedPaths] = useState<Map<string, string[]>>(new Map());
  const [isRotating, setIsRotating] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const rotationCache = useRef<Map<string, string[]>>(new Map());

  // Initialize worker
  useEffect(() => {
    try {
      // Create worker from the TypeScript file
      workerRef.current = new Worker(
        new URL('../workers/svgRotationWorker.ts', import.meta.url),
        { type: 'module' }
      );

      // Handle messages from worker
      workerRef.current.onmessage = (event: MessageEvent) => {
        const { type, payload } = event.data;
        
        if (type === 'svg-rotation-result') {
          setIsRotating(false);
          
          if (payload.success) {
            // Cache the rotated paths with simpler key
            const cacheKey = `rotated_${payload.rotatedPaths.length}_${Date.now()}`;
            rotationCache.current.set(cacheKey, payload.rotatedPaths);
            
            // Limit cache size to prevent memory bloat
            if (rotationCache.current.size > 50) {
              const entries = Array.from(rotationCache.current.entries());
              const toDelete = entries.slice(0, entries.length - 50);
              toDelete.forEach(([key]) => rotationCache.current.delete(key));
            }
            
            setRotatedPaths(new Map(rotationCache.current));
          } else {
            console.error('SVG rotation failed:', payload.error);
          }
        }
      };

      // Handle worker errors
      workerRef.current.onerror = (error) => {
        console.error('SVG rotation worker error:', error);
        setIsRotating(false);
      };
    } catch (error) {
      console.error('Failed to create SVG rotation worker:', error);
      // Fallback to synchronous rotation if worker creation fails
      workerRef.current = null;
    }

    // Cleanup worker on unmount
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  const rotateSvg = useCallback((
    imageId: string,
    svgPaths: string[],
    svgWidth: number,
    svgHeight: number,
    rotation: number
  ) => {
    // Create simpler cache key to avoid memory bloat
    const cacheKey = `${imageId}_${svgWidth}_${svgHeight}_${rotation}`;
    
    // Check cache first
    if (rotationCache.current.has(cacheKey)) {
      setRotatedPaths(new Map(rotationCache.current));
      return;
    }

    // Skip rotation if angle is 0 (no rotation needed)
    if (rotation === 0) {
      rotationCache.current.set(cacheKey, svgPaths);
      setRotatedPaths(new Map(rotationCache.current));
      return;
    }

    setIsRotating(true);

    if (workerRef.current) {
      // Use web worker for background rotation
      try {
        workerRef.current.postMessage({
          type: 'rotate-svg',
          payload: {
            imageId,
            svgPaths,
            svgWidth,
            svgHeight,
            rotation
          }
        });
        
        // Cache the promise (we'll update when worker responds)
        rotationCache.current.set(cacheKey, svgPaths); // Fallback to original paths
      } catch (error) {
        console.error('Failed to post message to SVG rotation worker:', error);
        setIsRotating(false);
        
        // Fallback to synchronous rotation
        try {
          // For now, just use original paths as fallback
          rotationCache.current.set(cacheKey, svgPaths);
          setRotatedPaths(new Map(rotationCache.current));
        } catch (fallbackError) {
          console.error('Synchronous SVG rotation fallback failed:', fallbackError);
        }
      }
    } else {
      // Fallback to synchronous rotation (will block UI briefly)
      try {
        // For now, just use original paths as fallback
        rotationCache.current.set(cacheKey, svgPaths);
        setRotatedPaths(new Map(rotationCache.current));
        setIsRotating(false);
      } catch (error) {
        console.error('Synchronous SVG rotation failed:', error);
        setIsRotating(false);
      }
    }
  }, []);

  const clearCache = useCallback(() => {
    rotationCache.current.clear();
    setRotatedPaths(new Map());
  }, []);

  // Limit cache size to prevent memory bloat
  const limitCacheSize = useCallback(() => {
    const MAX_CACHE_SIZE = 50; // Limit to 50 cached rotations
    if (rotationCache.current.size > MAX_CACHE_SIZE) {
      const entries = Array.from(rotationCache.current.entries());
      const toDelete = entries.slice(0, entries.length - MAX_CACHE_SIZE);
      toDelete.forEach(([key]) => rotationCache.current.delete(key));
      setRotatedPaths(new Map(rotationCache.current));
    }
  }, []);

  return {
    rotatedPaths,
    isRotating,
    rotateSvg,
    clearCache
  };
};
