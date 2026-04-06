[Standalone ZIP](https://github.com/kar883/Ultimate-Snowflake-Generator/releases/download/v1.0.3/Snowflake.Generator-1.0.3-win.zip)

[Windows Installer](https://github.com/kar883/Ultimate-Snowflake-Generator/releases/download/v1.0.3/Snowflake.Generator.Setup.1.0.3.exe)

# Ultimate Snowflake Generator

A beautiful 3D snowflake design generator for art and 3D printing. Create intricate snowflake patterns with advanced customization options, AI-powered randomization, and export capabilities.

## Features

### 🎨 **Design Creation**
- **Text-Based Snowflakes**: Transform text into beautiful snowflake patterns
- **Multiple Layers**: Base Plane, Cross Plane, and Tilt Plane configurations
- **Font Support**: 17+ cursive fonts with automatic preloading
- **Real-time Preview**: Instant visual feedback as you design

### 🛠️ **Customization Controls**
- **Global Settings**: Color, extrusion depth, bevel options
- **Text Controls**: Font family, letter spacing, boldness, mirror effects
- **Letter Control**: Individual character positioning and rotation
- **Hubs**: Central geometric shapes with customizable parameters
- **Abstract Shapes**: Lines, sine waves, zigzags, and fractals
- **Underline Options**: Decorative underlines with various styles

### 🤖 **AI-Powered Features**
- **AI Randomizer**: Generate unique designs using Google Gemini AI
- **Fractal Generation**: Complex mathematical fractal patterns
- **Smart Suggestions**: AI-assisted design improvements

### 📤 **Export Options**
- **3D Printing**: STL export for all layers or individual planes
- **2D Formats**: SVG and DXF for laser cutting and vinyl
- **Project Files**: Save and load complete designs

### ⚙️ **User Interface**
- **Multi-language Support**: English, Spanish, French, German, Chinese, Japanese
- **Keyboard Shortcuts**: Customizable shortcuts for all major actions
- **Reset Functionality**: One-click reset to default settings
- **Responsive Design**: Works on various screen sizes

## Getting Started

### System Requirements
- **Windows**: Windows 10 or later
- **macOS**: macOS 10.14 or later
- **Memory**: 4GB RAM minimum
- **Storage**: 500MB available space

### Installation

#### Windows
1. Download `SnowflakeGenerator-Setup-1.0.3.exe`
2. Run the installer
3. Follow the installation wizard
4. Launch from Start Menu or Desktop shortcut

#### macOS
1. Download `SnowflakeGenerator-1.0.3.dmg`
2. Open the DMG file
3. Drag the app to Applications folder
4. Launch from Applications folder

#### Standalone (No Installation)
1. Download `SnowflakeGenerator-1.0.3-win.zip` (Windows) or `SnowflakeGenerator-1.0.3-mac.zip` (macOS)
2. Extract the zip file
3. Run `SnowflakeGenerator.exe` (Windows) or `SnowflakeGenerator.app` (macOS)

## Basic Usage

### Creating Your First Snowflake
1. **Start the App**: Launch the application
2. **Enter Text**: Type your desired text in the Text tab
3. **Choose Font**: Select from the available cursive fonts
4. **Adjust Settings**: Modify letter spacing, size, and positioning
5. **Preview**: View your snowflake in real-time
6. **Export**: Save your design as STL, SVG, or DXF

### Using AI Features
1. **Get API Key**: Obtain a free Google Gemini API key
2. **Configure Settings**: Go to Settings > API Key tab
3. **Generate**: Click "AI Randomizer" to create unique designs
4. **Customize**: Fine-tune the AI-generated results

### Advanced Features
- **Multiple Layers**: Enable and configure different planes
- **Hubs**: Add central geometric shapes
- **Abstracts**: Include decorative patterns
- **Fractals**: Generate complex mathematical designs

## Keyboard Shortcuts

| Action | Windows/Linux | macOS |
|--------|---------------|-------|
| Undo | Ctrl+Z | Cmd+Z |
| Redo | Ctrl+Shift+Z | Cmd+Shift+Z |
| Toggle 2D/3D View | Ctrl+1 | Cmd+1 |
| Force Regenerate | Ctrl+R | Cmd+R |
| Save Project | Ctrl+S | Cmd+S |
| Load Project | Ctrl+L | Cmd+L |
| Reset App | Ctrl+Shift+R | Cmd+Shift+R |
| Switch to Global Tab | Alt+1 | Option+1 |
| Switch to Text Tab | Alt+2 | Option+2 |

## File Formats

### Supported Export Formats
- **STL**: 3D printing format (individual layers or combined)
- **SVG**: Vector graphics for laser cutting
- **DXF**: CAD format for CNC machines
- **JSON**: Project files for saving/loading designs

### Project Files
- Save complete designs with all settings
- Load previous projects to continue work
- Share designs with other users

## Settings and Preferences

### Customizable Options
- **Language**: Choose from 6 supported languages
- **Shortcuts**: Customize keyboard shortcuts
- **Tooltips**: Enable/disable helpful tooltips
- **API Configuration**: Google Gemini API key setup
- **AI Scope**: Control which AI features are enabled

### Reset Functionality
- **Reset Button**: Orange button in header
- **Preserves**: Shortcuts, language, tooltips, API settings
- **Resets**: All design settings, history, tabs, caches

## Troubleshooting

### Common Issues
- **Fonts Not Loading**: Check internet connection for font downloads
- **AI Features Not Working**: Verify API key configuration
- **Export Fails**: Ensure sufficient disk space
- **Performance Issues**: Close other applications to free memory

### Getting Help
- Check the Settings menu for configuration options
- Use keyboard shortcuts for faster workflow
- Reset app if experiencing unusual behavior

## Version Information
- **Version**: 1.0.0
- **Author**: Kyle Russell
- **License**: MIT

## Technical Details




### Architecture
- **Frontend**: React with TypeScript
- **3D Engine**: Three.js with custom CSG operations
- **Font Rendering**: OpenType.js for text-to-geometry conversion
- **Export**: Custom STL, SVG, and DXF generators
- **AI Integration**: Google Gemini API

### Performance Features
- **Font Preloading**: Background loading of all fonts
- **Geometry Caching**: Optimized 3D rendering
- **Debounced Updates**: Smooth real-time preview
- **Memory Management**: Automatic cleanup of resources

---

Enjoy creating beautiful snowflake designs! ❄️
