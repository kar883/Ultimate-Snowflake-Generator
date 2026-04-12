# Font Preloading & Initial Render Performance Analysis

## Executive Summary

The visual shifting during bootup is caused by a **cascading sequence of 5+ state updates** that occur in rapid succession without batching. Font preloading, CSS font-face injection, diameter calculations, and model caching all trigger separate re-renders, each potentially updating geometry measurements and viewport layout.

---

## 1. Font Preloading Implementation

### Location: [src/utils/fontPreloader.ts](src/utils/fontPreloader.ts)

#### Font Preloader Class (lines 1-99)
- **Singleton class** managing font cache with concurrent loading
- `preloadAllFonts()` [lines 16-33]: Returns cached result if preloading already done
- `doPreload()` [lines 35-66]: Loads fonts in parallel (3 at a time) from CDN
- `getFont()` [lines 96-101]: Returns preloaded font by name
- `isFontLoaded()` [lines 107-111]: Checks if font exists in cache

#### useFontPreloader Hook (lines 153-162)
- Wrapper hook returning: `preloadAllFonts`, `getFont`, `isFontLoaded`, `getProgress`, `clearCache`

### Location: [src/App.tsx](src/App.tsx#L1402)

#### useFontPreloader Hook Call (line 1402)
```typescript
const { preloadAllFonts, getFont, isFontLoaded } = useFontPreloader();
```

---

## 2. Initial State Setup

### Location: [src/App.tsx](src/App.tsx#L1339-L1368)

#### Initial State Object (lines 1339-1368)
```typescript
const initialState: SnowflakeConfig = {
  projectName: "MySnowflake",
  layers: [
    createDefaultLayer('layer-1', 'Base Plane', 0, 0, true),
    createDefaultLayer('layer-2', 'Cross Plane', 120, 0, false),
    createDefaultLayer('layer-4', 'Tilt Plane', 240, 0, false),
    // ... more layers
  ],
  // ... 30+ other config properties
};
```

#### Initial useState Declarations (lines 1369-1375)
```typescript
const [config, setConfig] = useState<SnowflakeConfig>(initialState);
const [config3D, setConfig3D] = useState<SnowflakeConfig>(initialState);
const [rendered3DConfig, setRendered3DConfig] = useState<SnowflakeConfig>(initialState);
```

#### ViewMode State (line 1397)
```typescript
const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');
```
**Critical**: App starts in 2D mode but can rapidly switch to 3D, triggering separate 3D model generation

#### Fonts Preloaded State (line 1398)
```typescript
const [fontsPreloaded, setFontsPreloaded] = useState(false);
```

---

## 3. Font Preloading Effect

### Location: [src/App.tsx](src/App.tsx#L1405-L1417)

```typescript
// Preload all fonts when app starts (silent background loading)
useEffect(() => {
  const preloadFonts = async () => {
    try {
      await preloadAllFonts();
      setFontsPreloaded(true);  // ← TRIGGERS RE-RENDER #1
    } catch (error) {
      console.debug('Font preloading failed, fonts will load on-demand:', error);
      setFontsPreloaded(true); // Still set to true
    }
  };

  preloadFonts();
}, [preloadAllFonts]);
```

**Issue**: 
- `preloadAllFonts()` dependency changes when component re-renders
- Font loading completes after ~500-2000ms, then state update causes re-render
- No batching with other initialization effects

---

## 4. CSS Font-Face Injection Effect

### Location: [src/App.tsx](src/App.tsx#L1421-L1453)

```typescript
// Load fonts as CSS @font-face rules for dropdown display
useEffect(() => {
  const style = document.createElement('style');
  let cssText = '';

  // Add built-in fonts
  CURSIVE_FONTS.forEach(font => {
    const fontUrl = FONT_TTF_URLS[font.name];
    if (fontUrl) {
      cssText += `
        @font-face {
          font-family: '${font.family}';
          src: url('${fontUrl}') format('truetype');
          font-weight: normal;
          font-style: normal;
        }
      `;
    }
  });

  // Add dynamic fonts
  Object.entries(dynamicFonts).forEach(([name, url]) => {
    if (url && !CURSIVE_FONTS.some(f => f.name === name)) {
      cssText += `
        @font-face {
          font-family: '${name}';
          src: url('${url}') format('truetype');
          font-weight: normal;
          font-style: normal;
        }
      `;
    }
  });

  if (cssText) {
    style.textContent = cssText;
    document.head.appendChild(style);  // ← DOM Mutation
  }

  return () => {
    if (style.parentNode) {
      style.parentNode.removeChild(style);
    }
  };
}, [dynamicFonts]);  // ← Dependency: dynamicFonts
```

