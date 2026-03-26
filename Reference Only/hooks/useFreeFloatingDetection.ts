import { useState, useCallback, useRef, useEffect } from 'react';
import { SnowflakeConfig } from '../types';

interface FreeFloatingResult {
  freeFloatingLayers: string[];
  timestamp: number;
}

interface UseFreeFloatingDetectionReturn {
  freeFloatingLayers: string[];
  isDetecting: boolean;
  startDetection: (config: SnowflakeConfig) => void;
  stopDetection: () => void;
}

export const useFreeFloatingDetection = (): UseFreeFloatingDetectionReturn => {
  const [freeFloatingLayers, setFreeFloatingLayers] = useState<string[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const detectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize worker
  useEffect(() => {
    try {
      // Create worker from the TypeScript file
      workerRef.current = new Worker(
        new URL('../workers/freeFloatingWorker.ts', import.meta.url),
        { type: 'module' }
      );

      // Handle messages from worker
      workerRef.current.onmessage = (event: MessageEvent) => {
        const { type, payload } = event.data;
        
        if (type === 'free-floating-result') {
          setFreeFloatingLayers(payload.freeFloatingLayers);
          setIsDetecting(false);
        }
      };

      // Handle worker errors
      workerRef.current.onerror = (error) => {
        console.error('Free floating detection worker error:', error);
        setIsDetecting(false);
        setFreeFloatingLayers([]);
      };
    } catch (error) {
      console.error('Failed to create free floating detection worker:', error);
      // Fallback to synchronous detection if worker creation fails
      workerRef.current = null;
    }

    // Cleanup worker on unmount
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      if (detectionTimeoutRef.current) {
        clearTimeout(detectionTimeoutRef.current);
        detectionTimeoutRef.current = null;
      }
    };
  }, []);

  // Start free floating detection
  const startDetection = useCallback((config: SnowflakeConfig) => {
    if (!config.freeFloatingCheck) {
      setFreeFloatingLayers([]);
      return;
    }

    setIsDetecting(true);
    
    // Clear any existing timeout
    if (detectionTimeoutRef.current) {
      clearTimeout(detectionTimeoutRef.current);
    }

    if (workerRef.current) {
      // Use web worker for background detection
      try {
        workerRef.current.postMessage({
          type: 'detect-free-floating',
          payload: { config }
        });

        // Add timeout to prevent infinite detection - increased for complex geometries
        detectionTimeoutRef.current = setTimeout(() => {
          console.warn('Free floating detection timed out - geometry may be too complex');
          setIsDetecting(false);
          setFreeFloatingLayers([]);
        }, 10000); // Increased to 10 seconds for complex slot-cut geometries
      } catch (error) {
        console.error('Failed to start free floating detection:', error);
        setIsDetecting(false);
        setFreeFloatingLayers([]);
      }
    } else {
      // Fallback to synchronous detection (will block UI briefly)
      try {
        // Import the detection function dynamically
        import('../workers/freeFloatingWorker').then(({ detectFreeFloatingBodies }) => {
          const result = detectFreeFloatingBodies(config);
          setFreeFloatingLayers(result);
          setIsDetecting(false);
        }).catch(error => {
          console.error('Fallback detection failed:', error);
          setFreeFloatingLayers([]);
          setIsDetecting(false);
        });
      } catch (error) {
        console.error('Synchronous fallback failed:', error);
        setFreeFloatingLayers([]);
        setIsDetecting(false);
      }
    }
  }, []);

  // Stop detection
  const stopDetection = useCallback(() => {
    if (detectionTimeoutRef.current) {
      clearTimeout(detectionTimeoutRef.current);
      detectionTimeoutRef.current = null;
    }
    setIsDetecting(false);
    setFreeFloatingLayers([]);
  }, []);

  return {
    freeFloatingLayers,
    isDetecting,
    startDetection,
    stopDetection
  };
};
