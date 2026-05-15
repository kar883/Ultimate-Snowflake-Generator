# AI Coding Assistant Instructions for Ultimate Snowflake Generator

## Project Overview
This is a React + TypeScript web application for generating customizable 3D snowflake designs. Users can input text, configure geometric patterns, and export STL files for 3D printing. The app uses Three.js for 3D rendering, CSG operations for slot cutting, and OpenType.js for font rendering. the 2d and 3d designs should appear the same of each respective plane.

## Architecture & Key Components

### Core Data Structures (`src/types.ts`)
- `SnowflakeConfig`: Main configuration with layers, extrusion settings, and global options
- `LayerConfig`: Individual snowflake layers containing text groups, hubs, abstracts, and slot configurations
- `TextGroupConfig`: Text rendering settings with font, spacing, and positioning
- `HubConfig`: Geometric hub shapes (circle, polygon, star) with oscillation effects
- `AbstractConfig`: Pattern generators (line, sine, zigzag, fractal) for decorative elements

### Main Application Flow (`src/App.tsx`)
- **Custom Hooks Pattern**: Extensive use of custom hooks for:
  - `useFontCache`: Loads and caches OpenType fonts from CDN
  - `useThreeJSCleanup`: Tracks and disposes Three.js geometries/materials to prevent memory leaks
  - `useExportManager`: Handles STL export with progress tracking
  - `useUserFeedback`: Manages notification system
  - `useKeyboardShortcuts`: Global keyboard shortcuts (Ctrl+Z undo, Ctrl+E export, etc.)

### Geometry Generation & Caching
- **Multi-level Caching Strategy**:
  - **Geometry Cache** (`geometryCache.ts`): Caches individual geometries (text, hubs, slots, abstracts) by complex keys
  - **Model Cache**: Caches complete 3D models (`modelCache3D`) and 2D previews (`modelCache2D`) by config hash
  - **Slot Cut Cache**: Pre-computes and caches slot-cut geometries per layer for instant 3D preview when slots are enabled
  - **Font Cache**: Prevents re-downloading fonts during session
- **Background Pre-computation**: Slot cuts are computed asynchronously when slot settings change, ensuring real-time 3D preview
- **Cache Invalidation**: Clears all caches when quality settings change
- **Web Worker CSG** (`src/csgWorkerManager.ts`, `src/csg.worker.ts`):
  - Heavy CSG operations run in background worker
  - Queued job system with idle timeout
  - Performance benchmarking built-in
  - Heavy CSG operations run in background worker
  - Queued job system with idle timeout
  - Performance benchmarking built-in

### UI Components
- `ControlPanel`: Large configuration interface with tabbed sections (Global, Text, Letter Control, Hubs, Abstract, Planes)
- `Snowflake3D`: Three.js scene with orbit controls and real-time updates
- `SnowflakePreview`: 2D SVG preview for fast feedback
- `LocalFontPicker`: Access to system fonts via Local Font Access API

## Critical Workflows

### Development Setup
```bash
npm install
# Set GEMINI_API_KEY in .env.local for AI text suggestions
npm run dev  # Vite dev server with HTTPS for Local Font Access API
```

### Build & Deployment
```bash
npm run build   # Production build with chunking (three.js, opentype.js)
npm run preview # Test production build locally
```

### Export Functionality
- **STL Export**: Combined model, individual planes (base/cross/tilt), or base plane only
- **Project Save/Load**: JSON serialization of `SnowflakeConfig`
- **ZIP Export**: Batch export multiple STL files

## Project-Specific Patterns & Conventions

### State Management
- **Single Source of Truth**: All configuration in `SnowflakeConfig` state
- **Layer-Based Architecture**: Changes propagate through active layer index
- **Sync All Layers**: Toggle to apply changes across all layers simultaneously

### Geometry Key Generation
Cache keys follow pattern: `${layerId}::${type}::${param1}::${param2}...`
Example: `layer1::text::HELLO::Great Vibes::24::2.5::true::0.1::6::false::0::10::1.2::underline_config`

### Font Handling
- **CDN Fonts**: Cursive fonts loaded from Google Fonts CDN (`src/constants.ts`)
- **Local Fonts**: System fonts accessed via Permissions Policy (`vite.config.ts`)
- **Font Caching**: Prevents re-downloading fonts during session

### Performance Optimizations
- **Geometry Cloning**: Cached geometries are cloned, not reused directly
- **Web Worker**: CSG operations never block main thread
- **Selective Updates**: Only affected geometries regenerate on parameter changes
- **Memory Management**: Explicit disposal of Three.js resources

### Error Handling
- **Custom Error Hook**: `useErrorHandler` with auto-clearing notifications
- **Graceful Degradation**: Font loading failures fall back to defaults
- **User Feedback**: Toast notifications for all operations

### Keyboard Shortcuts
- **Global Shortcuts**: Ctrl+Z/Y (undo/redo), Ctrl+E (export), Ctrl+S (save)
- **Tab Switching**: Alt+1-6 for different control panel sections
- **Input Filtering**: Shortcuts disabled in text inputs

## Integration Points

### External Dependencies
- **Google GenAI**: For AI-powered text suggestions (requires API key)
- **Three.js + CSG**: 3D geometry and boolean operations
- **OpenType.js**: Font parsing and glyph extraction
- **JSZip**: Multi-file STL exports

### Browser APIs
- **Local Font Access**: Requires HTTPS and Permissions Policy
- **File System Access**: For project save/load operations
- **Web Workers**: For background CSG computations
- **WebGL/GPU**: Hardware-accelerated 3D rendering via Three.js

### Performance Optimizations
- **GPU Acceleration**: 3D rendering uses WebGL, 2D SVG rendering is GPU-accelerated in modern browsers
- **Multi-level Caching**: Geometry-level and model-level caching prevent redundant computations
- **Background Processing**: Model generation doesn't block UI interactions
- **Symmetric Optimization**: Generate geometry once, clone and rotate for each arm

## Common Development Tasks

### Adding New Geometry Types
1. Define config interface in `types.ts`
2. Add cache key generator in `geometryCache.ts`
3. Implement geometry creator function
4. Add to layer config and UI controls
5. Update export logic for STL generation

### Modifying Export Formats
1. Update `useExportManager` hook for new formats
2. Add STL exporter calls in main export functions
3. Update keyboard shortcuts if needed
4. Test with various geometry combinations

### Performance Tuning
- Monitor cache hit rates in browser dev tools (geometry cache vs model cache vs slot cut cache)
- Check web worker queue delays in console logs
- Profile Three.js geometry creation bottlenecks
- Adjust `MAX_HISTORY` for undo/redo memory usage
- Model caching provides instant loading for previously generated configurations
- Slot cut pre-computation enables real-time 3D preview when toggling slots

## File Organization Reference
- `src/App.tsx`: Main component (2341 lines - very large)
- `src/components/ControlPanel.tsx`: UI controls (1397 lines)
- `src/types.ts`: All TypeScript interfaces
- `src/geometryCache.ts`: Geometry caching system
- `src/csgWorkerManager.ts`: Web worker orchestration
- `vite.config.ts`: Build configuration with font permissions