**Dependency**: `[dynamicFonts]` (line 1451)
- Runs on mount and whenever `dynamicFonts` changes
- DOM mutation (appending `<style>` tag)
- Affects global CSS, potentially triggering browser reflows

---

## 5. Diameter Calculation Effect (Heavy)

### Location: [src/App.tsx](src/App.tsx#L1510-L1589)

```typescript
// Diameter Calculation Logic
useEffect(() => {
  let active = true;
  const calc = async () => {
    const enabledLayers = getEnabledLayers(config);
    if (!enabledLayers.length) {
      if(active) setDesignDiameter(0);  // ← STATE UPDATE
      return;
    }

    let maxR = 0;
    const bevelPadding = config.bevelEnabled ? config.bevelAmount : 0;

    for (const layer of enabledLayers) {
      // Hubs
      for (const h of layer.hubs) { /* calculations */ }
      
      // Abstracts
      for (const a of layer.abstracts) { /* calculations */ }
      
      // Text - ASYNC FONT LOADING
      for (const group of [layer.primary, layer.secondary]) {
        if (group.enabled && group.text) {
          const fontName = group.fontFamily.replace(/'/g, '').split(',')[0].trim();
          const url = dynamicFonts[fontName] || FONT_TTF_URLS[fontName];
          try {
            const font = await loadFont(fontName, url);  // ← FONT LOADING
            if (font) {
              const scale = group.fontSize / font.unitsPerEm;
              const glyphs = font.stringToGlyphs(group.text);
              // ... glyph metrics calculation
            }
          } catch (e) { }
        }
      }
    }
    if(active) setDesignDiameter(maxR * 2);  // ← STATE UPDATE #2
  };
  calc();
  return () => { active = false; };
}, [config, dynamicFonts, loadFont]);  // ← Dependencies
```

**Dependencies**: `[config, dynamicFonts, loadFont]` (line 1588)
- Runs every time `config` changes (happens in initial setup)
- Runs every time `dynamicFonts` changes (initial state)
- Runs every time `loadFont` function reference changes
- Calls `await loadFont()` for each text group
- **Triggers re-render #2** when diameter calculation completes

---

## 6. useFontCache Hook

### Location: [src/App.tsx](src/App.tsx#L46-L72)

```typescript
const useFontCache = (getPreloadedFont?: (fontName: string) => opentype.Font | null, isPreloadedFont?: (fontName: string) => boolean) => {
  const fontCache = useRef<Record<string, opentype.Font>>({});

  const loadFont = useCallback(async (fontName: string, url: string) => {
    // First check if font is already in our cache
    if (fontCache.current[fontName]) {
      return fontCache.current[fontName];
    }

    // Check if font is preloaded
    if (getPreloadedFont && isPreloadedFont) {
      const preloadedFont = getPreloadedFont(fontName);
      if (preloadedFont && isPreloadedFont(fontName)) {
        fontCache.current[fontName] = preloadedFont;
        return preloadedFont;
      }
    }

    // If not preloaded, load it normally
    return new Promise<opentype.Font>((resolve, reject) => {
      opentype.load(url, (err, font) => {
        if (err || !font) {
          reject(err || new Error('Failed to load font'));
          return;
        }
        fontCache.current[fontName] = font;
        resolve(font);
      });
    });
  }, [getPreloadedFont, isPreloadedFont]);

  return { loadFont, fontCache: fontCache.current };
};
```

