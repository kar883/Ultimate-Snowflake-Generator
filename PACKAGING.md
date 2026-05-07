# Snowflake Generator - Distribution & Release Guide

## Complete Package Structure

Your app is now configured for professional distribution across Windows and macOS with:
- ✅ Electron app framework (cross-platform)
- ✅ Installers (NSIS for Windows)
- ✅ Portable executables (no install required)
- ✅ macOS installers and archives
- ✅ Complete build automation
- ✅ License and documentation

## Build Instructions

### Prerequisites
- **Node.js 16+** - [Download](https://nodejs.org/)
- **npm** - Comes with Node.js
- **Git** (optional, for version control)

### One-Command Build

Windows (Command Prompt):
```cmd
build-package.bat
```

macOS/Linux (Terminal):
```bash
chmod +x build-package.sh
./build-package.sh
```

Or programmatically:
```bash
npm run dist
```

### Manual Build Steps

```bash
# 1. Install dependencies
npm install

# 2. Build Vite frontend (creates 'dist/' folder)
npm run build

# 3. Build Electron installers (creates 'dist-electron/' folder)
npm run electron:build
```

## Output Files

After building, check `dist-electron/` for:

### Windows
- **Snowflake Generator Setup 1.0.0.exe** (Installer)
  - User-friendly installer with uninstall support
  - Creates Start Menu shortcuts
  - Size: ~200-300 MB
  
- **Snowflake Generator 1.0.0.exe** (Portable)
  - No installation required
  - Run directly from USB/network
  - Size: ~200-300 MB

### macOS
- **Snowflake Generator-1.0.0.dmg** (Disk Image Installer)
  - Standard macOS installation experience
  - Drag-and-drop to Applications
  - Size: ~200-300 MB
  
- **Snowflake Generator-1.0.0.zip** (Archive)
  - Portable archive
  - Extract and run
  - Size: ~200-300 MB

- **Snowflake Generator-1.0.0-arm64.dmg** (Apple Silicon)
- **Snowflake Generator-1.0.0-x64.dmg** (Intel Mac)

## Distribution Strategies

### Strategy 1: GitHub Releases
```bash
# 1. Tag your release
git tag v1.0.0

# 2. Push tag
git push origin v1.0.0

# 3. Upload dist-electron/* files to GitHub Releases page
```

Users download directly from releases page.

### Strategy 2: Website Download
1. Create `downloads/` folder on your web host
2. Upload all `dist-electron/` files
3. Create download page with:
   - Download links for each platform
   - System requirements
   - Installation instructions
   - Screenshots/features

### Strategy 3: Cloud Storage
1. Upload `dist-electron/*` to:
   - Google Drive
   - Dropbox
   - OneDrive
   - S3 bucket
2. Share public links

### Strategy 4: Direct Distribution
1. Email `dist-electron/` files directly
2. USB drive with installers
3. Network share for organizations

## Customization Before Distribution

### Update App Icon
1. Create icon files:
   - `build/icon.ico` (Windows, 256x256+)
   - `build/icon.icns` (macOS, 512x512)
   - `build/icon.png` (Linux, 512x512)

2. Update `package.json` build config:
```json
"build": {
  "win": {
    "icon": "build/icon.ico"
  },
  "mac": {
    "icon": "build/icon.icns"
  }
}
```

3. Rebuild: `npm run electron:build`

### Update Product Name
Edit `package.json`:
```json
{
  "productName": "My Custom Name",
  "build": {
    "appId": "com.mycompany.appname"
  }
}
```

### Add App Description
Edit `package.json`:
```json
{
  "description": "Your custom app description here"
}
```

### Update Version Number
Before each release, increment version in `package.json`:
```json
{
  "version": "1.0.1"
}
```

Rebuild and new installers reflect version automatically.

## Platform-Specific Notes

### Windows
- **Installer Location:** `C:\Program Files\Snowflake Generator\`
- **Uninstaller:** Control Panel > Programs > Uninstall
- **Portable:** No registry entries, can run from anywhere
- **Code Signing:** (Optional for signed installers, contact Microsoft)

### macOS
- **Installation:** `/Applications/Snowflake Generator.app`
- **First Run:** Users may need to approve in Security settings
- **Notarization:** (Optional, improves trust on macOS 10.15+)
  - Requires Apple Developer account
  - Process takes ~5 minutes

### Universal macOS Binaries
Your build automatically creates Universal binaries supporting:
- Intel Macs (x86-64)
- Apple Silicon Macs (ARM64)

No additional configuration needed!

## Digital Signing (Advanced)

### Windows Code Signing
Protects against SmartScreen warnings:
```json
"build": {
  "win": {
    "certificateFile": "/path/to/cert.pfx",
    "certificatePassword": "your-password"
  }
}
```

### macOS Code Signing
```json
"build": {
  "mac": {
    "identity": "Developer ID Application: Your Name",
    "hardenedRuntime": true
  }
}
```

## Distribution Checklist

Before releasing to users:

- [ ] Update version in `package.json`
- [ ] Update `CHANGELOG.md` (optional but recommended)
- [ ] Test installers on target platforms
  - [ ] Windows 7/10/11
  - [ ] macOS 10.13+
- [ ] Verify 3D rendering works (WebGL support)
- [ ] Test STL export functionality
- [ ] Test save/load of projects
- [ ] Create release notes
- [ ] Update documentation
- [ ] Tag release in git: `git tag v1.0.0`
- [ ] Upload to distribution platform
- [ ] Announce to users

## Troubleshooting Distribution Issues

**"Windows protected your PC" warning**
- Normal for unsigned installers
- Users click "More info" → "Run anyway"
- Optional: Code sign for $70-300/year

**macOS "Cannot open app" error**
- Ask users to right-click → Open
- Or: `xattr -d com.apple.quarantine /Applications/app.app`
- Optional: Notarize app for ~$99/year (Apple Developer)

**App crashes on start**
- Ensure deps installed: `npm install`
- Check Node.js version: `node --version` (needs 16+)
- Test build locally first

**Large file sizes**
- Expected: ~200-300 MB (includes Chromium)
- Can't reduce much without compromising features
- Offer both installer and portable for user choice

## Version Management

Create `CHANGELOG.md`:
```markdown
# Changelog

## [1.0.0] - 2026-03-27
### Added
- Initial release
- 3D snowflake designer
- STL export for 3D printing
- SVG export for graphics
- Real-time preview

### Fixed
- Empty geometry warnings
- Font size linkage issue

## [1.0.1] - TBD
### Fixed
- Bug fixes
```

## Maintenance

### For Future Updates

1. Make code changes
2. Update version in `package.json`
3. Update `CHANGELOG.md`
4. Test locally: `npm run dev`
5. Build: `npm run dist`
6. Test installers
7. Commit: `git commit -am "Release v1.0.1"`
8. Tag: `git tag v1.0.1`
9. Push: `git push && git push --tags`
10. Upload new `dist-electron/` files

## Support Resources

Users can refer to:
- **README.md** - Quick start
- **PACKAGING.md** - Packaging and distribution workflow
- **e2e/README.md** - End-to-end testing guide
- In-app tooltips and keyboard shortcuts

## Next Steps

1. **Build:**
   ```bash
   npm install
   npm run dist
   ```

2. **Test installers** on your target platforms

3. **Upload** `dist-electron/` files to your distribution platform

4. **Share download link** with users

5. **Announce** your release!

---

**You now have a complete, professional distribution package ready for end users.**

Questions? Refer to:
- [Electron docs](https://www.electronjs.org/)
- [electron-builder docs](https://www.electron.build/)
- Community forums and Stack Overflow

Happy distributing! 🎉
