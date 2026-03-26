import { useState, useRef, useCallback, useEffect } from 'react';

interface BodiesWorkerState {
  bodyPerVertex: Int32Array | null;
  bodyCount: number;
  bodyColors: Float32Array | null;
  isAnalyzing: boolean;
  error: string | null;
  progress: number; // 0-1
  stage: string;
}

export const useBodiesWorker = () => {
  const [state, setState] = useState<BodiesWorkerState>({
    bodyPerVertex: null,
    bodyCount: 0,
    bodyColors: null,
    isAnalyzing: false,
    error: null,
    progress: 0,
    stage: ''
  });

  const workerRef = useRef<Worker | null>(null);
  const analysisRef = useRef<number | null>(null);

  // Initialize worker
  useEffect(() => {
    try {
      workerRef.current = new Worker(
        new URL('../workers/bodiesWorker.ts', import.meta.url),
        { type: 'module' }
      );

      // Handle messages from worker
      workerRef.current.onmessage = (event: MessageEvent) => {
        const { type, payload } = event.data;
        
        if (type === 'bodies-progress') {
          setState(prev => ({
            ...prev,
            progress: payload.progress,
            stage: payload.stage
          }));
        } else if (type === 'bodies-result') {
          setState(prev => ({
            ...prev,
            bodyPerVertex: payload.success ? payload.bodyPerVertex : null,
            bodyCount: payload.success ? payload.bodyCount : 0,
            bodyColors: payload.success ? payload.bodyColors : null,
            isAnalyzing: false,
            error: payload.success ? null : payload.error || 'Analysis failed',
            progress: payload.success ? 1.0 : 0,
            stage: payload.success ? 'Complete' : 'Failed'
          }));
          
          if (analysisRef.current) {
            cancelAnimationFrame(analysisRef.current);
            analysisRef.current = null;
          }
        }
      };

      // Handle worker errors
      workerRef.current.onerror = (error) => {
        console.error('❌ Bodies worker error:', error);
        setState(prev => ({
          ...prev,
          isAnalyzing: false,
          error: 'Worker error occurred',
          stage: 'Failed'
        }));
      };
    } catch (error) {
      console.error('❌ Failed to initialize bodies worker:', error);
      setState(prev => ({
        ...prev,
        error: 'Failed to initialize worker',
        stage: 'Failed'
      }));
    }

    // Cleanup
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      if (analysisRef.current) {
        cancelAnimationFrame(analysisRef.current);
        analysisRef.current = null;
      }
    };
  }, []);

  const analyzeBodies = useCallback((
    positionArray: Float32Array,
    indexArray?: Uint32Array | Uint16Array,
    designColor: string = '#38bdf8',
    maxVertices: number = 50000 // Optimized for performance
  ) => {
    if (!workerRef.current || state.isAnalyzing) return;

    // Reset state
    setState(prev => ({
      ...prev,
      isAnalyzing: true,
      error: null,
      progress: 0,
      stage: 'Starting analysis...'
    }));

    try {
      console.log(`🔍 Starting bodies analysis with ${positionArray.length / 3} vertices (max: ${maxVertices})`);
      
      workerRef.current.postMessage({
        type: 'analyze-bodies',
        payload: {
          positionArray,
          indexArray,
          designColor,
          maxVertices
        }
      });
    } catch (error) {
      console.error('❌ Failed to send message to bodies worker:', error);
      setState(prev => ({
        ...prev,
        isAnalyzing: false,
        error: 'Failed to start analysis',
        stage: 'Failed'
      }));
    }
  }, [state.isAnalyzing]);

  const clearResults = useCallback(() => {
    setState(prev => ({
      ...prev,
      bodyPerVertex: null,
      bodyCount: 0,
      bodyColors: null,
      error: null,
      progress: 0,
      stage: ''
    }));
  }, []);

  return {
    ...state,
    analyzeBodies,
    clearResults
  };
};