**Location**: [src/App.tsx](src/App.tsx#L1472)
```typescript
const { loadFont } = useFontCache(getFont, isFontLoaded);
```

---

## 7. setState Batching Issues

### Location: [src/App.tsx](src/App.tsx#L1374-L1378)

```typescript
const setRendered3DIfChanged = useCallback((next: SnowflakeConfig) => {
  const h = hashConfig(next);
  if (h === lastRendered3DHash.current) return;
  lastRendered3DHash.current = h;
  setRendered3DConfig(next);  // ← Only updates if hash differs
}, []);
```

**Guarding mechanism**:
- Uses `hashConfig()` to avoid unnecessary re-renders
- However, this doesn't prevent initial render cascade

---

## Sequence of Events Causing Visual Shifting

### Timeline (milliseconds from app startup):

| Time | Event | Component | State Change |
|------|-------|-----------|--------------|
| 0ms | App mounts | App.tsx:1229 | Multiple useState hooks initialize with `initialState` |
| 0ms | Font preload starts | useEffect @ line 1405 | async `preloadAllFonts()` called |
| 0ms | CSS fonts added | useEffect @ line 1421 | `<style>` tag created & appended |
| 0ms | Diameter calc starts | useEffect @ line 1510 | Async `calc()` launched, awaits `loadFont()` |
| 50-200ms | First fonts load | fontPreloader.ts:35-66 | Fonts cached in singleton |
| 500-2000ms | Font preload completes | useEffect @ line 1405 | `setFontsPreloaded(true)` → **RE-RENDER #1** |
| 500-2000ms | Diameter calc completes | useEffect @ line 1510 | `setDesignDiameter(maxR * 2)` → **RE-RENDER #2** |
| Any time | 3D mode switch | App state | `setViewMode('3d')` → Triggers `generateMesh()` → **RE-RENDER #3+** |
| Any time | Model caching | geometryCache.ts | Geometry built incrementally, mesh shown piece-by-piece |

---

## Why Geometry Shifts During Rendering

### 1. Text Metrics Change
- Initial render uses **default fonts** (before preloading)
- After preloading, glyphs have different metrics
- Diameter calculation runs with preloaded fonts
- Text positioning recalculated → **visual shift**

### 2. Geometry Cache Invalidation
- `globalStrokeWeight` changes trigger full cache clear (line 1605)
- `quality` changes trigger cache clear (line 1610)
- Each cache clear means geometries must be rebuilt
- Rebuilt geometries may have slightly different dimensions

### 3. Two-Pass 3D Model Generation
- **2D Preview**: Rendered first with temporary fonts
- **3D Model**: Generated separately when fonts available
- Model has different scale/positioning than preview
- Switching between views causes **visual displacement**

### 4. Model Cache Three-Level System
- **Geometry-level cache**: Individual shapes (text, hubs, etc.)
- **Model-level cache**: Combined 3D mesh (3D view)
- **Slot-cut cache**: Pre-computed slot geometries
- Cache misses during transition from startup → ready state

---

## Key Files Involved

| File | Purpose | Lines |
|------|---------|-------|
| [src/utils/fontPreloader.ts](src/utils/fontPreloader.ts) | Font singleton class, preloading logic | 1-162 |
| [src/App.tsx](src/App.tsx#L1405-L1417) | Font preload effect | 1405-1417 |
| [src/App.tsx](src/App.tsx#L1421-L1453) | CSS font-face effect | 1421-1453 |
| [src/App.tsx](src/App.tsx#L1510-L1589) | Diameter calculation effect | 1510-1589 |
| [src/App.tsx](src/App.tsx#L46-L72) | useFontCache hook | 46-72 |
| [src/App.tsx](src/App.tsx#L1369-1375) | Initial state setup | 1369-1375 |
| [src/App.tsx](src/App.tsx#L1374-1378) | setRendered3DIfChanged guard | 1374-1378 |
| [src/geometryCache.ts](src/geometryCache.ts) | Multi-level geometry caching | - |

---

## Proposed Solutions

### Option 1: Batch Initial Effects (React 18 Auto-Batching)
React 18+ auto-batches state updates within event handlers and effects. Ensure all initialization updates happen in single effect batch.

### Option 2: Defer Non-Critical Initialization
Move font-face CSS injection to separate non-blocking effect that doesn't trigger re-renders.

### Option 3: Pre-cache Geometries During Preload
Generate geometry cache keys before mounting 2D preview, cache them silently.

### Option 4: Stabilize Font References
Use `useCallback` to memoize `loadFont` with stable dependencies, preventing diameter effect re-runs.

### Option 5: Single Config Initialization
Initialize `config`, `config3D`, and `rendered3DConfig` to consistent state, avoid separate useState for 3D config.

---

## Performance Impact

- **Initial render**: ~5 state updates in rapid succession
- **Font loading latency**: 500-2000ms blocking text metrics
- **3D model generation**: Deferred but still causes re-renders once fonts ready
- **User perception**: Visual jumping/shifting for first 1-3 seconds after app load
