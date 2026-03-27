# Snowflake Generator - Build & Distribution Guide

## Quick Start (Windows)

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run build script:**
   ```bash
   .\build-package.bat
   ```

   Or manually:
   ```bash
   npm run build          # Build frontend
   npm run electron:build # Build installers
   ```

3. **Find distributables in `dist-electron/`**
   - `Snowflake Generator Setup x.x.x.exe` - Windows installer
   - `Snowflake Generator x.x.x.exe` - Portable (no install needed)
   - Other executable files

## macOS

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run build script:**
   ```bash
   chmod +x ./build-package.sh
   ./build-package.sh
   ```

   Or manually:
   ```bash
   npm run build          # Build frontend
   npm run electron:build # Build DMG and ZIP
   ```

3. **Find distributables in `dist-electron/`**
   - `Snowflake Generator-x.x.x.dmg` - Installer
   - `Snowflake Generator-x.x.x.zip` - Portable archive
   - Universal binary included

## Linux (if needed)

Add to `package.json` `build` section:
```json
"linux": {
  "target": ["AppImage", "deb"]
}
```

Then run build scripts above.

## Distribution

### For Windows Users:
- **Installer (recommended):** Share the `.exe` installer file
  - Users double-click to install to Program Files
  - Creates Start Menu shortcuts
  
- **Portable (no install):** Share the standalone `.exe`
  - Users can run directly without installing
  - Ideal for USB drives, shared networks

### For Mac Users:
- **DMG Installer:** Share `.dmg` file
  - Users mount and drag app to Applications folder
  
- **ZIP Archive:** Share `.zip` file
  - Users extract and run directly
  - Good for archival/backup

## What's Included

The build process creates:
1. **Frontend bundle** - Optimized React + Three.js app in `dist/`
2. **Electron wrapper** - Desktop app container
3. **Installers** - Platform-specific setup packages
4. **Portable executables** - Self-contained, no installation required

## System Requirements

### Windows
- Windows 7 or later
- 64-bit recommended
- ~500MB disk space for installation

### macOS
- macOS 10.13 or later
- Intel or Apple Silicon (Universal binary)
- ~500MB disk space

## Troubleshooting

**Build fails with "npm not found":**
- Install Node.js from https://nodejs.org/
- Restart terminal after installation

**Installer won't run:**
- Disable antivirus/SmartScreen temporarily (false positive)
- Try portable version instead
- Run as Administrator (Windows)

**App won't start:**
- Ensure display supports WebGL (3D rendering requirement)
- Check system meets minimum requirements above
- Try portable version with explicit administrator rights

## Development

After packaging, to resume development:
```bash
npm run dev  # Starts Vite dev server + Electron in dev mode
```

Press Ctrl+R in the Electron window to reload after code changes.

## Environment Variables

Create `.env.local` in project root for features:
```
VITE_GEMINI_API_KEY=your_key_here  # For AI text suggestions (optional)
```

## Build Configuration

Main config in `package.json` `build` section:
- `appId` - Unique application identifier
- `productName` - Display name
- `files` - What to include in build
- `win/mac` - Platform-specific settings
- `nsis` - Windows installer options

Modify these if creating custom branded versions.
