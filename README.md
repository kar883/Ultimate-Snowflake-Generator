# Snowflake Generator - 3D Printing Design Tool

Create custom 3D snowflake designs with text, geometric shapes, and patterns. **All models print flat, no supports needed, as a single connected piece.**

## Table of Contents

1. [Installation](#installation) | 2. [Quick Start](#quick-start) | 3. [Global Tab](#global-tab) | 4. [Text Tab](#text-tab) | 5. [Letter Control Tab](#letter-control-tab) | 6. [Hubs Tab](#hubs-tab) | 7. [Abstract Tab](#abstract-tab) | 8. [Images Tab](#images-tab) | 9. [Export](#export) | 10. [Shortcuts](#shortcuts) | 11. [3D Printing Guide](#3d-printing-guide) | 12. [Troubleshooting](#troubleshooting)

---

## Installation

**Installer:** `Snowflake Generator Setup 1.0.0.exe`  
**Portable:** `Snowflake Generator 1.0.0.exe` (no installation needed)  
**Archive:** `Snowflake Generator-1.0.0-win.zip`

Download any format and run it.

---

## Quick Start

1. Open app → Left side = controls (6 tabs), Right side = 3D preview
2. Click & drag to rotate 3D view, scroll to zoom
3. Modify the default design: Text tab → enter your text → see it instantly
4. Add visual elements: Hubs tab, Abstract tab, Images tab
5. Export: Ctrl+E → choose format → ready to 3D print

---

## Global Tab

| Setting | Purpose | 3D Print Tip |
|---------|---------|-------------|
| **Project Name** | Filename for exports | Use clear names |
| **Color** | Preview appearance only | Doesn't affect print |
| **Extrusion Depth** | Model thickness (mm) | 2-3mm = thin but durable |
| **Edge Profile** | Fillet (rounded) or Chamfer | Use Fillet for strength |
| **Preview Quality** | Low/Med/High rendering | Use High for final export |

**⚠️ CRITICAL:** All parts must connect to adjacent elements. Isolated floating parts will fail to print.

---

## Text Tab

Add text that wraps around the snowflake arms.

| Setting | Purpose | 3D Print Tip |
|---------|---------|-------------|
| **Text Input** | Words/letters to display | Text must touch hub/abstract |
| **Font** | 50+ cursive fonts or .ttf/.otf upload | Simple fonts print better |
| **Outer Radius** | Text spread distance (mm) | Adjust to control size |
| **Letter Spacing** | Gap between letters (mm) | 1-2mm typical, prevent overlaps |
| **Boldness** | Line thickness (mm) | **0.3-0.5mm minimum for 3D print** |
| **Mirror** | Create symmetric second copy | Ensures balanced design |
| **Underline** | Optional decorative line | Must connect to text |

**Secondary Text:** Enable for inner text ring - must overlap or touch primary text.

---

## Letter Control Tab

Adjust individual characters if they overlap or need repositioning.

| Setting | Purpose |
|---------|---------|
| **Character Selector** | Pick which letter to edit |
| **X / Y Offset** | Move selected character left/right/up/down |
| **Rotation** | Rotate single character independently |
| **Scale** | Make one letter bigger or smaller |

---

## Hubs Tab

Geometric shapes at the snowflake center.

| Setting | Purpose | 3D Print Tip |
|---------|---------|-------------|
| **Shape Type** | Circle, Polygon (3-12 sides), Star | Circle = easiest to print |
| **Hub Radius** | Size of the hub (mm) | 5-15mm typical |
| **Hollow** | Ring (yes) or filled (no) | Hollow looks elegant |
| **Boldness** | Ring thickness when hollow | 0.3mm minimum for 3D |
| **Oscillation** | Wavy edge effect | Adds organic look |
| **Star Ratio** | Point sharpness | 0.5-0.6 for balance |

Click "Add Hub" multiple times for nested geometric layers. Each hub must touch the next (no floating gaps).

---

## Abstract Tab

Decorative patterns (waves, lines, or branching trees) on the arms.

**Shapes** (Simple): Line, Sine wave, Zigzag
- **Amplitude:** Wave height (mm)
- **Frequency:** Number of waves
- **Boldness:** Line thickness
- **Mirror:** Create symmetric pair

**Fractals** (Complex Branching):
| Setting | Purpose | For 3D Print |
|---------|---------|-------------|
| **Branches Per Node** | How branches split | 2-3 typical |
| **Recursion Depth** | Branching generations | 3-4 max (avoid slowdown) |
| **Branch Length** | Size of branches | Scales down automatically |
| **Length Decay** | Shrinking factor | 0.5-0.8 typical |
| **Thickness** | Branch line width | 0.3mm minimum |

**Critical:** All abstracts must connect to text or hubs - no isolated floating branches.

---

## Images Tab

Import SVG images to use as repeating arm elements.

| Setting | Purpose | 3D Print Tip |
|---------|---------|-------------|
| **Import SVG** | Upload .svg file | Must be solid paths |
| **Scale** | 1.0 = 1 unit = 1mm | Adjust to fit |
| **Inner Radius** | Distance from center (mm) | Must reach text/hubs |
| **Y Offset** | Vertical shift | Align with arms |
| **Mirror** | Symmetric placement | Both sides mirror |
| **Rotation** | Angle of image | Orients on arms |

Images repeat on all snowflake arms. Ensure image connects to text or hubs.

---

## Export

**Save Project:** Ctrl+S → saves design settings as .json (instant reload later)

**Export STL:** Ctrl+E → choose format → ready for 3D printer

| Export Type | Use | Output |
|-------------|-----|--------|
| **Combined** | Single piece print | 1 .stl file |
| **All Parts** | Multi-piece assembly | ZIP with multiple .stl |

**Quality Setting (Global tab):** Use **High** for final prints.

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
| **Tab Navigation** | Alt + 1 through 6 |
| **3D Rotate** | Click & drag |
| **3D Zoom** | Scroll wheel |
| **3D Pan** | Right-click & drag |

---

## 3D Printing Guide

### ⚠️ CRITICAL: Model Connectivity

**Your model must have all parts touching each other to print as a single piece.**

Before exporting, verify in the 3D preview:
- ✓ Text connects to hub (or overlaps slightly)
- ✓ Hub connects to abstract pattern  
- ✓ Abstract touches text at outer edge
- ✓ No floating/isolated elements

If elements are separated:
1. Reduce text "Outer Radius" to move text inward
2. Increase hub "Radius" to extend it
3. Adjust abstract "Inner Radius" so patterns overlap
4. Increase "Boldness" values to bridge small gaps

### For Successful Printing

| Setting | Value | Why |
|---------|-------|-----|
| **Extrusion Depth** | 2-3mm | Thin but durable; no supports needed |
| **Text Boldness** | 0.3-0.5mm minimum | Thinner = breaks during printing |
| **Hub/Abstract Boldness** | 0.3mm+ | Too thin = fragile |
| **Edge Profile** | Fillet (rounded) | Stronger than chamfered edges |
| **Preview Quality** | High | Ensures detail in export |
| **All parts** | Connected | Single piece = no assembly |

### Print Flat, No Supports

✓ Models lie flat (lying down horizontally)  
✓ No overhanging elements - no supports needed  
✓ 30-60 minute print time typical  
✓ Minimal post-processing  
✓ No assembly alignment needed  

### Material Recommendations

- **Resin (SLA/DLP):** Best detail preservation
- **FDM (PLA/PETG):** Most accessible, use 0.4+ mm boldness
- **SLS/Nylon:** Strongest results

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **White/blank screen on startup** | Right-click .exe → Run as Administrator OR restart computer |
| **Text not visible** | Check "Visible" in Letter Control tab; increase Outer Radius |
| **Font won't load** | Try different font from list; custom fonts must be .ttf/.otf |
| **Design updates slow** | Reduce Quality setting to Low/Med; simplify fractals |
| **Gaps between elements** | Reduce text Outer Radius; increase hub Radius; check 3D preview |
| **Export fails** | Reduce Quality; ensure at least one element visible; check disk space |

---

## Support

**Issues:** [GitHub Issues](https://github.com/kar883/Ultimate-Snowflake-Generator/issues)  
**Repository:** [Ultimate-Snowflake-Generator](https://github.com/kar883/Ultimate-Snowflake-Generator)

---

**Workflow:** Design → Preview → Test export (Low quality) → Final export (High quality) → 3D Print!

All models print **flat without supports** as **single connected pieces**. ❄️

---

## Installation & Setup

### Option 1: Using the Installed Application (Windows)

1. **Download the Installer**
   - Download `Snowflake Generator Setup.exe` from the releases page
   - This file can be installed to your computer

2. **Install the Application**
   - Double-click `Snowflake Generator Setup.exe`
   - Follow the installation wizard steps
   - Choose your installation location (default: `C:\Program Files\Snowflake Generator`)
   - Click "Install" to complete setup
   - The application will create shortcuts on your desktop and Start menu

3. **Launch the Application**
   - Double-click the desktop shortcut or find "Snowflake Generator" in your Start menu
   - The application will open in a window

### Option 2: Using the Portable Executable (Windows)

1. **Download the Portable Version**
   - Download `Snowflake Generator.exe` (portable version)
   - No installation required!

2. **Run the Application**
   - Double-click the `.exe` file directly
   - The application launches immediately
   - No registration or installation wizard needed
   - Each run is independent with no persistent installation

### Option 3: Running from Source (Advanced Users)

1. **Install Node.js**
   - Download and install Node.js v18+ from [nodejs.org](https://nodejs.org/)
   - Verify installation: Open Command Prompt and type `node --version`

2. **Clone or Download the Repository**
   - Clone: `git clone https://github.com/kar883/Ultimate-Snowflake-Generator.git`
   - Or download the ZIP file and extract it

3. **Install Dependencies**
   - Open Command Prompt in the project folder
   - Run: `npm install`
   - Wait for all packages to install (2-5 minutes)

4. **Run Development Server**
   - Type: `npm run dev`
   - The app will open in your browser (usually `https://localhost:5173`)
   - Code changes automatically refresh the app

5. **Build for Production**
   - Type: `npm run build`
   - Type: `npm run electron:start`
   - Or: `npm run package` to create installers

---

## Getting Started

### First Time Usage

1. **Open the Application**
   - You'll see a 3D preview window on the right and controls on the left

2. **Explore the Default Design**
   - The app starts with a sample snowflake design
   - Rotate the 3D preview by clicking and dragging with your mouse
   - Zoom using your mouse scroll wheel
   - Pan by right-clicking and dragging (or Shift + left-click)

3. **Understand the Workflow**
   - **Global Tab**: Set overall dimensions and quality
   - **Text Tab**: Add and configure text content
   - **Letter Control Tab**: Fine-tune individual characters
   - **Hubs Tab**: Add geometric shapes to the center
   - **Abstract Tab**: Add decorative patterns
   - **Planes Tab**: Manage multiple snowflake layers
   - **Export**: Save your design as STL files for 3D printing

---

## Main Interface Overview

### Screen Layout

```
┌─────────────────────────────────────────────────────┐
│  Snowflake Generator Header (Save, Load, Export)    │
├──────────────────────┬──────────────────────────────┤
│                      │                              │
│  Control Panel       │  3D Preview                  │
│  (Left Sidebar)      │  (Right Side)                │
│                      │                              │
│  - Tabs at top       │  - Click to rotate           │
│  - Settings below    │  - Scroll to zoom            │
│  - Export buttons    │  - Real-time rendering       │
│                      │                              │
└──────────────────────┴──────────────────────────────┘
```

### Key UI Elements

- **Tab Buttons**: Six tabs for different configuration sections
- **Sliders**: Adjust numeric values (most have keyboard shortcuts)
- **Text Inputs**: Enter text content, project names, custom values
- **Checkboxes**: Toggle features on/off
- **Dropdowns**: Select from predefined options (fonts, hub shapes, etc.)
- **Export Buttons**: Download STL files, save projects, create archives
- **3D Preview**: Real-time visualization of your design
- **Thumbnails**: Quick visual reference for patterns and options

---

## Global Settings Tab

This tab controls the overall properties of your snowflake design.

### Project Name
- **What it does**: Names your project for organization and file exports
- **How to use**: Click the text field and type a name
- **Example**: "Winter Celebration 2024" or "3D Print Design"
- **Impact**: Used in save files and exported STL filenames

### Color / Material
- **What it does**: Sets the displayed color in the 3D preview
- **How to use**: Click the color swatch to open color picker
- **Note**: Color is for visualization only; actual 3D printing is typically single-color
- **Impact**: Does not affect geometry, only appearance

### Extrusion Depth
- **What it does**: Overall height/thickness of the snowflake design in millimeters
- **How to use**: Use the slider or type a value
- **Range**: 0.5 mm to 50 mm
- **Typical Values**:
  - 2-3 mm: Thin, delicate designs (requires strong support)
  - 5-10 mm: Robust, easy to print
  - 15-30 mm: Heavy, substantial designs
- **Impact**: Affects strength and material usage for 3D printing

### Bevel Settings
The edges of your snowflake can be rounded or angled for appearance and strength.

#### Bevel Enabled
- **What it does**: Toggles edge finishing on/off
- **When to enable**: Usually "on" for better appearance and durability
- **When to disable**: For sharp, precise edges or to save processing time

#### Bevel Type
- **Fillet**: Smooth, rounded edges (recommended for 3D printing)
- **Chamfer**: Flat 45-degree angled edges (more geometric appearance)

#### Bevel Amount
- **What it does**: How much of the edge is beveled in millimeters
- **Range**: 0.1 mm to 2 mm
- **Typical Value**: 0.5 mm (good balance of appearance and detail)
- **Higher values**: More rounded, but may hide fine details

#### Bevel Segments
- **What it does**: Smoothness of the bevel curve (higher = smoother)
- **Range**: 1 to 16 segments
- **Typical Value**: 4-6 (good quality without excessive geometry)
- **Impact**: More segments = more file size and slower 3D rendering

### Slot Configuration

**Understanding Slots**: Slots allow you to assembly multi-layer snowflakes into a 3D structure.

#### Slot Enabled
- **What it does**: Toggles automatic slot cutting for assembly
- **When enabled**: Each layer will have slots cut for interlocking
- **When disabled**: All layers are separate, no assembly mechanism

#### Slot Length
- **What it does**: How far into each arm the slot extends (in mm)
- **Range**: 10 mm to 100 mm
- **Typical Value**: 30-50 mm (depends on arm size)
- **Impact**: Longer = more interlocking support, shorter = easier to manage

#### Slot Width
- **What it does**: Width of the cut slots (in mm) - should match material thickness
- **Range**: 1 mm to 10 mm
- **Critical**: Match this to your printing material thickness + 0.2 mm tolerance
- **Examples**:
  - 3.2 mm thick plastic: Set to 3.4-3.5 mm
  - 2 mm cardstock: Set to 2.2-2.3 mm

#### Slot Mode
- **2-plane**: Perpendicular layers (base + one other direction)
- **3-plane**: Complex 3-axis assembly (advanced, requires precise printing)

### Global Stroke Weight
- **What it does**: Default line thickness for all text and patterns
- **How to use**: Set once here, then individual elements can override it
- **Range**: 0.1 mm to 3 mm
- **Impact**: Affects all text and decorative lines globally

### Quality Settings
- **Low**: Faster rendering, smaller file sizes, less detail
- **Medium**: Balanced quality and performance (recommended)
- **High**: Maximum detail, largest file sizes, slower processing
- **When to use each**:
  - Low: Preview designs, weak computer
  - Medium: Most production designs
  - High: Final exports, detailed parts

### Sync All Layers / Planes
- **What it does**: If enabled, changes apply to ALL layers simultaneously
- **When enabled**: Great for making uniform changes across all planes
- **When disabled**: Edit individual layers separately
- **Toggle**: Click checkbox to switch

---

## Text Configuration Tab

This tab configures the text that appears around the snowflake arms.

### Understanding Text Groups

Your snowflake can have TWO text groups on each layer:
- **Primary Group**: Main text ring (usually outer)
- **Secondary Group**: Optional inner text ring

### Primary vs Secondary Selection

At the top of the Text tab, click either "Primary Group" or "Secondary Group" to edit that ring's settings.

### Text Input
- **What it does**: The actual text that appears on the snowflake
- **How to use**: Click the text field and type
- **Special characters**: Supports most fonts' available characters
- **Length**: Can be short (5 chars) or long (50+ chars) depending on font size
- **Common examples**:
  - Single word: "SNOWFLAKE"
  - Names: "SARAH & JOHN"
  - Phrases: "Happy Holidays 2024"
  - Single letter: "F"

### Font Selection

#### Font Dropdown (Pre-loaded Fonts)
- **What it does**: Select from 50+ Google Fonts cursive typefaces
- **How to use**: Click dropdown and scroll, or type to search
- **Popular choices**:
  - "Great Vibes": Elegant, flowing
  - "Tangerine": Playful, curly
  - "Pacifico": Bold, rounded
  - "Satisfy": Organic, natural
  - "Caveat": Hand-written style

#### Font Search Box
- **What it does**: Filter fonts by name as you type
- **How to use**: Type letters to find matching fonts
- **Example**: Type "Great" to find "Great Vibes"

#### System Fonts Button (Chrome/Edge only)
- **What it does**: Access fonts installed on your computer
- **How to use**: Click "System Fonts" button to load local fonts
- **Requirements**: Chrome or Edge browser, HTTPS connection
- **Note**: Not available in all browsers

#### Upload Font Button
- **What it does**: Use a custom `.ttf` or `.otf` font file
- **How to use**: Click "Upload Font" and select a font file from your computer
- **Format**: Must be True Type Font (.ttf) or Open Type Font (.otf)
- **Note**: Font loads for this session only

### Font Size / Letter Spacing

#### Auto-fit Mode (Recommended)
- **What it does**: Automatically scales font size to match your target outer radius
- **How to use**: 
  1. Select "Auto-fit" from the sizing mode dropdown
  2. Set your target "Outer Radius" (e.g., 50 mm)
  3. Change fonts, spacing, or boldness freely
  4. Font size automatically adjusts to keep text at target size
- **Advantage**: Consistent scaling when you experiment

#### Fixed-Size Mode (Manual)
- **What it does**: One-time font size adjustment; doesn't auto-scale after
- **How to use**:
  1. Select "Fixed-size" from the sizing mode dropdown
  2. Adjust "Outer Radius" slider to set exact size
  3. Font size won't change when you modify fonts later
- **Advantage**: Precise control, predictable behavior

### Outer Radius
- **What it does**: Distance from snowflake center to the outer edge of the text
- **Range**: 20 mm to 150 mm
- **Typical Value**: 50-80 mm
- **Impact**: 
  - Smaller = tighter, more readable text
  - Larger = spread out, thinner appearance
  - **In Auto-fit mode**: Adjust this to change text size automatically
  - **In Fixed-size mode**: Set once and leave it

### Character Spacing
- **What it does**: Gap between individual letters
- **Range**: 0 mm to 10 mm
- **Default**: 1-2 mm (depends on font)
- **Higher value**: Letters spread further apart
- **Lower value**: Letters closer together, may overlap on small circles
- **Impact**: Affects how naturally the text curves around the arms

### Line Height / Vertical Offset
- **What it does**: Vertical position of the text relative to the arm centerline
- **Range**: -5 mm to 5 mm
- **Negative**: Moves text toward center of snowflake
- **Positive**: Moves text toward outer edge
- **Tip**: Useful for centering text vertically when using secondary text

### Text Boldness
- **What it does**: Thickness/weight of the text stroke
- **Range**: 0.1 mm to 2 mm
- **Higher values**: Thicker, darker text, less fine detail
- **Lower values**: Thinner, more delicate text, easier to clog with resin
- **Recommended**: 0.3-0.5 mm for 3D printing

### Rotation
- **What it does**: Rotates the entire text around the center point
- **Range**: 0° to 360°
- **Use cases**:
  - Align text to start at top: 0°
  - Rotate 90° to start at right
  - Rotate 180° to flip
  - Fine adjustments (5°, 10°, etc.)

### Mirror Effect
- **What it does**: Creates a mirrored copy of text inside each arm
- **When enabled**: Text appears twice in each arm, symmetrically
- **Mirror Offset**: Distance between original and mirror (in mm)
- **Use cases**:
  - Create balanced, symmetrical designs
  - Double the text without doubling content
  - Professional balanced appearance

### Underline (Optional Decorative Line)

#### Underline Enabled
- **What it does**: Adds a line beneath the text
- **Visual effect**: Creates a frame or emphasis under text
- **Toggle**: Checkbox to enable/disable

#### Underline Settings
When underline is enabled, you can customize:

- **Underline Boldness**: Thickness of the line (0.1-2 mm)
- **Underline Start**: How far into the arm the line begins (in mm)
- **Underline Length**: How long the line extends (in mm)
- **Cap Style**: How mirrored underlines connect:
  - None: Separate lines
  - Curve: Smooth curved connection
  - Perpendicular: Right-angle connection
- **Cap Length**: Length of the connecting piece (in mm)

### Secondary Text Group

The Secondary Group works identically to Primary but appears as an inner ring. To use:
1. Click "Secondary Group" tab
2. Check "Enable Secondary Text" checkbox
3. Configure same settings as Primary
4. Secondary text appears inside Primary text, creating concentric rings

---

## Letter Control Tab

Fine-tune individual character positioning for advanced designs.

### Character Selector
- **What it does**: Choose which character to adjust individually
- **How to use**: 
  1. Type the character you want to adjust (or select from list)
  2. Its settings appear below
  3. Make adjustments
  4. This character moves differently while others stay in place

### Individual Character Properties

#### Character Position Offset
- **X Offset**: Move the character left/right relative to the curve (range: -10 to 10 mm)
- **Y Offset**: Move the character up/down along the radius (range: -10 to 10 mm)
- **Rotation**: Rotate this one character independently (range: 0-360°)
- **Use cases**:
  - Adjust spacing if characters overlap
  - Reposition specific letters for artistic effect
  - Emphasize certain characters

#### Visibility & Effects
- **Visible**: Toggle whether this character appears (checkbox)
- **Scale**: Make this character larger or smaller (0.5 = half size, 2.0 = double)
- **Boldness Override**: Override the global text boldness for just this character

### Batch Editing

#### Copy Settings
- After adjusting a character, click "Copy" to save its settings
- Click "Paste" on another character to apply the same adjustments
- Useful for making all characters match a specific style

#### Reset Character
- Click "Reset" to return a character to default settings
- Removes individual offsets and returns to the text group's settings

---

## Hubs Configuration Tab

Hubs are geometric shapes at the center of your snowflake.

### Understanding Hubs

A hub provides visual interest and structural support at the center. Each layer can have multiple hubs (nested concentrically).

### Add Hub Button
- Click "Add Hub" to create a new hub on the current layer
- Each hub appears as a new section in this tab
- Multiple hubs stack from center outward

### Hub Properties

#### Hub Enabled
- Toggle visibility of this hub on/off

#### Shape Type
- **Circle**: Perfect circle (simple, smooth)
- **Polygon**: Regular polygon (triangle, hexagon, etc.)
  - Use "Hub Sides" to set number of sides
  - 3 = triangle, 4 = square, 6 = hexagon, 12 = near-circle
- **Star**: Sharp-pointed star shape
  - Use "Hub Sides" for number of points
  - Use "Star Ratio" to control point sharpness

#### Hub Radius
- **What it does**: Distance from center to edge of hub
- **Range**: 2 mm to 30 mm
- **Typical**: 5-15 mm depending on overall snowflake size
- **Impact**: Larger = more prominent center piece

#### Hub Boldness
- **What it does**: Thickness of the hub outline (when not hollow/filled)
- **Range**: 0.1 mm to 2 mm
- **Only applies when**: "Hollow" toggle is ON
- **Higher value**: Thicker ring, more visible

#### Hollow Toggle
- **Enabled**: Hub is a ring outline only (not filled)
  - Allows interior design to show through
  - More elegant and lightweight
  - Use "Hub Boldness" to set ring thickness
- **Disabled**: Hub is a solid filled shape
  - More solid appearance
  - Better structural integrity
  - Covers interior designs

#### Oscillation (Wave Effect)

This creates a rippling/wavy effect on the hub edge.

- **Oscillation Enabled**: Toggle the wave effect on/off
  - Only works with circular hubs
  - Creates organic, natural ripples
  
- **Oscillation Amplitude**: Height of the waves (in mm)
  - 0.5 mm: Subtle ripples
  - 2-3 mm: Noticeable waves
  - 5+ mm: Dramatic, extreme waves
  
- **Oscillation Frequency**: Number of waves around the circumference
  - 4: Four bumps (like a flower)
  - 6: Six bumps (symmetrical with 6-arm snowflake)
  - 12: Twelve bumps (very organic)
  - More = more complex

### Hub Sides (for Polygon/Star)
- **What it does**: Number of sides/points in the polygon or star
- **Values**:
  - 3: Triangle (sharp, delta shape)
  - 4: Square/diamond
  - 5: Pentagon (star looks like classic star)
  - 6: Hexagon (matches snowflake structure)
  - 8: Octagon (smooth polygon)
  - 12: Circle approximation
- **Range**: 3 to 24 sides

### Star Ratio
- **What it does**: Controls point sharpness (only for star shape)
- **Range**: 0.3 to 0.9
- **Lower (.3-.4)**: Thin, needle-like points
- **Higher (.7-.9)**: Blunt, rounded points
- **Typical**: 0.5-0.6 for balanced appearance

### Delete Hub
- Click "Delete Hub" button to remove this hub
- You can have as many hubs as you want

### Multiple Hubs (Nested)

Create layered hub effects:
1. Add first hub (e.g., circle radius 10 mm)
2. Add second hub (e.g., circle radius 20 mm)
3. Add third hub (e.g., polygon radius 30 mm)
4. Result: Three concentric geometric shapes

---

## Abstract Patterns Tab

Add complex procedural patterns to your snowflake arms.

### Understanding Abstracts

Abstracts are algorithmic patterns that extend from the center to the outer radius. Each layer can have multiple abstract patterns.

### Add Shape / Add Fractal Buttons

- **Add Shape**: Creates a wave or line pattern (simple, fast)
- **Add Fractal**: Creates a branching tree pattern (complex, organic)

### SHAPES: Simple Wave Patterns

#### Shape Type
- **Line**: Straight radial line from center to outer edge
- **Sine**: Smooth sine-wave oscillating left and right
- **Zigzag**: Sharp angular zigzag pattern

#### Shape Properties

**Enabled**: Toggle visibility on/off

**Visible**: Show/hide in 3D preview (different from enabled)

**Rotation**: Rotate the entire pattern around the center (0-360°)

**Mirror**: Create a mirrored second pattern inside the same arm
- Mirrors on opposite side of arm centerline
- Creates symmetrical appearance
- Uses "Mirror Offset" to set distance

**Mirror Offset** (when mirror is enabled)
- Distance between original and mirrored pattern (in mm)
- 0: Patterns touch at centerline
- 5-10mm: Visible gap showing both patterns

**Shape Boldness**: Thickness of the pattern lines (0.1-2 mm)
- Thinner: More delicate, detail-oriented
- Thicker: Bold, prominent

**Shape Amplitude**: Height of the wave oscillation (in mm)
- Line shape: Horizontal movement left/right
- Sine/Zigzag: Vertical wave height
- Range: 0-10 mm
- Higher = more extreme waves

**Shape Frequency**: Number of oscillations per arm
- Sine wave: Complete cycles
- Zigzag: Number of zigs or zags
- Range: 1-20
- Higher = more complex, detailed pattern

**Shape Length**: How far the pattern extends (in mm)
- Typically 20-60 mm
- Shorter: Doesn't reach outer edge
- Longer: Approaches outer radius

**Shape Outer Radius**: Safe outer boundary (in mm)
- Pattern won't extend beyond this
- Prevents overlap with text
- Typical: 10-20 mm less than text outer radius

### FRACTALS: Branching Tree Patterns

Fractals create organic, tree-like branching structures.

#### Fractal Properties

**Enabled**: Toggle visibility on/off

**Branch Pattern**: How branches split at each node
- **Symmetric**: Splits evenly left and right
- **Alternating**: Alternates sides at each level
- **Random**: Random distribution (uses seed value)

**Trunk Length**: Distance before first branch (in mm)
- Range: 0-10 mm
- 0: Branches immediately from center
- 5-10: Trunk appears before branching

**Branches Per Node**: How many branches spawn at each split point
- 2: Binary tree (each node splits to 2)
- 3: Ternary tree (each node splits to 3)
- 4+: More complex branching
- Typical: 2-3

**Recursion Depth**: Number of branching generations
- 2-3: Simple, sparse tree
- 4-5: Moderate, balanced complexity
- 6+: Dense, very detailed (slower to process)
- Range: 1-10

**Min Branch Length**: Stop branching if segments get shorter (in mm)
- Prevents infinitely tiny branches
- Range: 0.1-5 mm
- Controls complexity and file size

**Branch Angle**: Spread angle between branches (in degrees)
- 30°: Tight, vertical branches
- 60°: Moderate spread
- 90°: Wide, horizontal spread
- 180°: Maximum spread

**Branch Length**: Length of the first branch segment (in mm)
- Subsequent branches scale down by "Length Decay" factor
- Range: 10-50 mm

**Length Decay**: Factor for shortening at each generation
- 0.5: Each generation is half as long as previous
- 0.7: Slower reduction (more balanced tree)
- 0.9: Minimal reduction (nearly same length branches)
- Range: 0.3-0.99

**Thickness Decay**: Factor for thinning at each generation
- Similar to length decay but for line thickness
- 0.5: Branches get half as thick
- 0.8: Slower thinning
- Higher = thicker branches at edges

**Thickness**: Base thickness of branches (in mm)
- Range: 0.1-2 mm
- Subsequent branches scale down by thickness decay

**Rounded Tips**: Cap terminal branches with smooth semicircles
- Enabled: Organic, smooth-ended branches
- Disabled: Sharp pointed endings

**Random Seed**: Seed for reproducible random generation
- Same seed = same random pattern every time
- Different seed = different randomization
- Use to explore variations

**Angle Variation**: Random noise added to branch angles (in degrees)
- 0°: Perfect geometric angles
- 10-20°: Natural organic variation
- 40°+: Wild, chaotic branches

**Length Variation**: Random factor for branch length variation
- 0: Exact lengths (geometric)
- 0.1-0.2: Subtle variation (natural)
- 0.5+: Extreme variation (wild)

**Shape Outer Radius**: Maximum extension boundary (in mm)
- Pattern can't exceed this radius
- Prevents overlap issues
- Typical: 10-20 mm less than text radius

### Managing Multiple Abstracts

You can layer multiple shapes and fractals:
1. Add a sparse fractal (depth 3) for organic structure
2. Add a dense sine wave for rhythmic detail
3. Add another fractal with different colors for contrast
4. Each can have independent properties
5. All render together in the final design

### Delete Abstract
- Click "Delete Abstract" to remove a pattern
- You can safely delete and re-add to experiment

---

## Planes/Layers Tab

Manage multiple snowflake layers for complex 3D assemblies.

### Understanding Layers/Planes

Each "layer" or "plane" is an independent snowflake that can be:
- Rotated in 3D space to create complex structures
- Cut with interlocking slots for physical assembly
- Exported individually or together
- Synchronized (all edited together) or independent

### Layer List
- Shows all layers in your design
- Currently selected layer is highlighted

### Add Layer
- Click "Add Layer" to create a new layer
- Starts with same config as current layer
- Give it a descriptive name

### Active Layer Selector
- Click any layer to make it active
- All edits apply to this layer only (unless sync is enabled)
- The selected layer appears highlighted

### Layer Properties

#### Layer Name
- Rename for organization: "Base Plane", "Cross Support", "Left Arm", etc.
- Appears in exports and file outputs

#### Layer Enabled
- Checkbox to toggle visibility
- Disabled layers don't render in 3D preview
- Disabled layers still export if you choose to include them

#### 3D Rotation (Rot X, Rot Y, Rot Z)

These rotate the entire layer in 3D space.

- **Rot X**: Rotation around the X-axis (horizontal left-right)
  - 0°: Flat, pointing up
  - 90°: Edge-on, perpendicular to viewing plane
  - Range: 0-360°

- **Rot Y**: Rotation around the Y-axis (vertical up-down)
  - 0°: Standard position
  - 90°: Rotated 90° clockwise
  - 180°: Upside down
  - Range: 0-360°

- **Rot Z**: Rotation around the Z-axis (front-to-back twist)
  - Rotates around viewer's line of sight
  - Creates "face" of snowflake pointing different directions
  - Range: 0-360°

#### Common Layer Configurations

**2-Layer Assembly** (Base + Cross)
1. Layer 1: Base Plane
   - Rot X: 0°, Rot Y: 0°, Rot Z: 0°

2. Layer 2: Cross Plane
   - Rot X: 90°, Rot Y: 0°, Rot Z: 0°
   - Creates a cross (+) when viewed from above
   - Interlocking slots cut automatically

**3-Layer Assembly** (Base + Cross + Tilt)
1. Layer 1: Base Plane
   - Rot X: 0°, Rot Y: 0°, Rot Z: 0°

2. Layer 2: Cross Plane
   - Rot X: 90°, Rot Y: 0°, Rot Z: 0°

3. Layer 3: Tilt Plane
   - Rot X: 45°, Rot Y: 0°, Rot Z: 45°
   - Creates diagonal support
   - Adds structural strength

#### Slot Configuration Per Layer

Slots can be customized per layer:

- **Slot Length Adjustment**: Fine-tune slot length specifically for this layer
  - Useful if one layer prints thinner/thicker than expected
  - Relative adjustment (in mm)

- **Slot Width Offset**: Adjust slot width for this layer
  - Compensates for material variance
  - Positive value = wider slot (looser fit)
  - Negative value = narrower slot (tighter fit)

#### Sync All Layers

When enabled:
- Changes to text in one layer apply to all layers
- Changes to hubs apply to all layers
- Rotation (Rot X/Y/Z) applies to all layers
- Useful for uniform modifications

When disabled:
- Each layer is edited independently
- Great for asymmetrical designs
- More control, more manual work

#### Delete Layer
- Remove this layer from the design
- Can't undo, so be careful!

### Layer Inheritance

When you add a layer:
- It copies ALL current settings from the active layer
- Text, hubs, abstracts, boldness, font, etc.
- Everything starts identical, then you customize
- Much faster than starting from scratch

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

#### Export All Planes / Zip All
- **What it does**: Exports EACH layer as a separate STL file, bundled in a ZIP archive
- **Use when**: Printing multiple layers separately for assembly
- **Output**: ZIP file containing multiple `.stl` files
- **Example contents**:
  - `MySnowflake_base.stl`
  - `MySnowflake_cross.stl`
  - `MySnowflake_tilt.stl`
- **Pros**: Each layer can be printed on different printer/material
- **Cons**: Requires assembly step

#### Export Layer (Individual)
- Click individual layer export button to save just one layer
- Useful for printing one layer multiple times

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
  1. Set environment variables: `GEMINI_API_KEY`
  2. Click "AI Randomizer"
  3. Select design emphasis:
     - "3D Printing": Optimized for physical printing
     - "2D Aesthetics": Beautiful for viewing/art
     - "Fractal": Mathematical patterns
  4. AI generates random text, hub configs, abstract patterns
  5. Click again for more variations

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
| Planes/Layers | Alt + 6 |

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
