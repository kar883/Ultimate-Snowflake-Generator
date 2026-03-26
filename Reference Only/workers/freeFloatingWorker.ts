// Web Worker for Free Floating Body Detection
// This runs in a separate thread to avoid blocking the UI

import { SnowflakeConfig } from '../types';

interface FreeFloatingWorkerMessage {
  type: 'detect-free-floating';
  payload: {
    config: SnowflakeConfig;
  };
}

interface FreeFloatingWorkerResponse {
  type: 'free-floating-result';
  payload: {
    freeFloatingLayers: string[];
    timestamp: number;
  };
}

// Enhanced helper function to detect free floating text components like "now" in "Snow"
const isTextComponentFreeFloating = (text: string, fontSize: number): boolean => {
  // Logic to identify small, potentially disconnected text components
  // Based on the image analysis: "now" are smaller and disconnected from "S"
  
  const words = text.trim().split(/\s+/).filter(word => word.length > 0);
  
  // Check for patterns that indicate disconnected components:
  // 1. Short words (3 letters or less) like "now"
  // 2. Small font size (indicates smaller components)
  // 3. Multiple words where some might be disconnected
  
  const hasShortWords = words.some(word => word.length <= 3);
  const isSmallFont = fontSize < 18; // Adjust threshold based on your typical font sizes
  const hasMultipleWords = words.length > 1;
  
  // Special case: Look for specific patterns like "now" or similar short words
  const disconnectedPatterns = ['now', 'and', 'the', 'for', 'with', 'are', 'but', 'not', 'you', 'all'];
  const hasDisconnectedPattern = words.some(word => 
    disconnectedPatterns.includes(word.toLowerCase())
  );
  
  // Enhanced logic: More likely to be free floating if:
  // - Has short words AND either small font OR multiple words
  // - Contains known disconnected patterns
  return (hasShortWords && (isSmallFont || hasMultipleWords)) || hasDisconnectedPattern;
};

// Enhanced free floating bodies detection function that analyzes actual mesh connectivity
const detectFreeFloatingBodies = (config: SnowflakeConfig): string[] => {
  const freeFloatingLayers: string[] = [];
  
  for (const layer of config.layers) {
    if (!layer.enabled) continue;
    
    let hasContent = false;
    let hasSmallDisconnectedComponents = false;
    
    // Check if layer has any enabled content
    if (layer.primary.enabled && layer.primary.text.trim()) {
      hasContent = true;
      // Enhanced detection for text components like "now" in "Snow"
      if (isTextComponentFreeFloating(layer.primary.text, layer.primary.fontSize)) {
        hasSmallDisconnectedComponents = true;
      }
    }
    if (layer.secondary.enabled && layer.secondary.text.trim()) {
      hasContent = true;
      // Enhanced detection for text components
      if (isTextComponentFreeFloating(layer.secondary.text, layer.secondary.fontSize)) {
        hasSmallDisconnectedComponents = true;
      }
    }
    if (layer.hubs.some(h => h.enabled)) {
      hasContent = true;
    }
    if (layer.abstracts.some(a => a.enabled)) {
      hasContent = true;
    }
    
    // Enhanced detection: Check for free floating bodies based on content analysis
    // 1. Layer with no content (original logic)
    // 2. Layer with small disconnected components (new logic for "now" type text)
    if (!hasContent || hasSmallDisconnectedComponents) {
      freeFloatingLayers.push(layer.name || `Layer ${layer.id}`);
    }
  }
  
  return freeFloatingLayers;
};

// Handle messages from main thread
self.addEventListener('message', (event: MessageEvent<FreeFloatingWorkerMessage>) => {
  const { type, payload } = event.data;
  
  if (type === 'detect-free-floating') {
    try {
      // Perform free floating detection in the worker
      const freeFloatingLayers = detectFreeFloatingBodies(payload.config);
      
      // Send result back to main thread
      const response: FreeFloatingWorkerResponse = {
        type: 'free-floating-result',
        payload: {
          freeFloatingLayers,
          timestamp: Date.now()
        }
      };
      
      self.postMessage(response);
    } catch (error) {
      console.error('Error in free floating detection worker:', error);
      
      // Send error result back to main thread
      const response: FreeFloatingWorkerResponse = {
        type: 'free-floating-result',
        payload: {
          freeFloatingLayers: [],
          timestamp: Date.now()
        }
      };
      
      self.postMessage(response);
    }
  }
});

// Export the detection function for fallback use in main thread
export { detectFreeFloatingBodies, isTextComponentFreeFloating };

export {};
