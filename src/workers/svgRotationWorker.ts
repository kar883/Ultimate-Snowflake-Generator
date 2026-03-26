// Web Worker for SVG Rotation Processing
// This runs in a separate thread to avoid blocking the UI during SVG rotation

interface SvgRotationWorkerMessage {
  type: 'rotate-svg';
  payload: {
    svgPaths: string[];
    svgWidth: number;
    svgHeight: number;
    rotation: number;
  };
}

interface SvgRotationWorkerResponse {
  type: 'svg-rotation-result';
  payload: {
    rotatedPaths: string[];
    success: boolean;
    error?: string;
  };
}

// Function to rotate SVG path data around center point (simplified)
function rotateSvgPath(pathData: string, angle: number, centerX: number, centerY: number): string {
  if (angle === 0) return pathData;
  
  const angleRad = (angle * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);

  // Simple rotation transform - just apply to the whole path
  return `rotate(${angle} ${centerX} ${centerY})${pathData}`;
}

// Handle messages from main thread
self.addEventListener('message', (event: MessageEvent<SvgRotationWorkerMessage>) => {
  const { type, payload } = event.data;
  
  if (type === 'rotate-svg') {
    try {
      const { svgPaths, svgWidth, svgHeight, rotation } = payload;
      const centerX = svgWidth / 2;
      const centerY = svgHeight / 2;
      
      // Rotate each path in the worker
      const rotatedPaths = svgPaths.map(pathData => 
        rotateSvgPath(pathData, rotation, centerX, centerY)
      );
      
      // Send result back to main thread
      const response: SvgRotationWorkerResponse = {
        type: 'svg-rotation-result',
        payload: {
          rotatedPaths,
          success: true
        }
      };
      
      self.postMessage(response);
    } catch (error) {
      console.error('Error in SVG rotation worker:', error);
      
      // Send error result back to main thread
      const response: SvgRotationWorkerResponse = {
        type: 'svg-rotation-result',
        payload: {
          rotatedPaths: [],
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      };
      
      self.postMessage(response);
    }
  }
});

console.log('👷 SVG Rotation Worker ready');
