# Snowflake Generator - 3D Printing Design Tool

Create custom 3D snowflake designs with text, geometric shapes, and patterns. **All models print flat, no supports needed, as a single connected piece.**

## Table of Contents

1. [Installation](#installation) | 2. [Quick Start](#quick-start) | 3. [Global Tab](#global-tab) | 4. [Text Tab](#text-tab) | 5. [Letter Control Tab](#letter-control-tab) | 6. [Hubs Tab](#hubs-tab) | 7. [Abstract Tab](#abstract-tab) | 8. [Images Tab](#images-tab) | 9. [Export](#export) | 10. [Shortcuts](#shortcuts) | 11. [3D Printing Guide](#3d-printing-guide) | 12. [Troubleshooting](#troubleshooting)

---

## Installation

**Option 1 - Installer (Recommended):**
Run `Snowflake Generator Setup 1.0.0.exe` - automatic installation to Program Files, creates Start Menu shortcuts

**Option 2 - Portable (No Installation):**
1. Download `Snowflake Generator-1.0.0-win.zip`
2. Extract the ZIP file to your desired location
3. Navigate to the extracted folder → `dist-electron` subfolder
4. Double-click `Snowflake Generator 1.0.0.exe` to launch
   - No installation needed, runs directly from the folder
   - Safe to copy folder elsewhere or to USB drive

---

## Quick Start

1. **Open the app** → Left side = 6 control tabs, Right side = 3D preview
2. **Explore the default design** → Click & drag to rotate, scroll to zoom
3. **Modify text** → Text tab → enter your text → see it instantly in 3D
4. **Add elements** → Hubs tab (shapes), Abstract tab (patterns), Images tab (SVG designs)
5. **Export** → Ctrl+E → choose STL format → ready for 3D printer

---

## Global Tab

| Setting | Purpose | 3D Print Tip |
|---------|---------|-------------|
| **Project Name** | Filename for exports | Use clear, descriptive names |
| **Color** | Preview appearance only | Doesn't affect 3D print |
| **Extrusion Depth** | Model thickness (mm) | 2-3mm = thin but durable |
| **Edge Profile** | Fillet (rounded) or Chamfer | Fillet for strength |
| **Preview Quality** | Low/Med/High rendering | High for final export |

**⚠️ CRITICAL:** All parts must connect to adjacent elements. Adjust variables to ensure everything touches before exporting.

---

## Text Tab

Add text that wraps around the snowflake arms.

| Setting | Purpose | 3D Print Tip |
|---------|---------|-------------|
| **Text Input** | Words/letters to display | Text must touch hub or abstract element |
| **Font** | 50+ cursive fonts or upload .ttf/.otf | Simple fonts print better |
| **Outer Radius** | Text spread distance (mm) | Adjust to control size |
| **Letter Spacing** | Gap between letters (mm) | 1-2mm typical; prevent overlaps |
| **Boldness** | Line thickness (mm) | 0.5mm+ for structural strength |
| **Mirror** | Create symmetric second copy | Ensures balanced design |
| **Underline** | Optional decorative line | Must connect to text |

Enable **Secondary Text** for inner text ring - must overlap or touch primary text.

---

## Letter Control Tab

Adjust individual characters if they overlap or need repositioning.

| Setting | Purpose |
|---------|---------|
| **Character Selector** | Pick which letter to edit |
| **X / Y Offset** | Move letter left/right/up/down |
| **Rotation** | Rotate single character independently |
| **Scale** | Make one letter bigger or smaller |

---

## Hubs Tab

Geometric shapes at the snowflake center.

| Setting | Purpose | 3D Print Tip |
|---------|---------|-------------|
| **Shape Type** | Circle, Polygon (3-12 sides), Star | All must touch text or abstract |
| **Hub Radius** | Size of the hub (mm) | Larger = extends to text |
| **Hollow** | Ring (yes) or filled (no) | Hollow uses less material |
| **Boldness** | Ring thickness when hollow | 0.5mm+ minimum |
| **Oscillation** | Wavy edge effect | Adds organic look; 0-5mm typical |
| **Star Ratio** | Point sharpness (Star only) | 0.5-0.6 for balance |

Click **Add Hub** multiple times for nested geometric layers. **Each hub must touch adjacent hubs or elements.**

---

## Abstract Tab

Decorative patterns on the arms: waves, lines, or branching trees.

### Shapes (Simple Patterns)
| Setting | Purpose | Typical Values |
|---------|---------|---|
| **Shape Type** | Line, Sine wave, Zigzag | - |
| **Amplitude** | Wave height (mm) | 1-3mm |
| **Frequency** | Number of waves per arm | 2-5 |
| **Boldness** | Line thickness (mm) | 0.3-0.5mm |
| **Inner Radius** | Distance from center | Must reach text edge |
| **Mirror** | Create symmetric pair | Recommended for balance |

### Fractals (Complex Branching Trees)
| Setting | Purpose | Typical Values |
|---------|---------|---|
| **Branches Per Node** | How branches split | 2-3 |
| **Recursion Depth** | Branching generations | 3-4 max |
| **Branch Length** | Initial branch size | Scales down auto |
| **Length Decay** | Shrinking factor | 0.5-0.8 |
| **Thickness** | Branch line width | 0.3mm minimum |

**Critical:** All abstract patterns must connect to text or hubs - no isolated floating branches.

---

## Images Tab

Import SVG images to use as repeating arm elements.

| Setting | Purpose | 3D Print Tip |
|---------|---------|-------------|
| **Import SVG** | Upload .svg file | Must be solid paths, not strokes |
| **Scale** | 1.0 = 1mm | Adjust to fit design |
| **Inner Radius** | Distance from center (mm) | Must reach text or hubs |
| **Y Offset** | Vertical shift | Align with snowflake arms |
| **Mirror** | Symmetric placement on both sides | Recommended |
| **Rotation** | Angle of image on arms | Orients pattern |

Images repeat on all snowflake arms. **Ensure image connects to text or hubs - no gaps.**

---

## Export

**Save Project:** Ctrl+S → saves settings as .json (reload anytime)

**Export STL:** Ctrl+E → choose format → ready for 3D printer

| Export Type | Use | Output |
|-------------|-----|--------|
| **Combined** | Single piece print | 1 .stl file |

**Quality Setting:** Use **High** in Global tab for final prints.

---

## Shortcuts

| Action | Shortcut |
|--------|----------|
| Undo | Ctrl + Z |
| Redo | Ctrl + Shift + Z |
| Save Project | Ctrl + S |
| Load Project | Ctrl + L |
| Export STL | Ctrl + E |
| Force Regenerate | Ctrl + R |
| Tab Navigation | Alt + 1 through 6 |
| 3D Rotate | Click & drag |
| 3D Zoom | Scroll wheel |
| 3D Pan | Right-click & drag |

---

## 3D Printing Guide

### ⚠️ CRITICAL: Model Connectivity

**Your model must have all parts touching each other to print as a single piece.**

Before exporting, verify in the 3D preview:
- ✓ Text connects to hub (or overlaps slightly)
- ✓ Hub connects to abstract pattern  
- ✓ Abstract touches text at outer edge
- ✓ No floating/isolated elements

**If elements are separated:**
1. Reduce text "Outer Radius" to move text inward
2. Increase hub "Radius" to extend it
3. Adjust abstract "Inner Radius" so patterns overlap
4. Increase "Boldness" values to bridge small gaps

### Print Settings for Success

| Setting | Recommended | Why |
|---------|-------------|-----|
| **Extrusion Depth** | 2-3mm | Thin but durable; prints flat without supports |
| **Edge Profile** | Fillet | Rounded edges are stronger than sharp |
| **Boldness (Text/Abstract/Hubs)** | 0.5mm+ | Thin features may not print; increase if needed |
| **Preview Quality** | High (before export) | Ensures detail in final STL |
| **All parts** | Connected | Single piece = no assembly needed |

### Print Orientation & Materials

✓ **Orientation:** Print flat (lying down horizontally)  
✓ **Supports:** Not needed - no overhanging elements  
✓ **Post-processing:** Minimal; might need light sanding  
✓ **Assembly:** Single piece - no gluing required  

**Recommended Materials:**
- **Resin (SLA/DLP):** Best detail; smooth finish
- **FDM (PLA/PETG):** Most accessible; use 0.2mm+ nozzle

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **Text not visible** | Check "Visible" in Letter Control tab; increase Outer Radius |
| **Font won't load** | Try different font from list; custom fonts must be .ttf/.otf |
| **Slow/laggy updates** | Reduce Quality to Low/Med; simplify fractals (lower recursion) |
| **Gaps between elements** | Reduce text Outer Radius; increase hub Radius; use Letter Control to adjust |
| **Export fails** | Reduce Quality; ensure at least one element is visible; check disk space |

---

## Support

**Issues:** [GitHub Issues](https://github.com/kar883/Ultimate-Snowflake-Generator/issues)  
**Repository:** [Ultimate-Snowflake-Generator](https://github.com/kar883/Ultimate-Snowflake-Generator)

---

**Workflow:** Design → Preview → Test export (Low quality) → Final export (High quality) → 3D Print!

All models print **flat without supports** as **single connected pieces**. ❄️
  - Range: 0-360°
---

## Export & File Operations

### Understanding Export Options

The app supports multiple export formats:

- **STL (3D Printing)**: Binary format for 3D printers
- **ZIP (Multi-file)**: Bundle multiple STL files
- **Project Save (JSON)**: Save your configuration for later editing
- **Project Load (JSON)**: Reload previously saved designs

### Export Quality Setting

**Important**: Set BEFORE exporting in the Global tab

- **Low**: Faster export, smaller files (~100KB)
- **Medium**: Good quality, good file size (~500KB)
- **High**: Maximum detail, larger files (~2-5MB)
- **Recommendation**: High quality for final 3D print, Medium for preview

### Export Options

#### Export Combined STL
- **What it does**: Combines all visible layers into ONE merged 3D model
- **Use when**: Printing everything as one solid piece
- **Output**: Single `.stl` file
- **Filename**: `[ProjectName].stl`
- **Pros**: Single file to manage, monolithic print
- **Cons**: Can't disassemble, larger print job

#### Export Base Plane Only
- **What it does**: Saves only the base layer (horizontal snowflake)
- **Use when**: Just want the primary snowflake, no supports
- **Output**: Single `.stl` file
- **Filename**: `[ProjectName]_base.stl`

#### Export Cross Plane Only
- **What it does**: Saves only the vertical cross layer
- **Use when**: Printing support structure separately
- **Output**: Single `.stl` file

### Save Project (JSON)
- **What it does**: Saves all your settings to a `.json` file
- **Use when**: Want to save progress, come back later
- **How to use**:
  1. Click "Save Project" button
  2. Choose location and filename
  3. File saves all configuration, text, fonts, layer setup
- **Reloading**: Open saved file through "Load Project"
- **File size**: Tiny (under 50KB), quick to save/load
- **Shareable**: Can share `.json` files with others to recreate design

### Load Project (JSON)
- **What it does**: Restores all settings from a previously saved project
- **How to use**:
  1. Click "Load Project" button
  2. Navigate to your `.json` file
  3. All settings restore exactly as saved
- **Note**: Fonts must be accessible (system fonts or reupload custom fonts)

### AI Randomizer
- **What it does**: Generates random snowflake design variations
- **Requires**: Internet connection and Google Gemini API key
- **How to use**:
  1. Click "AI Randomizer"
  2. Select design emphasis:
     - "3D Printing": Optimized for physical printing
     - "2D Aesthetics": Beautiful for viewing/art
     - "Fractal": Mathematical patterns
  3. AI generates random text, hub configs, abstract patterns
  4. Click again for more variations

### File Management

#### Directory Structure
```
MySnowflake/
├── designs/
│   ├── Winter_Collection.json (saved Projects)
│   ├── Holiday_2024.json
├── exports/
│   ├── Combined_Snowflake.stl
│   ├── Snowflake_Base.stl
│   ├── Snowflake_Parts.zip
```

#### Backup Workflow
1. Design locally, save `.json` project regularly
2. Export `.stl` files when ready
3. Keep `.json` files for future editing
4. Optional: Keep `.zip` exports of multi-part designs

---

## Keyboard Shortcuts

### Global Shortcuts (Work Everywhere)

| Action | Windows/Linux | Mac |
|--------|---------------|-----|
| Undo | Ctrl + Z | Cmd + Z |
| Redo | Ctrl + Shift + Z | Cmd + Shift + Z |
| Save Project | Ctrl + S | Cmd + S |
| Load Project | Ctrl + L | Cmd + L |
| Export Combined STL | Ctrl + E | Cmd + E |
| Force Regenerate | Ctrl + R | Cmd + R |
| Toggle 2D/3D View | Ctrl + 1 | Cmd + 1 |

### Tab Navigation (Alt + Number)

| Tab | Shortcut |
|-----|----------|
| Global Settings | Alt + 1 |
| Text Config | Alt + 2 |
| Letter Control | Alt + 3 |
| Hubs | Alt + 4 |
| Abstract Patterns | Alt + 5 |

### 3D View Controls

| Action | Control |
|--------|---------|
| Rotate | Click and drag with mouse |
| Zoom | Scroll mouse wheel |
| Pan | Right-click and drag (or Shift + left-click) |
| Reset View | Double-click on preview |

### Tips
- Shortcuts disabled when typing in text fields
- Shortcuts work continuously (hold Ctrl+Z to keep undoing)
- Each tab has its own keyboard context

---

## Troubleshooting

### Common Issues & Solutions

#### White Screen / App Won't Load

**Problem**: Application opens but shows blank white screen

**Solution 1: Clear Cache**
- Close the application
- Delete `AppData\Roaming\Snowflake Generator\` (Windows) or equivalent
- Reopen application

**Solution 2: Reinstall**
- Uninstall application
- Restart computer
- Reinstall from installer
- Test with default design

**Solution 3: Run as Administrator**
- Right-click `.exe` file
- Select "Run as Administrator"
- May require permissions dialog approval

#### Text Not Appearing

**Problem**: Changed text but nothing shows up on snowflake

**Solutions**:
1. Check "Visible" checkbox in Letter Control tab
2. Verify "Outer Radius" is large enough (try 60 mm)
3. Check font loaded successfully (dropdown shows font name)
4. Verify text boldness isn't 0 (min 0.1 mm)
5. Try different font to test

#### Font Won't Load

**Problem**: Selected font doesn't appear to load

**Solutions**:
1. **Google Font**: Try different font from dropdown
2. **System Font**: Ensure using Chrome/Edge, HTTPS connection
3. **Custom Font**: 
   - Check file is `.ttf` or `.otf`
   - File isn't corrupted
   - Try uploading again
4. **Fallback**: Switch to Great Vibes (always available)

#### 3D Preview Not Updating

**Problem**: Changes don't appear in 3D view immediately

**Solutions**:
1. Click "Force Regenerate" (Ctrl + R)
2. Wait 2-5 seconds for geometry to compute
3. Check if layer is enabled (Planes tab)
4. Zoom out to see full snowflake
5. Refresh browser or restart application

#### STL Export Won't Work

**Problem**: Export button does nothing or throws error

**Solutions**:
1. Check at least one layer is enabled
2. Verify project has text or mesh visible
3. Reduce quality setting (Medium instead of High)
4. Try exporting individual layer instead of combined
5. Check disk space (need at least 100 MB free)

#### Slot Cuts Not Appearing

**Problem**: Enabled slots but no cuts visible in 3D

**Solutions**:
1. Ensure "Slot Enabled" is checked in Global tab
2. Verify slot width matches material thickness
3. Check "Slot Length" is reasonable (30+ mm)
4. Ensure you have 2+ layers with different rotations
5. Try "Force Regenerate" (Ctrl + R)
6. Check slot mode is correct (2-plane or 3-plane)

#### Performance Issues

**Problem**: App running slow, lagging, or freezing

**Solutions**:
1. **Reduce Quality Setting**: Change to "Low" or "Medium"
2. **Disable Features**:
   - Turn off bevel if not needed
   - Remove extra hubs/abstracts
   - Disable oscillation on hubs
3. **Simplify Fractals**: Reduce recursion depth
4. **Close Other Programs**: Free up system RAM
5. **Restart Application**: Clear memory cache
6. **Reduce Fractal Complexity**:
   - Depth 3-4 instead of 6-8
   - Fewer branches per node

#### Can't Save/Load Projects

**Problem**: Save or load buttons don't work

**Solutions**:
1. Check write permission to Documents folder
2. Ensure filename doesn't have special characters
3. Try saving to Desktop instead
4. Check disk space (need 50+ MB free)
5. Restart application and try again

---

## Tips & Best Practices

### Design Tips

#### Balancing Text and Decorations
- **Text-Focused**: Larger outer radius (70-100 mm), minimal hubs/abstracts
- **Detailed**: Smaller outer radius (40-50 mm), multiple hubs and fractals
- **Balanced**: Medium radius (60 mm), selective hub and one simple abstract

#### Choosing Hub Shapes
- **Circle**: Clean, classical, versatile
- **Hexagon (6-sided)**: Thematic match to snowflake (6-arm structure)
- **Star**: Bold, striking center piece
- **Polygon**: Matches arm count (6-arm snowflake use 6-sided polygon)

#### Creating Depth with Layers
- **Layer 1 (Base)**: Main snowflake, boldest design
- **Layer 2 (Cross)**: Similar but rotated 90°
- **Layer 3 (Optional)**: Rotated 45° for added support
- Make each layer slightly different for interesting assembly

#### Font Selection
- **Elegant**: Great Vibes, Tangerine (formal/sophisticated)
- **Modern**: Pacifico, Fredoka (contemporary look)
- **Playful**: Caveat, Quicksand (fun/casual)
- **Professional**: Lora, Montserrat (business/technical)
- **Artistic**: Satisfy, Indie Flower (creative/handmade)

### 3D Printing Tips

#### Before Exporting

1. **Set Quality**: Use "High" for final prints
2. **Test with Low**: Export "Low" first to preview structure
3. **Check Tolerances**: 
   - Text boldness: 0.3-0.5 mm minimum
   - Slot width: Match material + 0.2-0.3 mm tolerance
4. **Verify Layer Count**: Ensure right number of layers
5. **Check Rotations**: Verify layers are correctly oriented

#### Print Material Considerations

**Resin Printing** (SLA/DLP):
- Excellent for detail
- Fine boldness OK (0.2 mm+)
- Hollow hubs work well
- Supports needed for overhangs

**FDM Printing** (PLA/PETG):
- Best with 0.4+ mm boldness
- Solid hubs easier than hollow
- Simpler slots easier to print
- May need rotating layer supports

**SLS/Nylon Printing**:
- Excellent detail and strength
- Good for thin features
- Can do fine overhangs
- Hollow hubs recommended

#### Assembly Preparation

If exporting multi-layer:
1. Export all planes to ZIP
2. Print each layer (note which is which)
3. Check tolerances after first layer prints
4. Adjust slot width if too tight/loose
5. Use small file for test print before full-size

### Performance Optimization

- **Keep Fractal Depth Under 5**: Depth 6+ exponentially slow
- **Limit Abstracts**: Each abstract adds processing time
- **Use Fixed-Size Mode**: Auto-fit updates live as you type
- **Batch Edits**: Complete one section before switching tabs
- **Disable Oscillation**: Unless oscillation is key feature

### Workflow Best Practices

1. **Start Simple**: Begin with default design, modify one thing
2. **Save Often**: Hit Ctrl+S after each major change
3. **Test Exports**: Export "Low" quality first to verify structure
4. **Document Designs**: Give projects meaningful names with dates
5. **Keep Backups**: Save multiple versions with different names
6. **Incremental Changes**: Make small changes, preview, then more
7. **Use Mirror for Balance**: Symmetric designs look more professional

### Advanced Techniques

#### Creating Symmetric Multi-Text Designs
1. Set Primary text with auto-fit
2. Enable Mirror effect
3. Add Secondary text (inner circle)
4. Enable Secondary Mirror for concentric symmetry
5. Result: Multiple text rings, all balanced

#### Fractal + Wave Combination
1. Add sparse fractal (depth 3, 2 branches)
2. Add fine sine wave pattern
3. Both render together, one organic, one geometric
4. Adjust boldness to emphasize one or balance

#### Multi-Hub Focal Point
1. Add Circle hub (radius 8 mm, oscillation 6 frequency)
2. Add Hexagon hub (radius 15 mm, hollow)
3. Add Star hub (radius 25 mm, ratio 0.4)
4. Result: Elaborate, professional center piece

#### Layer Assembly Trick
1. Layer 1: Modern sans-serif text
2. Layer 2: Cursive secondary text (rotated 90°)
3. Layer 3: Small hub decorations (rotated 45°)
4. All print separately, assemble at different angles
5. Creates visually complex final model

---

## Additional Resources

### Getting Help

- **GitHub Issues**: [Ultimate-Snowflake-Generator/issues](https://github.com/kar883/Ultimate-Snowflake-Generator/issues)
- **Documentation**: See `RELEASE.md` for technical details

### Requirements

**Minimum System Requirements**:
- Windows 7 or newer (Windows version)
- 2GB RAM
- 500 MB disk space
- Modern web browser (Chrome, Edge, Firefox, Safari)

**Recommended System Requirements**:
- Windows 10 or newer / macOS 10.15+
- 4GB+ RAM
- 1GB disk space
- Chrome or Edge browser (for system font access)

### File Formats Reference

- **`.stl`**: 3D model file for printing (binary or ASCII)
- **`.json`**: Project configuration (human-readable text)
- **`.zip`**: Compressed archive of multiple files
- **`.ttf` / `.otf`**: Font files (True Type / Open Type)
- **`.svg`**: Vector graphics (can import)

---

## Summary Quick Start

1. **Install**: Download installer or portable `.exe`
2. **Open**: Double-click application icon
3. **Create**: Customize default snowflake in Global tab
4. **Text**: Set your text and font in Text tab
5. **Decorate**: Add hubs and patterns in respective tabs
6. **Preview**: Rotate 3D model to see result
7. **Layers**: Add cross/tilt layers in Planes tab
8. **Test**: Export "Low" quality to preview
9. **Print**: Export "High" quality STL for 3D printer
10. **Assembly**: Follow slot cuts to assemble printed pieces

**Happy snowflake creating!** 🎄❄️
