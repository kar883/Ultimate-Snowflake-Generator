# Snowflake Generator - Distribution Package

## What's Inside

This package contains a complete, production-ready 3D snowflake design generator built with:
- **React + TypeScript** - Modern UI framework
- **Three.js** - WebGL 3D rendering
- **Electron** - Cross-platform desktop app
- **Vite** - Fast build tooling

## Getting Started (For End Users)

### Windows
1. Download `Snowflake Generator Setup x.x.x.exe`
2. Double-click to install
3. Launch from Start Menu

**OR** for portable version:
1. Download `Snowflake Generator x.x.x.exe`
2. Run directly (no installation required)

### macOS
1. Download `Snowflake Generator-x.x.x.dmg`
2. Drag "Snowflake Generator" to Applications folder
3. Launch from Applications

**OR** for portable version:
1. Download `Snowflake Generator-x.x.x.zip`
2. Extract and run the app

## Features

- **3D Snowflake Design** - Create custom snowflake patterns with interactive 3D preview
- **Text Integration** - Add text with custom fonts and styling
- **Geometric Shapes** - Hubs, abstract patterns, and decorative elements
- **STL Export** - Export designs for 3D printing
- **2D SVG Export** - Export as vector graphics
- **Real-time Preview** - See changes instantly in 3D
- **Multi-Layer Support** - Create complex designs with multiple layers
- **Undo/Redo** - Full editing history
- **Project Save/Load** - Save designs as JSON projects

## System Requirements

### Windows
- Windows 7 or later (64-bit)
- 4GB RAM minimum
- Display with WebGL support
- ~500MB free disk space

### macOS
- macOS 10.13 or later
- 4GB RAM minimum
- Intel or Apple Silicon
- ~500MB free disk space

## Usage

1. Launch the application
2. Design your snowflake using the control panel on the left
3. View 3D preview on the right
4. Adjust colors, patterns, and parameters in real-time
5. Export as STL (for 3D printing) or SVG (for graphics)
6. Save your project for later editing

## Keyboard Shortcuts

- **Ctrl+Z** - Undo
- **Ctrl+Y** - Redo
- **Ctrl+E** - Quick export
- **Ctrl+S** - Save project
- **Alt+1-6** - Switch control panel tabs

## Tips & Tricks

- Use "Sync All Layers" to apply changes across all layers at once
- Enable "Bevel" for smoother edges in 3D-printed designs
- Adjust "Outer Radius" to scale the entire snowflake
- Use multiple text groups to create complex patterns
- Preview both 2D and 3D views to understand final output

## 3D Printing

The STL export format is compatible with:
- Ultimaker, Prusa, Formlabs, Creality, and most 3D printers
- 3D printing services (Shapeways, Sculpteo, etc.)
- CAD software (Fusion 360, FreeCAD, etc.)

Recommended settings:
- Layer height: 0.2mm
- Infill: 10-20%
- Support: Enable if design has overhangs
- Print time: 2-8 hours depending on size

## Troubleshooting

**App won't start**
- Ensure your graphics driver is up to date
- Try updating your OS
- For Mac, check if app is marked as trusted (Security & Privacy settings)

**3D preview not showing**
- Your GPU doesn't support WebGL
- Try a different browser-based version
- Update graphics drivers

**Export creates large files**
- Increase complexity settings to reduce geometry
- Reduce "Detail Quality" setting
- Use fewer arms or simpler patterns

**Performance issues**
- Reduce "Detail Quality" setting
- Simplify design (fewer elements)
- Close other applications
- Restart the app

## Getting Help

For issues, questions, or feature requests:
- Check the included documentation
- Review exported file sizes and quality
- Ensure system meets requirements

## License

This application is provided as-is. See LICENSE file if included.

## Credits

Built with open-source technologies:
- React.js
- Three.js
- Electron
- OpenType.js
- And many others

Enjoy creating beautiful snowflakes!
