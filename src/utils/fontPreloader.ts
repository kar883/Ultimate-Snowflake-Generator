import opentype from 'opentype.js';
import { FONT_TTF_URLS, CURSIVE_FONTS } from '../constants';

export interface FontPreloadResult {
  success: string[];
  failed: { name: string; error: string }[];
  total: number;
  loaded: number;
}

class FontPreloader {
  private cache: Map<string, opentype.Font> = new Map();
  private preloadPromise: Promise<FontPreloadResult> | null = null;
  private isPreloading: boolean = false;

  /**
   * Preload all hardcoded fonts for seamless switching
   */
  async preloadAllFonts(): Promise<FontPreloadResult> {
    if (this.preloadPromise && this.isPreloading) {
      return this.preloadPromise;
    }

    if (this.cache.size > 0) {
      // Already preloaded
      return {
        success: Array.from(this.cache.keys()),
        failed: [],
        total: this.cache.size,
        loaded: this.cache.size
      };
    }

    this.isPreloading = true;
    
    this.preloadPromise = this.doPreload();
    
    const result = await this.preloadPromise;
    this.isPreloading = false;
    
    return result;
  }

  private async doPreload(): Promise<FontPreloadResult> {
    const result: FontPreloadResult = {
      success: [],
      failed: [],
      total: 0,
      loaded: 0
    };

    // Get all unique font names from CURSIVE_FONTS that have URLs
    const fontNames = CURSIVE_FONTS
      .filter(font => FONT_TTF_URLS[font.name])
      .map(font => font.name);

    result.total = fontNames.length;

    // Load fonts in parallel with concurrency control
    const concurrentLoads = 3; // Load 3 fonts at a time
    const chunks = this.chunkArray(fontNames, concurrentLoads);

    for (const chunk of chunks) {
      const promises = chunk.map(async (fontName) => {
        try {
          const font = await this.loadSingleFont(fontName);
          if (font) {
            this.cache.set(fontName, font);
            result.success.push(fontName);
            result.loaded++;
          }
        } catch (error) {
          result.failed.push({
            name: fontName,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      });

      await Promise.allSettled(promises);
    }

    return result;
  }

  private async loadSingleFont(fontName: string): Promise<opentype.Font> {
    const url = FONT_TTF_URLS[fontName];
    if (!url) {
      throw new Error(`No URL found for font: ${fontName}`);
    }

    return new Promise((resolve, reject) => {
      opentype.load(url, (err, font) => {
        if (err || !font) {
          reject(err || new Error(`Failed to load font: ${fontName}`));
          return;
        }
        resolve(font);
      });
    });
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Get a preloaded font by name
   */
  getFont(fontName: string): opentype.Font | null {
    // Clean font name (remove quotes and split by comma)
    const cleanName = fontName.replace(/'/g, '').split(',')[0].trim();
    const font = this.cache.get(cleanName);
    console.log(`🔍 FontPreloader.getFont(${fontName}) -> ${font ? 'FOUND' : 'NOT FOUND'} (cache size: ${this.cache.size})`);
    return font || null;
  }

  /**
   * Check if a font is preloaded
   */
  isFontLoaded(fontName: string): boolean {
    const cleanName = fontName.replace(/'/g, '').split(',')[0].trim();
    return this.cache.has(cleanName);
  }

  /**
   * Get preloading progress
   */
  getPreloadProgress(): { isPreloading: boolean; loaded: number; total: number } {
    return {
      isPreloading: this.isPreloading,
      loaded: this.cache.size,
      total: CURSIVE_FONTS.filter(font => FONT_TTF_URLS[font.name]).length
    };
  }

  /**
   * Clear the font cache
   */
  clearCache(): void {
    this.cache.clear();
    this.preloadPromise = null;
    this.isPreloading = false;
  }
}

// Singleton instance
export const fontPreloader = new FontPreloader();

// Hook for React components
export const useFontPreloader = () => {
  const preloadAllFonts = () => fontPreloader.preloadAllFonts();
  const getFont = (fontName: string) => fontPreloader.getFont(fontName);
  const isFontLoaded = (fontName: string) => fontPreloader.isFontLoaded(fontName);
  const getProgress = () => fontPreloader.getPreloadProgress();
  const clearCache = () => fontPreloader.clearCache();

  return {
    preloadAllFonts,
    getFont,
    isFontLoaded,
    getProgress,
    clearCache
  };
};
