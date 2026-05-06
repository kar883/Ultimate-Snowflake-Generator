import React, { useState, useEffect, useRef, useCallback, useContext, createContext } from 'react';
import { createPortal } from 'react-dom';
import { SnowflakeConfig, TextGroupConfig, HubConfig, CharOffset, LayerConfig, AbstractConfig, DesignQuality, ShortcutConfig, ImageConfig, createDefaultImage } from '../types';
import { CURSIVE_FONTS, FONT_TTF_URLS } from '../constants';
import { SystemFontButton } from './LocalFontPicker';
import { TooltipContext, InfoTooltip } from './Tooltip';
import { useTranslation } from '../translations';
import { clearGeometryCache } from '../geometryCache';
import { buildTextControlEntries, getPathCommandBounds, getAdjustedGlyphPathCommands } from '../utils/textControl';
import opentype from 'opentype.js';

const Toggle: React.FC<{
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  activeColor?: string;
  className?: string;
}> = ({ label, checked, onChange, activeColor = "text-sky-400", className = "" }) => {
  const [localChecked, setLocalChecked] = useState(checked);

  useEffect(() => {
    setLocalChecked(checked);
  }, [checked]);

  const handleChange = () => {
    const newValue = !localChecked;
    setLocalChecked(newValue);
    onChange(newValue);
  };

  return (
    <label className={`flex items-center gap-2 cursor-pointer group ${className}`}>
      <div className={`w-6 h-3 rounded-full border transition-colors relative ${checked ? 'bg-sky-600/20 border-sky-500/50' : 'bg-slate-800 border-white/10'}`}>
        <div className={`absolute top-0.5 left-0.5 w-1.5 h-1.5 rounded-full transition-all ${checked ? `bg-sky-400 translate-x-3` : 'bg-slate-500 translate-x-0'}`} />
      </div>
      {label && (
        <span className={`text-[9px] font-bold uppercase transition-colors ${checked ? activeColor : 'text-slate-500 group-hover:text-slate-400'}`}>
          {label}
        </span>
      )}
      <input
        type="checkbox"
        className="hidden"
        checked={localChecked}
        onChange={handleChange}
      />
    </label>
  );
};

const SlotModeToggle: React.FC<{
  mode: '2-plane' | '3-plane';
  onChange: (mode: '2-plane' | '3-plane') => void;
  t: (key: string) => string;
}> = ({ mode, onChange, t }) => (
  <div className="flex items-center gap-2">
    <span className="text-[9px] font-bold text-slate-500 uppercase">
      {t('Mode')}:
    </span>
    <div className="flex bg-slate-900 p-1 rounded-lg gap-1">
      <button
        onClick={() => onChange('2-plane')}
        className={`px-3 py-1 text-[9px] font-black uppercase rounded ${mode === '2-plane' ? 'bg-sky-500 text-white' : 'text-slate-500'}`}
      >
        2-Plane
      </button>
      <button
        onClick={() => onChange('3-plane')}
        className={`px-3 py-1 text-[9px] font-black uppercase rounded ${mode === '3-plane' ? 'bg-sky-500 text-white' : 'text-slate-500'}`}
      >
        3-Plane
      </button>
    </div>
  </div>
);

const DESCRIPTIONS: Record<string, string> = {
  "Project Name": "The filename used when saving or exporting your design.",
  "Model Color": "The base color applied to the 3D mesh and 2D preview.",
  "Edge Profile": "Adds rounded or slanted edges to the 3D model for a more realistic look.",
  "Reset View": "Reset the 2D view to fit the content.",
  "Export": "Export the current design in the selected format.",
  "Extrusion Depth": "The thickness of the snowflake planes in millimeters.",
  "Global Boldness": "Makes all text, abstracts, hubs, and underlines appear bolder. Higher values make them thicker. Note: 3D boldness may not work properly with all fonts - some complex or decorative fonts may not render correctly.",
  "Preview Resolution": "Controls the geometric detail of the 3D preview. Lower is faster, higher is smoother.",
  "Profile Shape": "Choose Fillet for rounded edges or Chamfer for flat, angled edges.",
  "Bevel Amount": "The distance the bevel extends from the edges.",
  "Fillet Detail": "How many segments are used to smooth the rounded edge. Higher means smoother curves.",
  "Enable Half-Lap Slots": "Cuts slots into the planes so they can physically slide together (interlock).",
  "Slot Length": "The depth of the cut-out slot.",
  "Slot Clearance": "How wide the slot is. Usually set slightly larger than the thickness of the material.",
  "Slot Mode": "Choose between 2-plane (90°) or 3-plane (120°) interlocking configurations.",
  "Free Floating Check": "Detects and highlights enabled planes that have no content, helping identify empty layers that might need adjustment.",
  "Phrase Content": "The text used to generate the snowflake's symmetrical arms. Leave blank for AI to randomly choose a word.",
  "Arms / Symmetry": "The number of times the text or shape repeats around the center.",
  "Outer Radius": "The measurement from the origin point to the outer most edge of the model.",
  "Radius Lock": "Forces the design to stay within your target size. When locked, changing fonts or spacing will move words inward or outward to maintain this exact size.",
  "Inner Radius": "The distance between the center of the snowflake and the start of the text.",
  "Letter Spacing": "Adjusts the space between individual characters. Negative values can make cursive letters overlap and fuse together.",
  "Boldness": "Adds additional thickness to the font's lines.",
  "Manual Rotation": "Rotates the entire group of text around the snowflake's center.",
  "Offset X": "Moves the selected character horizontally within the text string.",
  "Offset Y": "Moves the selected character vertically within the text string.",
  "Hub Shape": "Changes the geometry of the central ring (Circle, Star, or Polygon).",
  "Hub Radius": "The distance from the center to the edge of the hub ring.",
  "Hub Boldness": "The thickness of the hub ring when 'Hollow' is enabled.",
  "Shape Arms": "Number of procedural arms for the abstract pattern.",
  "Frequency": "How rapidly the wave pattern oscillates along its length.",
  "Amplitude": "The height of the waves in the abstract pattern.",
  "Abstract Boldness": "The line weight of the procedural abstract shape.",
  "Abstract Outer Radius": "How far the abstract shape extends from the center.",
  "Rot X": "3D rotation around the X-axis for this specific plane.",
  "Rot Y": "3D rotation around the Y-axis for this specific plane.",
  "Sync All Planes": "Applies Text and Design changes to all planes simultaneously.",
  "Highlight Active Plane Only": "When enabled, the active plane is emphasized while other enabled planes are visually dimmed in 2D and 3D previews.",
  "Enable All Slot Bridges": "Global bridge switch. Turn OFF to disable bridge generation on all planes and hide per-plane bridge controls.",
  "AI Randomizer": "Only works while online. Generates a random base plane design optimized for 3D printing, 2D aesthetics, or purely traditional fractal geometry.",
  "Export STL": "Export the current 3D design as a combined single mesh body. Ideal for 3D printing.",
  "Export All Planes": "Export each plane individually and package them into a single ZIP file.",
  "Auto-Configure Assembly Slots": "Automatically calculate and cut interlocking slots for physical assembly.",
  "Export Resolution": "Sets the detail level for the exported STL file.",
  "Hub Sides": "The number of sides for the polygon hub or points for the star hub.",
  "Oscillation Enable": "Toggles sine-wave deformation on the hub geometry. Only available for Circular hubs.",
  "Oscillation Amplitude": "The height of the sine waves applied to the hub's radius.",
  "Oscillation Frequency": "The number of wave peaks around the hub's circumference.",
  "Hollow": "Toggles whether the hub shape is a solid filled shape or a ring.",
  "Visible": "Toggles visibility of this element in the design.",
  "Mirror Effect": "Reflects the text or shape to create perfect symmetry within each arm.",
  "Mirror Offset": "The distance between the original shape and its mirrored copy.",
  "Star Ratio": "Determines the sharpness of the star points. Lower values make thinner points.",
  "Rotation": "Rotates the element around its own center or the group center.",
  "Undo": "Revert the last change made to the design.",
  "Redo": "Re-apply a change that was undone.",
  "Auto Slots": "Automatically detects intersecting planes and configures slots for physical assembly.",
  "ZIP All": "Bundles all individual plane STLs into a single downloadable ZIP file.",
  "Add Hub": "Adds a new central geometric hub to the current plane.",
  "Add Abstract": "Adds a new procedural abstract shape to the current plane.",
  "Font Search": "Filter the available cursive fonts by name.",
  "System Fonts": "Load a font installed on your local computer (Requires Chrome/Edge).",
  "Upload Font": "Upload a .ttf or .otf file to use a custom font.",
  "Layer Name": "Rename this plane for easier organization.",
  "Layer Visible": "Toggle the visibility of this entire plane in the 3D model.",
  "Font Family": "Select the typeface for the text.",
  "Character Selector": "Select a specific character to adjust its individual position.",
  "Combined STL": "Merges all visible layers into a single 3D printable STL file.",
  "Zip All STLs": "Exports each layer as a separate STL file and bundles them into a ZIP archive.",
  "Export Layer": "Download this specific layer as a 3D STL file or 2D vector (SVG/DXF).",
  "Underline": "Adds a decorative line beneath the text.",
  "Underline Thickness": "Thickness of the underline stroke.",
  "Underline Start": "Starting position of the underline relative to the text.",
  "Underline Length": "Length of the underline.",
  "Underline Mirror Offset": "Vertical distance from the text baseline.",
  "Cap Style": "Style of the connection between mirrored underlines.",
  "Cap Length": "Length of the connecting cap shape.",
  "Slot Length Adj": "Fine-tune the slot cut length for this specific plane.",
  "Slot Width Offset": "Fine-tune the slot cut width (clearance) for this specific plane.",
  "Manual Slot Width Adjustment": "Enables per-slot width controls for this plane so each slot segment can be tuned independently.",
  "Cross Main Slot Width Offset": "Additional width offset applied only to the Cross plane main slot.",
  "Cross Tip-In Slot Width Offset": "Additional width offset applied only to the Cross plane tip-in slot.",
  "Tilt Main Slot Width Offset": "Additional width offset applied only to the Tilt plane main slot.",
  "Tilt Extension Slot Width Offset": "Additional width offset applied only to the Tilt plane extension slot.",
  "Enable Slot Bridges": "Add connector segments along this plane's slot edge to reconnect free-floating islands.",
  "Manual Slot Bridge Width": "Overrides the automatic slot bridge width with a wider minimum width for added strength.",
  "Slot Bridge Width": "Minimum width of the baked slot bridge block used when manual bridge width is enabled.",
  "Cross Main Bridge Width": "Manual bridge width override applied only to the Cross plane main slot bridge.",
  "Cross Tip-In Bridge Width": "Manual bridge width override applied only to the Cross plane tip-in slot bridge.",
  "Tilt Main Bridge Width": "Manual bridge width override applied only to the Tilt plane main slot bridge.",
  "Tilt Extension Bridge Width": "Manual bridge width override applied only to the Tilt plane extension slot bridge.",
  "Protect Mating Clearance": "First-class fit rule. Keeps bridge geometry out of the mating slot envelope so assembly remains possible.",
  "Bridge Position": "Position of this connector along the slot path.",
  "Bridge Length": "Length of this connector segment measured along the slot path.",
  "Bridge Width": "Width of this connector segment away from the slot edge.",
  "Bridge Edge Offset": "Signed offset from slot edge into or away from the plane face.",
  "Bridge Clearance Margin": "Extra no-go margin from mating slot volume used by clearance protection.",
  "Cross Tip-In Adj": "Adjust the Cross plane tip-in slot segment length independently from the main slot length.",
  "Tilt Extension Adj": "Adjust the Tilt plane extension slot segment length independently from the main slot length.",
  "Trunk Length": "Distance before the first branching occurs.",
  "Branches Per Node": "Number of new branches spawned at each split point.",
  "Recursion Depth": "Number of branching generations.",
  "Min Branch Length": "Stop branching if segments get shorter than this.",
  "Branch Angle": "Spread angle between branches.",
  "Branch Length": "Length of the first branch segment. Automatically scales if it exceeds the outer radius.",
  "Length Decay": "Factor by which branches shorten each generation.",
  "Random Seed": "Seed for reproducible random generation.",
  "Angle Variation": "Amount of random noise added to branch angles.",
  "Length Variation": "Amount of random noise added to branch lengths.",
  "Active Plane Selector": "Sets this plane as the active target for editing. When 'Sync All Planes' is disabled, changes are applied only to this selection.",
  "Thickness Decay": "Controls how much thinner the branches get at each new generation.",
  "Rounded Tips": "Adds rounded caps to the ends of the final branches.",
  "Cut Slots": "Toggles the automatic slot cutting operation for assembly.",
  "Slot Width": "Extra clearance added on top of the model extrusion height. 0.2 mm gives a snug fit; increase for a looser assembly.",
  // ── Auto-fit / Fixed-size ──────────────────────────────────────────────────
  "Auto-fit": "Automatically rescales the font size whenever you change fonts, letter spacing, or boldness to keep the arms exactly at the target outer radius.",
  "Fixed-size": "One-shot manual set. The outer radius slider adjusts the font size once, but further edits (font changes, spacing) will not rescale automatically.",
  "Diameter Mode": "Choose how the Outer Radius target is maintained. Auto-fit keeps arms at the target radius as you edit. Fixed-size sets it once and leaves it.",
  // ── Primary / Secondary group ──────────────────────────────────────────────
  "Primary Group": "The main text ring. Click to select and edit its properties below.",
  "Secondary Group": "An optional inner text ring. Click to select and edit its properties below.",
  // ── Bevel type ────────────────────────────────────────────────────────────
  "Fillet": "Rounds the edges with a smooth curved profile.",
  "Chamfer": "Cuts the edges at a flat 45-degree angle.",
  // ── Hub tab ───────────────────────────────────────────────────────────────
  "circle": "A circular hub shape.",
  "polygon": "A flat-sided polygon hub (triangle, hexagon, etc.).",
  "star": "A star-shaped hub with alternating inner and outer points.",
  // ── Abstract tab ──────────────────────────────────────────────────────────
  "line": "A straight radial line from inner to outer radius.",
  "sine": "A sine-wave pattern along the radial arm.",
  "zigzag": "A zigzag pattern along the radial arm.",
  "symmetric": "Branches split evenly on both sides at each node.",
  "alternating": "Branches alternate left and right at successive nodes.",
  "random": "Branch angles are randomised using the seed value.",
  "Add Shape": "Add a new procedural wave or line shape to this plane.",
  "Add Fractal": "Add a new recursive fractal tree to this plane.",
  "Mirror": "Reflect the shape to create a symmetric pair within each arm.",
  "Round Tips": "Cap the terminal branches with a smooth semicircle.",
  "Delete Abstract": "Remove this abstract shape from the plane.",
  "Shape Type": "The wave pattern used for the abstract shape.",
  "Branch Pattern": "Controls how branches are distributed at each split point.",
  // ── Images tab ────────────────────────────────────────────────────────────
  "Import SVG": "Import an SVG file and place its outline as a repeating arm element on the snowflake.",
  "Image Visible": "Show or hide this SVG image on the snowflake.",
  "Delete Image": "Remove this SVG image from the snowflake.",
  "Scale": "Uniform scale factor. 1.0 = one SVG unit equals one millimetre.",
  "Y Offset": "Vertical offset from the arm centreline in millimetres.",
  "Flip Image": "Mirror the SVG horizontally around its own centre.",
  "SVG Rotation": "Rotate the SVG around its own centre before placing it on the arm.",
  "Image Mirror": "Reflect the image to create a mirrored copy on the opposite side of each arm.",
  "Image Mirror Offset": "Vertical distance between the original and mirrored image copies.",
  "Image Arms": "Number of times the SVG is repeated around the snowflake.",
  "Image Rotation": "Rotate the image's arm position around the snowflake centre.",
  "Image Inner Radius": "Distance from the snowflake centre to the left edge of the image."
};

// Helper function to get translated description
const getDescription = (key: string, t?: (key: string) => string): string => {
  if (!t) return DESCRIPTIONS[key] || key;
  const translatedKey = `${key}_desc`;
  const translated = t(translatedKey);
  return translated !== translatedKey ? translated : DESCRIPTIONS[key] || key;
};

interface ExportMenuProps {
  label: string;
  onExportSTL: (quality: DesignQuality) => void | Promise<void>;
  onExport3MF?: (quality: DesignQuality) => void | Promise<void>;
  onExportSelectedPlanesSTL?: (layerIndices: number[], quality: DesignQuality) => void | Promise<void>;
  onExportSelectedPlanes3MF?: (layerIndices: number[], quality: DesignQuality) => void | Promise<void>;
  onExport2D?: (format: 'svg' | 'dxf') => void;
  onEstimateExportStats?: (format: 'stl' | '3mf', quality: DesignQuality, layerIndices?: number[]) => Promise<{ triangles: number; estimatedMb: number; estimatedSeconds: number } | null>;
  onPrecomputeExportStats?: (layerIndices?: number[]) => void;
  isLoading: boolean;
  disabled?: boolean;
  className?: string;
  baseColor?: string;
  direction?: 'up' | 'down';
  show2D?: boolean;
  shortcut?: any;
  t?: (key: string) => string;
  compact?: boolean;
  planeActions?: Array<{
    label: string;
    onExportSTL: (quality: DesignQuality) => void | Promise<void>;
    onExport3MF?: (quality: DesignQuality) => void | Promise<void>;
    layerIndex?: number;
    isActive?: boolean;
  }>;
  defaultEstimateLayerIndices?: number[];
}

const ExportMenu: React.FC<ExportMenuProps> = ({
  label, onExportSTL, onExport3MF, onExportSelectedPlanesSTL, onExportSelectedPlanes3MF, onExport2D, onEstimateExportStats, onPrecomputeExportStats, isLoading, disabled, className, baseColor = "bg-sky-600", direction = 'up', show2D = false, shortcut, t, compact = false, planeActions, defaultEstimateLayerIndices
}) => {
  const [quality, setQuality] = useState<DesignQuality>('low');
  const [format, setFormat] = useState<'stl' | '3mf' | 'svg' | 'dxf'>('stl');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedPlaneIndices, setSelectedPlaneIndices] = useState<number[]>([]);
  const [hoveredFormat, setHoveredFormat] = useState<'stl' | '3mf' | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [hoverStats, setHoverStats] = useState<{ format: 'stl' | '3mf'; quality: DesignQuality; triangles: number; estimatedMb: number; estimatedSeconds: number; perPlane?: Array<{ label: string; triangles: number; estimatedMb: number; estimatedSeconds: number }> } | null>(null);
  const [disabledPlaneTooltip, setDisabledPlaneTooltip] = useState<{ text: string; top: number; left: number } | null>(null);
  const estimateRequestRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const updatePosition = useCallback(() => {
    if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setPosition({
            top: direction === 'up' ? rect.top : rect.bottom,
            left: rect.left,
            width: rect.width
        });
    }
  }, [direction]);

  useEffect(() => {
      if(isOpen) {
          updatePosition();
          window.addEventListener('scroll', updatePosition, true);
          window.addEventListener('resize', updatePosition);
          return () => {
              window.removeEventListener('scroll', updatePosition, true);
              window.removeEventListener('resize', updatePosition);
          }
      }
  }, [isOpen, updatePosition]);

  const handleToggleOpen = () => {
    if (disabled || isLoading) return;
    if (!isOpen) {
      updatePosition();
    }
    setIsOpen(!isOpen);
  };

  const handleMainClick = async () => {
    if (disabled || isLoading) return;

    const hasPlaneActions = Array.isArray(planeActions) && planeActions.length > 0;
    const hasSelectedPlanes = hasPlaneActions && selectedPlaneIndices.length > 0;

    if (hasSelectedPlanes && (format === 'stl' || format === '3mf')) {
      const selectedLayerIndices = selectedPlaneIndices
        .map((idx) => planeActions?.[idx]?.layerIndex)
        .filter((value): value is number => typeof value === 'number');

      if (selectedLayerIndices.length > 0) {
        if (format === 'stl' && onExportSelectedPlanesSTL) {
          await Promise.resolve(onExportSelectedPlanesSTL(selectedLayerIndices, quality));
          return;
        }
        if (format === '3mf' && onExportSelectedPlanes3MF) {
          await Promise.resolve(onExportSelectedPlanes3MF(selectedLayerIndices, quality));
          return;
        }
      }

      for (const idx of selectedPlaneIndices) {
        const action = planeActions?.[idx];
        if (!action) continue;
        if (format === 'stl') {
          await Promise.resolve(action.onExportSTL(quality));
        } else if (action.onExport3MF) {
          await Promise.resolve(action.onExport3MF(quality));
        }
      }
      return;
    }

    if (format === 'stl') await Promise.resolve(onExportSTL(quality));
    else if (format === '3mf') await Promise.resolve(onExport3MF?.(quality));
    else onExport2D?.(format);
  };

  const mainButtonClass = compact
    ? `w-full h-full px-2 py-1.5 rounded-l-lg text-[9px] font-black uppercase tracking-normal transition-all flex items-center justify-center gap-1 ${baseColor} hover:brightness-110 text-white whitespace-nowrap min-w-0`
    : `w-full h-full px-3 py-1.5 rounded-l-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${baseColor} hover:brightness-110 text-white`;

  const toggleButtonClass = compact
    ? `px-1.5 rounded-r-lg flex items-center justify-center transition-all border-l border-black/10 ${baseColor} hover:brightness-110 text-white shrink-0`
    : `px-2 rounded-r-lg flex items-center justify-center transition-all border-l border-black/10 ${baseColor} hover:brightness-110 text-white`;

  const hasPlaneActions = Array.isArray(planeActions) && planeActions.length > 0;
  const has3DFormat = format === 'stl' || format === '3mf';

  const togglePlaneSelection = (idx: number) => {
    if (!hasPlaneActions) return;
    const action = planeActions?.[idx];
    const isPlaneActive = action?.isActive !== false;
    const supportsFormat = format === 'stl' || Boolean(action?.onExport3MF);
    if (!action || !isPlaneActive || !supportsFormat) return;

    setSelectedPlaneIndices((prev) =>
      prev.includes(idx) ? prev.filter((v) => v !== idx) : [...prev, idx]
    );
  };

  const getEstimateLayerIndices = useCallback((): number[] | undefined => {
    if (selectedPlaneIndices.length > 0 && hasPlaneActions) {
      const selected = selectedPlaneIndices
        .map((idx) => {
          const action = planeActions?.[idx];
          if (!action || action.isActive === false) return undefined;
          return action.layerIndex;
        })
        .filter((value): value is number => typeof value === 'number');
      return selected.length > 0 ? selected : undefined;
    }
    return defaultEstimateLayerIndices;
  }, [defaultEstimateLayerIndices, hasPlaneActions, planeActions, selectedPlaneIndices]);

  useEffect(() => {
    if (!hasPlaneActions) {
      if (selectedPlaneIndices.length > 0) setSelectedPlaneIndices([]);
      return;
    }

    setSelectedPlaneIndices((prev) =>
      prev.filter((idx) => {
        const action = planeActions?.[idx];
        if (!action) return false;
        const isPlaneActive = action.isActive !== false;
        const supportsFormat = format === 'stl' || Boolean(action.onExport3MF);
        return isPlaneActive && supportsFormat;
      })
    );
  }, [format, hasPlaneActions, planeActions, selectedPlaneIndices.length]);

  useEffect(() => {
    if (!isOpen || !onPrecomputeExportStats) return;
    onPrecomputeExportStats(getEstimateLayerIndices());
  }, [getEstimateLayerIndices, isOpen, onPrecomputeExportStats]);

  const requestHoverStats = useCallback(async (hoverFormat: 'stl' | '3mf') => {
    if (!onEstimateExportStats) {
      setHoverStats(null);
      return;
    }

    const requestId = ++estimateRequestRef.current;
    setStatsLoading(true);
    try {
      const stats = await onEstimateExportStats(hoverFormat, quality, getEstimateLayerIndices());
      if (estimateRequestRef.current !== requestId) return;
      if (stats) {
        setHoverStats({
          format: hoverFormat,
          quality,
          triangles: stats.triangles,
          estimatedMb: stats.estimatedMb,
          estimatedSeconds: stats.estimatedSeconds,
        });

        if (hasPlaneActions && selectedPlaneIndices.length > 1) {
          const selectedActions = selectedPlaneIndices
            .map((idx) => planeActions?.[idx])
            .filter((action): action is NonNullable<typeof action> => Boolean(action && typeof action.layerIndex === 'number'));

          const perPlaneResults = await Promise.all(
            selectedActions.map(async (action) => {
              const one = await onEstimateExportStats(hoverFormat, quality, [action.layerIndex as number]);
              return one
                ? { label: action.label, triangles: one.triangles, estimatedMb: one.estimatedMb, estimatedSeconds: one.estimatedSeconds }
                : null;
            })
          );

          if (estimateRequestRef.current !== requestId) return;
          const perPlane = perPlaneResults.filter((row): row is { label: string; triangles: number; estimatedMb: number; estimatedSeconds: number } => Boolean(row));
          setHoverStats((prev) => {
            if (!prev || prev.format !== hoverFormat || prev.quality !== quality) return prev;
            return { ...prev, perPlane };
          });
        }
      } else {
        setHoverStats(null);
      }
    } catch {
      if (estimateRequestRef.current === requestId) {
        setHoverStats(null);
      }
    } finally {
      if (estimateRequestRef.current === requestId) {
        setStatsLoading(false);
      }
    }
  }, [getEstimateLayerIndices, onEstimateExportStats, quality]);

  useEffect(() => {
    if (hoveredFormat) {
      void requestHoverStats(hoveredFormat);
    }
  }, [hoveredFormat, quality, selectedPlaneIndices, requestHoverStats]);

  useEffect(() => {
    if (!isOpen) {
      setHoveredFormat(null);
      setHoverStats(null);
      setStatsLoading(false);
      setDisabledPlaneTooltip(null);
    }
  }, [isOpen]);

  const formatMb = (value: number): string => {
    if (value < 1) {
      return value.toFixed(1);
    }
    return String(Math.round(value));
  };

  const formatSeconds = (value: number): string => {
    if (value < 10) {
      return value.toFixed(1);
    }
    return String(Math.round(value));
  };

  return (
    <div ref={containerRef} className={`relative flex rounded-lg shadow-lg ${disabled ? 'opacity-50 pointer-events-none' : ''} ${className}`}>
      <InfoTooltip label={label} description={getDescription('Export', t)} shortcut={shortcut} className="flex-1">
        <button
          onClick={handleMainClick}
          className={mainButtonClass}
        >
          {isLoading ? (
            <><div className="w-3 h-3 border-2 border-white/60 border-t-white rounded-full animate-spin" /><span>{t('Exporting')}</span></>
          ) : (
            <><svg className={`${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} shrink-0`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            <span className="truncate">{label}</span></>
          )}
        </button>
      </InfoTooltip>
      <button
        onClick={handleToggleOpen}
        className={toggleButtonClass}
      >
        <svg className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && createPortal(
        <div
           ref={dropdownRef}
           className="fixed z-[9999] bg-slate-800 border border-white/10 rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100 flex flex-col p-1.5 gap-1"
           style={{
             top: position.top,
             left: position.left,
             width: Math.max(position.width, 200),
             transform: direction === 'up' ? 'translateY(-100%) translateY(-4px)' : 'translateY(4px)'
           }}
        >
           {/* Format section */}
           <div className="px-2 pt-1 pb-0.5 text-[8px] font-black uppercase text-slate-500 tracking-wider">Format</div>
           <div
             className="space-y-1"
             onMouseLeave={() => {
               setHoveredFormat(null);
             }}
           >
             <div className="grid grid-cols-3 gap-1 bg-slate-900/60 p-1 rounded-md">
               {(['stl', '3mf', 'svg', 'dxf'] as const)
                .filter(f => f === 'stl' || f === '3mf' || show2D)
                .filter(f => f !== '3mf' || Boolean(onExport3MF))
                .map(f => (
                 <button key={f} onClick={() => setFormat(f)}
                   onMouseEnter={() => {
                     if (f === 'stl' || f === '3mf') {
                       setHoveredFormat(f);
                     } else {
                       setHoveredFormat(null);
                     }
                   }}
                   className={`py-1.5 text-[9px] font-black uppercase rounded transition-all ${format === f ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-white'}`}>
                   {f.toUpperCase()}
                 </button>
               ))}
             </div>

             <div className={`bg-slate-900/70 border border-white/10 rounded-md px-2 py-1 text-[9px] text-slate-300 h-20 overflow-y-auto ${hoveredFormat ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
               {hoveredFormat && (statsLoading ? (
                 <span>Estimating {hoveredFormat.toUpperCase()}...</span>
               ) : hoverStats && hoverStats.format === hoveredFormat ? (
                 <>
                   <div>
                     Est. {hoveredFormat.toUpperCase()} ({hoverStats.quality.toUpperCase()}): {hoverStats.triangles.toLocaleString()} tris, {formatMb(hoverStats.estimatedMb)} MB, ~{formatSeconds(hoverStats.estimatedSeconds)}s
                   </div>
                   {selectedPlaneIndices.length > 1 && (!hoverStats.perPlane || hoverStats.perPlane.length === 0) && (
                     <div className="text-[8px] text-slate-400">Loading selected-plane breakdown...</div>
                   )}
                   {hoverStats.perPlane && hoverStats.perPlane.length > 0 && (
                     <div className="border-t border-white/10 pt-1 space-y-0.5">
                       {hoverStats.perPlane.map((item) => (
                         <div key={item.label} className="text-[8px] text-slate-200 flex items-center justify-between gap-2">
                           <span className="truncate">{item.label}</span>
                           <span className="shrink-0">{item.triangles.toLocaleString()} tris, {formatMb(item.estimatedMb)} MB, ~{formatSeconds(item.estimatedSeconds)}s</span>
                         </div>
                       ))}
                     </div>
                   )}
                 </>
               ) : (
                 <span>Estimation unavailable for current selection.</span>
               ))}
             </div>
           </div>

           {/* Quality section — for 3D exports */}
           {has3DFormat && (
             <>
               <div className="px-2 pt-1 pb-0.5 text-[8px] font-black uppercase text-slate-500 tracking-wider">Quality</div>
               <div className="grid grid-cols-3 gap-1 bg-slate-900/60 p-1 rounded-md">
                 {(['low', 'med', 'high'] as const).map(q => (
                   <button key={q} onClick={() => setQuality(q)}
                     className={`py-1.5 text-[9px] font-black uppercase rounded transition-all ${quality === q ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-white'}`}>
                     {t ? t(q) : q}
                   </button>
                 ))}
               </div>
             </>
           )}

           {/* Export action */}
           <button
             onClick={async () => { await handleMainClick(); setIsOpen(false); }}
             className={`mt-0.5 w-full py-2 text-[10px] font-black uppercase rounded-md text-white transition-all ${baseColor} hover:brightness-110`}
             disabled={format === '3mf' && !onExport3MF}
           >
             {selectedPlaneIndices.length > 0 && has3DFormat
               ? `Export Selected (${selectedPlaneIndices.length}) ${format.toUpperCase()}${has3DFormat ? ` (${t ? t(quality) : quality})` : ''}`
               : `Export ${format.toUpperCase()}${has3DFormat ? ` (${t ? t(quality) : quality})` : ''}`}
           </button>

           {hasPlaneActions && has3DFormat && (
             <>
               <div className="px-2 pt-1 pb-0.5 text-[8px] font-black uppercase text-slate-500 tracking-wider">Single Plane</div>
               <div className="grid grid-cols-1 gap-1 bg-slate-900/60 p-1 rounded-md">
                 {planeActions!.map((action, idx) => {
                   const isPlaneActive = action.isActive !== false;
                   const supportsFormat = format === 'stl' || Boolean(action.onExport3MF);
                   const canExport = isPlaneActive && supportsFormat;
                   const isSelected = selectedPlaneIndices.includes(idx);
                   const disabledReason = !isPlaneActive
                     ? 'Plane is not active. Enable it in the Planes tab to export.'
                     : !supportsFormat
                       ? `${format.toUpperCase()} export is unavailable for this plane.`
                       : '';
                   return (
                     <div
                       key={action.label}
                       onMouseEnter={(e) => {
                         if (!canExport && disabledReason) {
                           const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                           setDisabledPlaneTooltip({
                             text: disabledReason,
                             top: rect.top - 8,
                             left: rect.left + (rect.width / 2),
                           });
                         }
                       }}
                       onMouseLeave={() => {
                         setDisabledPlaneTooltip((prev) => (prev ? null : prev));
                       }}
                     >
                       <button
                         onClick={() => {
                           togglePlaneSelection(idx);
                         }}
                         disabled={!canExport}
                         className={`w-full py-1.5 text-[9px] font-black uppercase rounded transition-all text-left px-2 flex items-center justify-between ${canExport ? (isSelected ? 'bg-sky-600 text-white' : 'bg-slate-700/70 text-white hover:bg-slate-600') : 'bg-slate-800/70 text-slate-500 cursor-not-allowed'}`}
                       >
                         <span>{action.label}</span>
                         <span className={`text-[8px] ${isSelected ? 'text-white' : 'text-slate-400'}`}>{isSelected ? 'Selected' : 'Select'}</span>
                       </button>
                     </div>
                   );
                 })}
                 {selectedPlaneIndices.length > 0 && (
                   <button
                     onClick={() => setSelectedPlaneIndices([])}
                     className="py-1.5 text-[9px] font-black uppercase rounded transition-all text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700"
                   >
                     Clear Selection
                   </button>
                 )}
               </div>
             </>
           )}

           {disabledPlaneTooltip && createPortal(
             <div
               className="fixed z-[10010] pointer-events-none"
               style={{
                 top: disabledPlaneTooltip.top,
                 left: disabledPlaneTooltip.left,
                 transform: 'translate(-50%, -100%)',
               }}
             >
               <div className="max-w-[230px] rounded-md border border-amber-200/20 bg-slate-900/95 text-[9px] leading-relaxed text-amber-100 px-2 py-1.5 shadow-2xl">
                 {disabledPlaneTooltip.text}
               </div>
               <div
                 className="mx-auto h-0 w-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-slate-900"
                 style={{ marginTop: '-1px' }}
               />
             </div>,
             document.body
           )}
        </div>,
        document.body
      )}
    </div>
  );
};

const AiRandomizerMenu: React.FC<{
  onGenerate: (mode: '3d' | '2d' | 'fractal', reset?: boolean) => void;
  isLoading: boolean;
  progress: number;
  className?: string;
  t?: (key: string) => string;
  onOpenShortcutsModal?: (tab: 'shortcuts' | 'apikey' | 'aiscope', message?: string) => void;
}> = ({ onGenerate, isLoading, progress, className, t, onOpenShortcutsModal }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [lastMode, setLastMode] = useState<'3d' | '2d' | 'fractal' | null>(null);
  const [resetOnRefresh, setResetOnRefresh] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const updatePosition = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setPosition({ top: rect.top, left: rect.left, width: rect.width });
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [isOpen, updatePosition]);

  const handleModeSelect = (mode: '3d' | '2d' | 'fractal') => {
    setLastMode(mode);
    onGenerate(mode, resetOnRefresh);
    setIsOpen(false);
  };

  const handleMainClick = () => {
    if (isLoading) return;
    onGenerate(lastMode || '3d', resetOnRefresh);
  };

  const handleRefresh = (e: React.MouseEvent) => {
    e.stopPropagation();
    onGenerate(lastMode || '3d', resetOnRefresh);
  };

  const modeLabel = lastMode ? (lastMode === 'fractal' ? 'Trad.' : lastMode.toUpperCase()) : '3D';

  return (
    <div ref={containerRef} className={`relative flex rounded-lg shadow-lg ${className}`}>
      <div className="relative flex-1 rounded-l-lg bg-violet-600 overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 bg-violet-400/40 transition-all duration-300 ease-out" style={{ width: `${progress}%` }} />
        )}
        <InfoTooltip label={t('AI Randomizer')} description={getDescription('AI Randomizer', t)} className="w-full h-full">
          <button
            onClick={handleMainClick}
            disabled={isLoading}
            className="relative w-full h-full px-3 py-1.5 rounded-l-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 hover:bg-violet-500 text-white z-10"
          >
            {isLoading ? (
              <><div className="w-3 h-3 border-2 border-white/60 border-t-white rounded-full animate-spin" /><span>{progress}%</span></>
            ) : (
              <><span>AI</span><span className="opacity-60 text-[8px]">({modeLabel})</span></>
            )}
          </button>
        </InfoTooltip>
      </div>

      <button
        onClick={() => !isLoading && setIsOpen(!isOpen)}
        className="px-2 rounded-r-lg flex items-center justify-center transition-all border-l border-black/10 bg-violet-600 hover:bg-violet-500 text-white"
        disabled={isLoading}
      >
        <svg className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Mode dropdown */}
      {isOpen && !isLoading && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[9999] bg-slate-800 border border-white/10 rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100 flex flex-col p-1.5 gap-1"
          style={{ top: position.top, left: position.left, width: Math.max(position.width, 190), transform: 'translateY(-100%) translateY(-4px)' }}
        >
          <div className="px-2 pt-1 pb-0.5 text-[8px] font-black uppercase text-slate-500 tracking-wider flex items-center justify-between">
            <span>Mode</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
                onOpenShortcutsModal?.('aiscope');
              }}
              className="p-0.5 hover:bg-white/10 rounded transition-colors"
              title="AI Settings"
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"/>
              </svg>
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1 bg-slate-900/60 p-1 rounded-md">
          {([
            { mode: '3d' as const, label: '3D' },
            { mode: '2d' as const, label: '2D' },
            { mode: 'fractal' as const, label: 'Trad.' },
          ]).map(({ mode, label }) => (
            <button key={mode} onClick={() => handleModeSelect(mode)}
              className={`py-1.5 text-[9px] font-black uppercase rounded transition-all ${lastMode === mode ? 'bg-violet-500 text-white' : 'text-slate-400 hover:text-white'}`}>
              {label}
            </button>
          ))}
          </div>

          <div className="px-2 pt-1 pb-0.5 text-[8px] font-black uppercase text-slate-500 tracking-wider">Actions</div>
          <button
            onClick={(e) => { handleRefresh(e); setIsOpen(false); }}
            className="w-full py-2 text-[10px] font-black uppercase rounded-md text-white bg-violet-600 hover:bg-violet-500 transition-all flex items-center justify-center gap-1.5"
          >
            <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {lastMode ? 'Shuffle Again' : 'Shuffle'}
          </button>

          <div className="flex justify-between items-center bg-slate-900/60 p-2 rounded-md">
            <span className="text-[9px] font-black uppercase text-slate-300">Reset on Shuffle</span>
            <Toggle label="" checked={resetOnRefresh} onChange={setResetOnRefresh} activeColor="text-violet-400" className="scale-90 origin-right" />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

const CutSlotsMenu: React.FC<{
  config: SnowflakeConfig;
  onUpdate: (updates: Partial<SnowflakeConfig>, commitTo3D?: boolean) => void;
  className?: string;
  t?: (key: string) => string;
}> = ({ config, onUpdate, className, t }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const updatePosition = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setPosition({ top: rect.top, left: rect.left, width: rect.width });
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [isOpen, updatePosition]);

  const handleToggle = () => {
    const nextEnabled = !config.slotEnabled;
    onUpdate({ slotEnabled: nextEnabled }, true);
  };

  const handleModeChange = (mode: '2-plane' | '3-plane') => {
    onUpdate({ slotMode: mode }, true);
  };

  return (
    <div ref={containerRef} className={`relative flex rounded-lg shadow-lg ${className}`}>
      <InfoTooltip label={t ? t('Cut Slots') : 'Cut Slots'} description={getDescription('Cut Slots', t)} className="flex-1">
        <button
          onClick={handleToggle}
          className={`w-full h-full px-3 py-1.5 rounded-l-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${config.slotEnabled ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-100'}`}
        >
          <span>Cut Slots</span>
          <span className="opacity-70 text-[8px]">{config.slotEnabled ? 'ON' : 'OFF'}</span>
        </button>
      </InfoTooltip>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`px-2 rounded-r-lg flex items-center justify-center transition-all border-l border-black/10 ${config.slotEnabled ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-100'}`}
      >
        <svg className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[9999] bg-slate-800 border border-white/10 rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100 flex flex-col p-1.5 gap-1"
          style={{ top: position.top, left: position.left, width: Math.max(position.width, 190), transform: 'translateY(-100%) translateY(-4px)' }}
        >
          <div className="px-2 pt-1 pb-0.5 text-[8px] font-black uppercase text-slate-500 tracking-wider">Mode</div>
          <div className="grid grid-cols-2 gap-1 bg-slate-900/60 p-1 rounded-md">
            {(['2-plane', '3-plane'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => handleModeChange(mode)}
                className={`py-1.5 text-[9px] font-black uppercase rounded transition-all ${config.slotMode === mode ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                {mode === '2-plane' ? '2-Plane' : '3-Plane'}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

interface DeferredNumberInputProps {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number, committed: boolean) => void;
  className?: string;
  disabled?: boolean;
  suffix?: string;
}

const DeferredNumberInput: React.FC<DeferredNumberInputProps> = ({ value, min, max, step, onChange, className, disabled, suffix }) => {
  const decimals = step < 1 ? (step < 0.1 ? 2 : 1) : 0;
  const safeValue = typeof value === 'number' && !isNaN(value) ? value : (min || 0);

  const [localValue, setLocalValue] = useState<string>(safeValue.toFixed(decimals));
  const containerRef = useRef<HTMLDivElement | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentValueRef = useRef(safeValue);
  const isDirty = useRef(false);
  const hasPendingCommit = useRef(false);

  useEffect(() => {
    const safe = typeof value === 'number' && !isNaN(value) ? value : (min || 0);
    setLocalValue(safe.toFixed(decimals));
    currentValueRef.current = safe;
  }, [value, decimals, min]);

  const update = (delta: number, commit: boolean) => {
    let next = currentValueRef.current + delta;
    next = Math.max(min, Math.min(max, next));
    next = parseFloat(next.toFixed(decimals));
    currentValueRef.current = next;
    setLocalValue(next.toFixed(decimals));
    hasPendingCommit.current = true;
    onChange(next, commit);
  };

  const startAdjust = (delta: number) => {
    if (disabled) return;
    const parsed = parseFloat(localValue);
    if (!isNaN(parsed)) currentValueRef.current = parsed;
    update(delta, false);
    timeoutRef.current = setTimeout(() => {
        intervalRef.current = setInterval(() => {
            update(delta, false);
        }, 80);
    }, 400);
  };

  const stopAdjust = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  const commit = () => {
    if (disabled) return;
    const parsed = parseFloat(localValue);
    if (!isNaN(parsed)) {
      const clamped = Math.max(min, Math.min(max, parsed));
      // Commit only when the numeric value truly changed.
      if ((isDirty.current || Math.abs(clamped - value) > 0.0001) && Math.abs(clamped - value) > 0.0001) {
          onChange(clamped, true);
      }
      isDirty.current = false;
      hasPendingCommit.current = false;
      setLocalValue(clamped.toFixed(decimals));
    } else {
      isDirty.current = false;
      hasPendingCommit.current = false;
      setLocalValue(value.toFixed(decimals));
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value);
    isDirty.current = true;
    hasPendingCommit.current = true;
    // Don't call onChange during typing - wait for commit
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const isSpace = e.key === ' ' || e.key === 'Spacebar';
    if (e.key === 'Enter' || isSpace) {
        if (isSpace) e.preventDefault();
        commit();
        (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
        setLocalValue(value.toFixed(decimals));
        isDirty.current = false;
        hasPendingCommit.current = false;
    } else if (e.key.length === 1 && !/[0-9eE+\-.]/.test(e.key)) {
        commit();
    }
  };

  useEffect(() => {
      const handlePointerDown = (event: PointerEvent) => {
          if (!hasPendingCommit.current) return;
          if (!containerRef.current) return;
          const target = event.target as Node | null;
          if (target && containerRef.current.contains(target)) return;
          commit();
      };

      document.addEventListener('pointerdown', handlePointerDown);
      return () => document.removeEventListener('pointerdown', handlePointerDown);
  });

  useEffect(() => {
      return () => {
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          if (intervalRef.current) clearInterval(intervalRef.current);
      }
  }, []);

  const smallStep = step;
  const largeStep = step * 10;

  return (
    <div ref={containerRef} className={`relative flex items-center bg-slate-900 border border-white/10 rounded-lg h-6 w-28 overflow-hidden select-none ${className} ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
         style={{
           position: 'relative',
           display: 'flex',
           alignItems: 'center',
           backgroundColor: '#0f172a',
           border: '1px solid rgba(255,255,255,0.1)',
           borderRadius: '8px',
           height: '24px',
           width: '112px',
           overflow: 'hidden',
           userSelect: 'none',
           opacity: disabled ? 0.5 : 1,
           pointerEvents: disabled ? 'none' : 'auto'
         }}>
      <div className="flex flex-col border-r border-white/10 h-full w-6 bg-slate-800/50"
           style={{
             display: 'flex',
             flexDirection: 'column',
             borderRight: '1px solid rgba(255,255,255,0.1)',
             height: '100%',
             width: '24px',
             backgroundColor: 'rgba(30,41,59,0.5)'
           }}>
        <button
          className="flex-1 hover:bg-sky-500 hover:text-white text-slate-400 flex items-center justify-center transition-colors active:bg-sky-600"
          onMouseDown={() => startAdjust(largeStep)}
          onMouseUp={stopAdjust}
          onMouseLeave={stopAdjust}
          tabIndex={-1}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#94a3b8',
            transition: 'all 0.2s',
            cursor: 'pointer'
          }}
        >
          <svg viewBox="0 0 24 24" width="8" height="8" fill="currentColor" style={{ width: '8px', height: '8px' }}><path d="M12 4l-8 8h16z"/></svg>
        </button>
        <button
          className="flex-1 hover:bg-sky-500 hover:text-white text-slate-400 flex items-center justify-center transition-colors border-t border-white/5 active:bg-sky-600"
          onMouseDown={() => startAdjust(-largeStep)}
          onMouseUp={stopAdjust}
          onMouseLeave={stopAdjust}
          tabIndex={-1}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#94a3b8',
            borderTop: '1px solid rgba(255,255,255,0.05)',
            transition: 'all 0.2s',
            cursor: 'pointer'
          }}
        >
          <svg viewBox="0 0 24 24" width="8" height="8" fill="currentColor" style={{ width: '8px', height: '8px' }}><path d="M12 20l-8-8h16z"/></svg>
        </button>
      </div>
      <div className="flex-1 relative h-full" style={{ flex: 1, position: 'relative', height: '100%' }}>
        <input
          type="number"
          value={localValue}
          step={step}
          min={min}
          max={max}
          onChange={handleChange}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          className="w-full h-full bg-transparent text-center text-[10px] font-black text-sky-400 focus:outline-none focus:bg-slate-800/50 px-1 appearance-none"
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: 'transparent',
            textAlign: 'center',
            fontSize: '10px',
            fontWeight: '900',
            color: '#38bdf8',
            outline: 'none',
            padding: '0 4px',
            appearance: 'none'
          }}
        />
        {suffix && <div className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none"
                     style={{
                       position: 'absolute',
                       right: '4px',
                       top: '50%',
                       transform: 'translateY(-50%)',
                       pointerEvents: 'none'
                     }}>
          <span className="text-[8px] font-black uppercase text-slate-600"
                style={{
                  fontSize: '8px',
                  fontWeight: '900',
                  textTransform: 'uppercase',
                  color: '#475569'
                }}>
            {suffix}
          </span>
        </div>}
      </div>
      <div className="flex flex-col border-l border-white/10 h-full w-6 bg-slate-800/50"
           style={{
             display: 'flex',
             flexDirection: 'column',
             borderLeft: '1px solid rgba(255,255,255,0.1)',
             height: '100%',
             width: '24px',
             backgroundColor: 'rgba(30,41,59,0.5)'
           }}>
        <button
          className="flex-1 hover:bg-sky-500 hover:text-white text-slate-400 flex items-center justify-center transition-colors active:bg-sky-600"
          onMouseDown={() => startAdjust(smallStep)}
          onMouseUp={stopAdjust}
          onMouseLeave={stopAdjust}
          tabIndex={-1}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#94a3b8',
            transition: 'all 0.2s',
            cursor: 'pointer'
          }}
        >
          <svg viewBox="0 0 24 24" width="8" height="8" fill="currentColor" style={{ width: '8px', height: '8px' }}><path d="M12 4l-8 8h16z"/></svg>
        </button>
        <button
          className="flex-1 hover:bg-sky-500 hover:text-white text-slate-400 flex items-center justify-center transition-colors border-t border-white/5 active:bg-sky-600"
          onMouseDown={() => startAdjust(-smallStep)}
          onMouseUp={stopAdjust}
          onMouseLeave={stopAdjust}
          tabIndex={-1}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#94a3b8',
            borderTop: '1px solid rgba(255,255,255,0.05)',
            transition: 'all 0.2s',
            cursor: 'pointer'
          }}
        >
          <svg viewBox="0 0 24 24" width="8" height="8" fill="currentColor" style={{ width: '8px', height: '8px' }}><path d="M12 20l-8-8h16z"/></svg>
        </button>
      </div>
    </div>
  );
};

interface DeferredTextInputProps {
  value: string;
  onChange: (v: string, committed: boolean) => void;
  placeholder?: string;
  className?: string;
  defaultValue?: string;
  label?: string;
  t?: (key: string) => string; // Add translation function
  onSaveDefault?: () => void;
}

const DeferredTextInput: React.FC<DeferredTextInputProps> = ({ value, onChange, placeholder, className, defaultValue, label, t, onSaveDefault }) => {
  const [localValue, setLocalValue] = useState(value);
  const isDirty = useRef(false);
  useEffect(() => { setLocalValue(value); }, [value]);
  const commit = () => { if (isDirty.current || localValue !== value) { onChange(localValue, true); isDirty.current = false; } };
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => { 
    setLocalValue(e.target.value); 
    isDirty.current = true; 
    onChange(e.target.value, false); 
  };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => { 
    if (e.key === 'Enter') { 
      commit(); 
      (e.target as HTMLInputElement).blur(); 
    } 
  };
  const showRevert = defaultValue !== undefined && value !== defaultValue;
  const heightClass = className?.includes('h-') ? 'h-full' : 'h-9';
  return (
    <div className={`space-y-1.5 ${className}`} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {label && (
         <div className="flex justify-between items-center" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <InfoTooltip label={label} description={getDescription(label, t)} />
            {showRevert && (
               <button
                 onClick={() => { onChange(defaultValue || '', true); setLocalValue(defaultValue || ''); }}
                 className="w-4 h-4 rounded hover:bg-rose-500 hover:text-white text-slate-500 transition-colors flex items-center justify-center"
                 title={t('reset')}
                 style={{
                   width: '16px',
                   height: '16px',
                   borderRadius: '4px',
                   backgroundColor: 'transparent',
                   color: '#64748b',
                   display: 'flex',
                   alignItems: 'center',
                   justifyContent: 'center',
                   cursor: 'pointer',
                   transition: 'all 0.2s'
                 }}
               >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ width: '12px', height: '12px' }}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
               </button>
            )}
            {onSaveDefault && (
              <button
                onClick={onSaveDefault}
                className="w-4 h-4 rounded hover:bg-emerald-500 hover:text-white text-slate-500 transition-colors flex items-center justify-center ml-1"
                title={t ? t('saveDefault') : 'Save as Default'}
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '4px',
                  backgroundColor: 'transparent',
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginLeft: '4px',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ width: '12px', height: '12px' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3h11l3 3v15H5V3z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 3v6h8V3" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 21v-6h8v6" />
                </svg>
              </button>
            )}
         </div>
      )}
      <input
        type="text"
        value={localValue}
        onChange={handleChange}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={`w-full bg-slate-900 border border-white/10 rounded-lg px-3 text-xs font-black text-white placeholder-slate-600 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition-all ${heightClass}`}
        style={{
          width: '100%',
          backgroundColor: '#0f172a',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '8px',
          paddingLeft: '12px',
          paddingRight: '12px',
          fontSize: '12px',
          fontWeight: '900',
          color: 'white',
          outline: 'none',
          transition: 'all 0.2s',
          height: className?.includes('h-') ? 'auto' : '36px'
        }}
      />
    </div>
  );
};

const ControlRow: React.FC<{ label: string; children: React.ReactNode; onReset?: () => void; onSaveDefault?: () => void; isModified?: boolean; t?: (key: string) => string }> = ({ label, children, onReset, onSaveDefault, isModified, t }) => (
    <div className="space-y-2" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div className="flex justify-between items-center" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="flex items-center" style={{ display: 'flex', alignItems: 'center' }}>
                <InfoTooltip label={label} description={getDescription(label, t || ((k) => k))} />
                {isModified && onReset && (
                  <button
                    onClick={onReset}
                    className="w-4 h-4 rounded hover:bg-rose-500 hover:text-white text-slate-500 transition-colors flex items-center justify-center mr-1"
                    title={t ? t('reset') : 'Reset'}
                    style={{
                      width: '16px',
                      height: '16px',
                      borderRadius: '4px',
                      backgroundColor: 'transparent',
                      color: '#64748b',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: '4px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ width: '12px', height: '12px' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                    </svg>
                  </button>
                )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
                {onSaveDefault && (
                  <button
                    onClick={onSaveDefault}
                    className="w-4 h-4 rounded hover:bg-emerald-500 hover:text-white text-slate-500 transition-colors flex items-center justify-center mr-1"
                    title={t ? t('saveDefault') : 'Save as Default'}
                    style={{
                      width: '16px',
                      height: '16px',
                      borderRadius: '4px',
                      backgroundColor: 'transparent',
                      color: '#64748b',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: '4px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ width: '12px', height: '12px' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3h11l3 3v15H5V3z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 3v6h8V3" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 21v-6h8v6" />
                    </svg>
                  </button>
                )}
                {children}
            </div>
        </div>
    </div>
);

interface ControlPanelProps {
  config: SnowflakeConfig;
  onUpdate: (updates: Partial<SnowflakeConfig>, commitTo3D?: boolean) => void;
  updateGroup: (group: 'primary' | 'secondary', updates: Partial<TextGroupConfig>, commitTo3D?: boolean) => void;
  updateCharOffset: (group: 'primary' | 'secondary', charIndex: number, offset: Partial<CharOffset>, commitTo3D?: boolean) => void;
  updateHubs: (newHubs: HubConfig[], commitTo3D?: boolean) => void;
  updateAbstracts: (newAbstracts: AbstractConfig[], commitTo3D?: boolean) => void;
  updateImages: (newImages: ImageConfig[], commitTo3D?: boolean) => void;
  onAiPolish: (mode: '3d' | '2d' | 'fractal', reset?: boolean) => void;
  aiLoading: boolean;
  aiProgress: number;
  onExportSTL: (quality?: DesignQuality) => void;
  onExport3MF: (quality?: DesignQuality) => void;
  onExportLayerSTL: (layerIndex: number, quality?: DesignQuality) => void;
  onExportLayer3MF: (layerIndex: number, quality?: DesignQuality) => void;
  onExportSelectedLayersSTL?: (layerIndices: number[], quality?: DesignQuality) => void;
  onExportSelectedLayers3MF?: (layerIndices: number[], quality?: DesignQuality) => void;
  onEstimateExportStats?: (format: 'stl' | '3mf', quality: DesignQuality, layerIndices?: number[]) => Promise<{ triangles: number; estimatedMb: number; estimatedSeconds: number } | null>;
  onPrecomputeExportStats?: (layerIndices?: number[]) => void;
  onExportAllLayersZip: (quality?: DesignQuality) => void;
  onExport2D?: (layerIndex: number, format: 'svg' | 'dxf') => void;
  exportLoading: boolean;
  exportLoadingKey?: string | null;
  onFetchFont: (name: string) => Promise<boolean>;
  onFontUpload: (file: File) => void;
  dynamicFonts: Record<string, string>;
  setViewMode: (mode: '2d' | '3d') => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  shortcuts?: ShortcutConfig;
  onUpdateShortcuts?: (config: ShortcutConfig) => void;
  onResetShortcuts?: () => void;
  onOpenShortcutsModal?: (tab: 'shortcuts' | 'apikey' | 'aiscope', message?: string) => void;
  onSaveAsDefault?: () => void;
  onRestoreFactoryDefaults?: () => void;
  activeTab: 'global' | 'text' | 'Letter Ctrl' | 'hubs' | 'abstract' | 'planes' | 'images';
  onTabChange: (tab: 'global' | 'text' | 'Letter Ctrl' | 'hubs' | 'abstract' | 'planes' | 'images') => void;
}

const ControlPanel: React.FC<ControlPanelProps> = ({
  config, onUpdate, updateGroup, updateCharOffset, updateHubs, updateAbstracts, updateImages, onAiPolish, aiLoading, aiProgress, onExportSTL, onExport3MF, onExportLayerSTL, onExportLayer3MF, onExportSelectedLayersSTL, onExportSelectedLayers3MF, onEstimateExportStats, onPrecomputeExportStats, onExportAllLayersZip, onExport2D, exportLoading, exportLoadingKey, onFetchFont, onFontUpload, dynamicFonts, /* SLOT-DISABLED: onAutoConfigureSlots, calculateOptimalSlots, */ setViewMode, undo, redo, canUndo, canRedo, shortcuts, onUpdateShortcuts, onResetShortcuts, onOpenShortcutsModal, onSaveAsDefault, onRestoreFactoryDefaults, activeTab, onTabChange
}) => {
  const { t } = useTranslation(config.language || 'en');
  const tabContentRef = useRef<HTMLDivElement>(null);
  const isInitialLoad = useRef(true);

  useEffect(() => {
    isInitialLoad.current = false;
  }, []);

  const [activeGroup, setActiveGroup] = useState<'primary' | 'secondary'>('primary');

  const [selectedCharIndex, setSelectedCharIndex] = useState(0);
  const [selectedHubIndex, setSelectedHubIndex] = useState(0);
  const [selectedAbstractIndex, setSelectedAbstractIndex] = useState(0);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [fontSearch, setFontSearch] = useState('');
  const [currentStats, setCurrentStats] = useState({ radius: 95, diameter: 190, activeGroupRadius: 95, activeGroupDiameter: 190 });
  const [radiusLocks, setRadiusLocks] = useState({ primary: { locked: true, target: 95 }, secondary: { locked: false, target: 20 } });
  const [showTooltips, setShowTooltips] = useState(true);

  const fontCache = useRef<Record<string, opentype.Font>>({});

  const activeLayer = config.layers[config.activeLayerIndex];

  // Safe Guard against invalid activeLayerIndex
  if (!activeLayer) return null;

  const groupData = activeLayer[activeGroup];
  const charControlEntries = buildTextControlEntries(groupData.text);
  const safeSelectedCharIndex = Math.min(selectedCharIndex, Math.max(0, charControlEntries.length - 1));
  const selectedCharEntry = charControlEntries[safeSelectedCharIndex];
  const currentLockState = radiusLocks[activeGroup];

  useEffect(() => {
    if (selectedCharIndex !== safeSelectedCharIndex) {
      setSelectedCharIndex(safeSelectedCharIndex);
    }
  }, [safeSelectedCharIndex, selectedCharIndex]);

  useEffect(() => {
    if (activeLayer.hubs && selectedHubIndex >= activeLayer.hubs.length && activeLayer.hubs.length > 0) {
      setSelectedHubIndex(Math.max(0, activeLayer.hubs.length - 1));
    } else if (!activeLayer.hubs || activeLayer.hubs.length === 0) {
      setSelectedHubIndex(0);
    }
  }, [activeLayer.hubs?.length, selectedHubIndex]);

  // Reset scroll position when tab changes
  useEffect(() => {
    if (tabContentRef.current) {
      tabContentRef.current.scrollTop = 0;
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeLayer.abstracts && selectedAbstractIndex >= activeLayer.abstracts.length && activeLayer.abstracts.length > 0) {
      setSelectedAbstractIndex(Math.max(0, activeLayer.abstracts.length - 1));
    } else if (!activeLayer.abstracts || activeLayer.abstracts.length === 0) {
      setSelectedAbstractIndex(0);
    }
  }, [activeLayer.abstracts?.length, selectedAbstractIndex]);

  const getOpentypeFont = async (name: string): Promise<opentype.Font | null> => {
    const cleanName = name.replace(/'/g, '').split(',')[0].trim();
    if (fontCache.current[cleanName]) return fontCache.current[cleanName];
    const url = dynamicFonts[cleanName] || FONT_TTF_URLS[cleanName];
    if (!url) return null;
    return new Promise((resolve) => { opentype.load(url, (err, font) => { if (!err && font) { fontCache.current[cleanName] = font; resolve(font); } else resolve(null); }); });
  };

  const getTextExtent = useCallback(async (group: TextGroupConfig) => {
    let textExtent = 0;
    if (group.text) {
        const font = await getOpentypeFont(group.fontFamily);
        if (font) {
            const scale = group.fontSize / font.unitsPerEm;
            const glyphs = font.stringToGlyphs(group.text);
            let furthestX = 0; let currentX = 0;
            glyphs.forEach((glyph, i) => {
              const adjustedCommands = getAdjustedGlyphPathCommands(glyph, group.text, group.charOffsets, i, currentX, group.fontSize);
              const bounds = getPathCommandBounds(adjustedCommands);
              if (bounds) {
                furthestX = Math.max(furthestX, bounds.maxX);
              }
              currentX += (glyph.advanceWidth * scale) + group.letterSpacing;
            });
            textExtent = furthestX + (group.thickness / 2) + (config.bevelEnabled ? config.bevelAmount : 0);
        }
    }
    return textExtent;
  }, [config.bevelEnabled, config.bevelAmount, dynamicFonts]);

  const updateGroupWithLock = useCallback(async (group: 'primary' | 'secondary', updates: Partial<TextGroupConfig>, commitTo3D: boolean = false) => {
    updateGroup(group, updates, commitTo3D);

    // Don't rescale when font family is changing — font hasn't loaded yet
    if (radiusLocks[group]?.locked && !('fontSize' in updates) && !('fontFamily' in updates)) {
      const targetRad = radiusLocks[group]?.target ?? 95;
      const currentGroup = { ...activeLayer[group], ...updates };
      const safeTextX = isNaN(currentGroup.textX) ? 0 : currentGroup.textX;
      const neededWidth = targetRad - safeTextX;
      if (neededWidth >= 1) {
        getTextExtent(currentGroup).then(currentWidth => {
          if (currentWidth > 0.1) {
            const ratio = neededWidth / currentWidth;
            const newFontSize = currentGroup.fontSize * ratio;
            // Include the original updates to prevent reverting text changes
            updateGroup(group, { ...updates, fontSize: newFontSize }, commitTo3D);
          }
        });
      }
    }
  }, [updateGroup, radiusLocks, activeLayer, getTextExtent]);

  useEffect(() => {
      const calcStats = async () => {
      if (!activeLayer) return;
      let maxRad = 0;
      activeLayer.hubs.forEach(h => { if (h.enabled) maxRad = Math.max(maxRad, h.outerRadius + ((h.shape === 'circle' && h.oscillationEnabled) ? h.oscillationAmplitude : 0)); });
      activeLayer.abstracts.forEach(a => { if (a.enabled) maxRad = Math.max(maxRad, a.outerRadius + a.thickness / 2); });
      const pExtent = await getTextExtent(activeLayer.primary);
      const sExtent = await getTextExtent(activeLayer.secondary);

      // Safety checks for extent calculations
      const safePExtent = isNaN(pExtent) || pExtent === null || pExtent === undefined ? 0 : pExtent;
      const safeSExtent = isNaN(sExtent) || sExtent === null || sExtent === undefined ? 0 : sExtent;

      maxRad = Math.max(maxRad, activeLayer.primary.enabled ? activeLayer.primary.textX + safePExtent : 0, (activeLayer.secondaryEnabled && activeLayer.secondary.enabled) ? activeLayer.secondary.textX + safeSExtent : 0);
      const activeGroupExtent = await getTextExtent(activeLayer[activeGroup]);

      // Safety check for active group extent
      const safeActiveGroupExtent = isNaN(activeGroupExtent) || activeGroupExtent === null || activeGroupExtent === undefined ? 0 : activeGroupExtent;
      const safeTextX = isNaN(activeLayer[activeGroup].textX) || activeLayer[activeGroup].textX === null || activeLayer[activeGroup].textX === undefined ? 0 : activeLayer[activeGroup].textX;
      const activeGroupRad = activeLayer[activeGroup].enabled ? safeTextX + safeActiveGroupExtent : 0;

      // Safety check for final values
      const safeMaxRad = isNaN(maxRad) || maxRad === null || maxRad === undefined ? 0 : maxRad;
      const safeActiveGroupRad = isNaN(activeGroupRad) || activeGroupRad === null || activeGroupRad === undefined ? 0 : activeGroupRad;

      setCurrentStats({ radius: safeMaxRad, diameter: safeMaxRad * 2, activeGroupRadius: safeActiveGroupRad, activeGroupDiameter: safeActiveGroupRad * 2 });
    };
    calcStats();
  }, [config.layers, config.activeLayerIndex, getTextExtent, activeGroup, activeLayer]);

  const handleArmRadiusChange = (targetRad: number, commitTo3D: boolean = false) => {
    // Safety check for NaN values
    if (isNaN(targetRad) || targetRad === null || targetRad === undefined) {
      console.warn('handleArmRadiusChange called with invalid targetRad:', targetRad);
      return;
    }

    setRadiusLocks(prev => ({
      ...prev,
      [activeGroup]: {
        ...prev[activeGroup],
        target: targetRad,
      }
    }));

    // Safety check for textX
    const safeTextX = isNaN(groupData.textX) || groupData.textX === null || groupData.textX === undefined ? 0 : groupData.textX;
    const neededWidth = targetRad - safeTextX;

    if (neededWidth < 1) return;
    getTextExtent(groupData).then(currentWidth => {
       if (currentWidth > 0.1) {
          const ratio = neededWidth / currentWidth;
          const newFontSize = groupData.fontSize * ratio;
          updateGroup(activeGroup, { fontSize: newFontSize }, commitTo3D);
       } else {
          updateGroup(activeGroup, { textX: targetRad }, commitTo3D);
       }
    });
  };

  const handleGroupDistChange = (newTextX: number, commit: boolean) => {
     // Safety check for NaN values
     if (isNaN(newTextX) || newTextX === null || newTextX === undefined) {
       console.warn('handleGroupDistChange called with invalid newTextX:', newTextX);
       return;
     }

     if (currentLockState.locked) {
        const targetRadius = currentLockState.target;
        const neededWidth = targetRadius - newTextX;
        if (neededWidth < 1) return;
        getTextExtent(groupData).then(currentWidth => {
           if (currentWidth > 0.1) {
              const ratio = neededWidth / currentWidth;
              const newFontSize = groupData.fontSize * ratio;
              updateGroup(activeGroup, { textX: newTextX, fontSize: newFontSize }, commit);
           } else {
              updateGroup(activeGroup, { textX: newTextX }, commit);
           }
        });
     } else {
        updateGroup(activeGroup, { textX: newTextX }, commit);
     }
  };

  // const handleFontSizeChange = (newFontSize: number, commit: boolean) => {
  //   // Font size changes should NEVER trigger radius locking rescaling
  //   // This ensures the text gets bigger/smaller without affecting outer radius
  //   updateGroup(activeGroup, { fontSize: newFontSize }, commit);
  // };

  const handleLayerUpdate = (idx: number, updates: Partial<LayerConfig>, commitTo3D: boolean = false) => {
    // Only log layer updates in development mode and reduce frequency
    if (process.env.NODE_ENV === 'development' && Math.random() < 0.1) {
      console.log(`🔄 Layer toggle: idx=${idx}, updates=`, updates);
      console.log(`🔄 Before update:`, config.layers.map(l => ({name: l.name, enabled: l.enabled, id: l.id})));
    }

    const newLayers = [...config.layers];
    const wasEnabled = newLayers[idx].enabled;
    const isEnabled = updates.enabled !== undefined ? updates.enabled : wasEnabled;
    newLayers[idx] = { ...newLayers[idx], ...updates };


    // Only log after update in development mode and reduce frequency
    if (process.env.NODE_ENV === 'development' && Math.random() < 0.1) {
      console.log(`🔄 After update:`, newLayers.map(l => ({name: l.name, enabled: l.enabled, id: l.id})));
    }

    onUpdate({ layers: newLayers }, commitTo3D);
  };

  const updateAbstractConfig = (updates: Partial<AbstractConfig>, commitTo3D: boolean = false) => {
    const newAbstracts = activeLayer.abstracts.map((abs, i) =>
        i === selectedAbstractIndex ? { ...abs, ...updates } : abs
    );
    updateAbstracts(newAbstracts, commitTo3D);
  };

  const updateHubConfig = (updates: Partial<HubConfig>, commitTo3D: boolean = false) => {
    const newHubs = activeLayer.hubs.map((hub, i) =>
        i === selectedHubIndex ? { ...hub, ...updates } : hub
    );
    updateHubs(newHubs, commitTo3D);
  };

  const deleteHubAtIndex = (index: number) => {
    const newHubs = activeLayer.hubs.filter((_, i) => i !== index);
    updateHubs(newHubs, true);
    setSelectedHubIndex(prev => {
      if (newHubs.length === 0) return 0;
      if (prev > index) return prev - 1;
      return Math.min(prev, newHubs.length - 1);
    });
  };

  const deleteAbstractAtIndex = (index: number) => {
    const newAbstracts = activeLayer.abstracts.filter((_, i) => i !== index);
    updateAbstracts(newAbstracts, true);
    setSelectedAbstractIndex(prev => {
      if (newAbstracts.length === 0) return 0;
      if (prev > index) return prev - 1;
      return Math.min(prev, newAbstracts.length - 1);
    });
  };

  const renderSlider = (
    label: string,
    value: number | undefined,
    min: number,
    max: number,
    step: number,
    onChange: (v: number, committed: boolean) => void,
    suffix: string = "",
    disabled = false,
    defaultValue?: number,
    extraLabel?: React.ReactNode,
    onSaveDefault?: () => void
  ) => {
    const safeValue = typeof value === 'number' && !isNaN(value) ? value : (defaultValue ?? min);
    const showRevert = defaultValue !== undefined && Math.abs(safeValue - defaultValue) > 0.01;

    return (
      <div className={`space-y-2 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
           style={{
             display: 'flex',
             flexDirection: 'column',
             gap: '8px',
             opacity: disabled ? 0.5 : 1,
             pointerEvents: disabled ? 'none' : 'auto'
           }}>
        <div className="flex justify-between items-center" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="flex items-center" style={{ display: 'flex', alignItems: 'center' }}>
            <InfoTooltip label={label} description={getDescription(label, t)} />
            {extraLabel}
            {showRevert && (
              <button
                onClick={() => onChange(defaultValue!, true)}
                className="w-4 h-4 rounded hover:bg-rose-500 hover:text-white text-slate-500 transition-colors flex items-center justify-center ml-2"
                title="Reset to Default"
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '4px',
                  backgroundColor: 'transparent',
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginLeft: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ width: '12px', height: '12px' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
              </button>
            )}
          </div>
          <div className="flex items-center">
            {(onSaveDefault || onSaveAsDefault) && (
              <button
                onClick={onSaveDefault || onSaveAsDefault}
                className="w-4 h-4 rounded hover:bg-emerald-500 hover:text-white text-slate-500 transition-colors flex items-center justify-center mr-1"
                title="Save as Default"
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '4px',
                  backgroundColor: 'transparent',
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: '4px',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ width: '12px', height: '12px' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3h11l3 3v15H5V3z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 3v6h8V3" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 21v-6h8v6" />
                </svg>
              </button>
            )}
            <DeferredNumberInput value={safeValue} min={min} max={max} step={step} onChange={onChange} disabled={disabled} suffix={suffix} />
          </div>
        </div>
        <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={safeValue}
            onChange={(e) => onChange(Math.max(min, Math.min(max, parseFloat(e.target.value))), false)}
            onMouseUp={(e) => onChange(Math.max(min, Math.min(max, parseFloat((e.target as HTMLInputElement).value))), true)}
            className="w-full h-1 bg-slate-800 rounded-lg accent-sky-500 cursor-pointer"
            style={{
              width: '100%',
              height: '4px',
              backgroundColor: '#1e293b',
              borderRadius: '4px',
              cursor: 'pointer',
              WebkitAppearance: 'none',
              appearance: 'none',
              outline: 'none'
            }}
        />
      </div>
    );
  };

  const filteredFonts = [
    ...CURSIVE_FONTS,
    ...Object.keys(dynamicFonts)
      .filter(name => !CURSIVE_FONTS.some(f => f.name === name))
      .map(name => ({ name, family: name }))
  ].filter(f => f.name.toLowerCase().includes(fontSearch.toLowerCase()));
  const currentArmRadius = currentStats.activeGroupRadius;
  const TAB_LABELS: Record<string, string> = {
    'global': t('global'),
    'text': t('text'),
    'Letter Ctrl': t('Letter Ctrl'),
    'hubs': t('hubs'),
    'abstract': t('abstract'),
    'planes': t('planes'),
    'images': 'Images'
  };
  const TAB_SHORTCUTS: Partial<Record<string, keyof ShortcutConfig>> = {
    'global': 'switchToGlobalTab',
    'text': 'switchToTextTab',
    'Letter Ctrl': 'switchToLetterCtrlTab',
    'hubs': 'switchToHubsTab',
    'abstract': 'switchToAbstractTab',
    'planes': 'switchToPlanesTab'
  };
  const btnBase = "h-8 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border border-white/5 flex items-center justify-center";
  const btnActive = `${btnBase} bg-sky-500 text-white border-sky-400/50 shadow-md`;
  const btnInactive = `${btnBase} bg-slate-900/50 text-slate-500 hover:text-slate-300`;
  const settingsHeaderClass = "flex items-center gap-2 border-b border-cyan-400/30 pb-1";
  const settingsHeaderDotClass = "w-1.5 h-1.5 rounded-full bg-cyan-400";
  const settingsHeaderLabelClass = "text-[10px] font-black uppercase tracking-widest text-cyan-300";

  const getLayerShortcut = (idx: number) => {
    if (idx === 0) return shortcuts?.exportBasePlaneSTL;
    if (idx === 1) return shortcuts?.exportCrossPlaneSTL;
    if (idx === 2) return shortcuts?.exportTiltPlaneSTL;
    return undefined;
  };

  return (
    <TooltipContext.Provider value={showTooltips}>
      <div className="flex flex-col h-full" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Tab Headers */}
        <div className="p-2 bg-slate-900/50 border-b border-white/5 shrink-0" style={{ padding: '8px', backgroundColor: 'rgba(15,23,42,0.5)', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
            <div className="grid grid-cols-7 gap-1" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
              {(['global', 'text', 'Letter Ctrl', 'hubs', 'abstract', 'planes', 'images'] as const).map(tab => {
                 const isActive = activeTab === tab;
                 const btnActive = 'bg-sky-600 text-white border-sky-500';
                 const btnInactive = 'bg-slate-800 text-slate-400 border-white/10 hover:bg-slate-700 hover:text-white';
                 return (
                 <InfoTooltip key={tab} label={TAB_LABELS[tab]} shortcut={TAB_SHORTCUTS[tab] ? shortcuts?.[TAB_SHORTCUTS[tab] as keyof ShortcutConfig] : undefined} placement="bottom" className="h-full">
                     <button
                       onClick={() => onTabChange(tab)}
                       className={`${isActive ? btnActive : btnInactive} w-full`}
                       style={{
                         width: '100%',
                         padding: '6px 4px',
                         fontSize: '10px',
                         fontWeight: 'bold',
                         textTransform: 'uppercase',
                         borderRadius: '4px',
                         border: '1px solid',
                         backgroundColor: isActive ? '#0284c7' : '#1e293b',
                         color: isActive ? 'white' : '#94a3b8',
                         borderColor: isActive ? '#0ea5e9' : 'rgba(255,255,255,0.1)',
                         cursor: 'pointer',
                         transition: 'all 0.2s'
                       }}
                     >
                       {TAB_LABELS[tab]}
                     </button>
                 </InfoTooltip>
              )})}
           </div>
        </div>

        {/* Tab Content */}
        <div ref={tabContentRef} className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4" style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {activeTab === 'global' && (
             <div className="space-y-4 animate-in fade-in duration-200" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
               <div className="p-3 bg-slate-800/30 rounded-xl border border-white/5 space-y-4" style={{ padding: '12px', backgroundColor: 'rgba(30,41,59,0.3)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div className="space-y-1.5" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div className="flex justify-between items-center" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div className="flex items-center gap-4" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                              <div className="flex items-center" style={{ display: 'flex', alignItems: 'center' }}>
                                  <InfoTooltip label={t('Model Color')} description={getDescription('Model Color', t)} />
                                  {config.color !== '#38bdf8' && (
                                      <button
                                        onClick={() => onUpdate({ color: '#38bdf8' })}
                                        className="w-4 h-4 rounded hover:bg-rose-500 hover:text-white text-slate-500 transition-colors flex items-center justify-center mr-1"
                                        title={t('reset')}
                                        style={{
                                          width: '16px',
                                          height: '16px',
                                          borderRadius: '4px',
                                          backgroundColor: 'transparent',
                                          color: '#64748b',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          marginRight: '4px',
                                          cursor: 'pointer',
                                          transition: 'all 0.2s'
                                        }}
                                      >
                                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ width: '12px', height: '12px' }}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                                      </button>
                                  )}
                                      {onSaveAsDefault && (
                                        <button
                                        onClick={onSaveAsDefault}
                                        className="w-4 h-4 rounded hover:bg-emerald-500 hover:text-white text-slate-500 transition-colors flex items-center justify-center mr-1"
                                        title={t('saveDefault') || 'Save as Default'}
                                        >
                                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3h11l3 3v15H5V3z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 3v6h8V3" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 21v-6h8v6" /></svg>
                                        </button>
                                      )}
                              </div>
                          </div>
                      </div>
                      <input
                        type="color"
                        value={config.color}
                        onChange={(e) => onUpdate({ color: e.target.value })}
                        className="w-full h-8 bg-slate-900 border border-white/10 rounded-lg cursor-pointer p-0.5"
                        style={{
                          width: '100%',
                          height: '32px',
                          backgroundColor: '#0f172a',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          padding: '2px'
                        }}
                      />
                  </div>

                  {renderSlider(t('Extrusion Depth'), config.extrusionDepth, 1, 20, 0.1, (v, c) => onUpdate({ extrusionDepth: v }, c), "mm", false, 3)}
                  {renderSlider(t('Global Boldness'), config.globalStrokeWeight, 0, 10, 0.1, (v, c) => onUpdate({ globalStrokeWeight: v }, c), "mm", false, 0)}
                  <ControlRow label={t('Preview Resolution')} onReset={() => onUpdate({ quality: 'low' }, true)} onSaveDefault={onSaveAsDefault} isModified={config.quality !== 'low'} t={t}>
                     <div className="grid grid-cols-3 gap-1 bg-slate-900 p-1 rounded-lg" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', backgroundColor: '#0f172a', padding: '4px', borderRadius: '8px' }}>
                        {(['low', 'med', 'high'] as const).map(q => {
                          const isActive = config.quality === q;
                          return (
                            <button
                              key={q}
                              onClick={() => onUpdate({ quality: q }, true)}
                              className={`py-1 text-[9px] font-black uppercase rounded transition-all ${isActive ? 'bg-sky-500 text-white' : 'text-slate-500'}`}
                              style={{
                                padding: '4px',
                                fontSize: '9px',
                                fontWeight: '900',
                                textTransform: 'uppercase',
                                borderRadius: '4px',
                                transition: 'all 0.2s',
                                backgroundColor: isActive ? '#0ea5e9' : 'transparent',
                                color: isActive ? 'white' : '#64748b',
                                cursor: 'pointer',
                                border: 'none'
                              }}
                            >
                              {t(q)}
                            </button>
                          );
                        })}
                     </div>
                  </ControlRow>
                  <div className="space-y-4 pt-4 border-t border-white/5">
                    <div className={settingsHeaderClass}>
                      <div className={settingsHeaderDotClass}></div>
                      <span className={settingsHeaderLabelClass}>{t('Edge Profile')}</span>
                        <div className="ml-auto flex items-center">
                          {onSaveAsDefault && <button onClick={onSaveAsDefault} className="w-4 h-4 rounded hover:bg-emerald-500 hover:text-white text-slate-500 transition-colors flex items-center justify-center mr-1" title={t('saveDefault') || 'Save as Default'}><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3h11l3 3v15H5V3z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 3v6h8V3" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 21v-6h8v6" /></svg></button>}
                          <Toggle
                            label={config.bevelEnabled ? t('ON') : t('OFF')}
                            checked={config.bevelEnabled}
                            onChange={(c) => onUpdate({ bevelEnabled: c }, true)}
                          />
                        </div>
                    </div>
                     <div className="flex items-center justify-end">
                       {!config.bevelEnabled && <button onClick={() => onUpdate({ bevelEnabled: true }, true)} className="w-4 h-4 rounded hover:bg-rose-500 hover:text-white text-slate-500 transition-colors flex items-center justify-center mr-1" title={t('reset')}><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg></button>}
                     </div>
                     {config.bevelEnabled && (
                        <div className="space-y-3">
                          <div className="flex bg-slate-900 p-1 rounded-lg gap-1">
                               <InfoTooltip label={t('Fillet')} description={getDescription('Fillet', t)} className="flex-1"><button onClick={() => onUpdate({ bevelType: 'fillet' }, true)} className={`w-full px-3 py-1 text-[9px] font-black uppercase rounded ${config.bevelType === 'fillet' ? 'bg-sky-500 text-white' : 'text-slate-500'}`}>{t('Fillet')}</button></InfoTooltip>
                               <InfoTooltip label={t('Chamfer')} description={getDescription('Chamfer', t)} className="flex-1"><button onClick={() => onUpdate({ bevelType: 'chamfer' }, true)} className={`w-full px-3 py-1 text-[9px] font-black uppercase rounded ${config.bevelType === 'chamfer' ? 'bg-sky-500 text-white' : 'text-slate-500'}`}>{t('Chamfer')}</button></InfoTooltip>
                          </div>
                          {renderSlider(t('Bevel Amount'), config.bevelAmount, 0, 5, 0.05, (v, c) => onUpdate({ bevelAmount: v }, c), "mm", false, 0.4)}
                          {config.bevelType === 'fillet' && renderSlider(t('Fillet Detail'), config.bevelSegments, 2, 12, 1, (v, c) => onUpdate({ bevelSegments: v }, c), "", false, 2)}
                        </div>
                     )}
                  </div>
               </div>
             </div>
          )}

          {(activeTab === 'text' || activeTab === 'Letter Ctrl') && (
             <div className="grid grid-cols-2 gap-2 mb-2">
                <InfoTooltip label={t('Primary Group')} description={getDescription('Primary Group', t)} className="w-full">
                <div
                  onClick={() => setActiveGroup('primary')}
                  className={`p-2 rounded-xl border transition-all cursor-pointer w-full ${activeGroup === 'primary' ? 'bg-slate-800/80 border-sky-500/50 shadow-lg shadow-sky-500/10' : 'bg-slate-900/50 border-white/5 hover:bg-slate-800/50'}`}
                >
                   <div className="flex flex-col gap-2">
                      <div className="flex justify-between items-center">
                          <span className={`text-[9px] font-black uppercase tracking-widest ${activeGroup === 'primary' ? 'text-sky-400' : 'text-slate-500'}`}>{t('Primary')}</span>
                          <div onClick={(e) => e.stopPropagation()}>
                             <Toggle label={activeLayer.primary.enabled ? t('ON') : t('OFF')} checked={activeLayer.primary.enabled} onChange={(c) => updateGroup('primary', { enabled: c }, true)} activeColor={activeGroup === 'primary' ? 'text-sky-400' : 'text-slate-400'} />
                          </div>
                      </div>
                   </div>
                </div>
                </InfoTooltip>
                <InfoTooltip label={t('Secondary Group')} description={getDescription('Secondary Group', t)} className="w-full">
                <div
                  onClick={() => setActiveGroup('secondary')}
                  className={`p-2 rounded-xl border transition-all cursor-pointer w-full ${activeGroup === 'secondary' ? 'bg-slate-800/80 border-sky-500/50 shadow-lg shadow-sky-500/10' : 'bg-slate-900/50 border-white/5 hover:bg-slate-800/50'}`}
                >
                   <div className="flex flex-col gap-2">
                      <div className="flex justify-between items-center">
                          <span className={`text-[9px] font-black uppercase tracking-widest ${activeGroup === 'secondary' ? 'text-sky-400' : 'text-slate-500'}`}>{t('Secondary')}</span>
                          <div onClick={(e) => e.stopPropagation()}>
                             <Toggle label={activeLayer.secondary.enabled ? t('ON') : t('OFF')} checked={activeLayer.secondary.enabled} onChange={(c) => updateGroup('secondary', { enabled: c }, true)} activeColor={activeGroup === 'secondary' ? 'text-sky-400' : 'text-slate-400'} />
                          </div>
                      </div>
                   </div>
                </div>
                </InfoTooltip>
             </div>
          )}

          {activeTab === 'text' && (
            <div className="space-y-3 animate-in fade-in duration-200">
              <DeferredTextInput
                label={t('Phrase Content')}
                value={groupData.text}
                onChange={(v, c) => updateGroupWithLock(activeGroup, { text: v }, c)}
                placeholder={t('Leave blank for AI Randomizer to choose a word')}
                t={t}
                defaultValue={activeGroup === 'primary' ? 'Snow' : ''}
                onSaveDefault={onSaveAsDefault}
              />

              <div className="space-y-1">
                <div className="flex gap-2 h-9">
                  <InfoTooltip label={t('Font Search')} description={getDescription('Font Search', t)} className="flex-1 h-full"><input type="text" placeholder={t('Search Fonts...')} value={fontSearch} onChange={(e) => setFontSearch(e.target.value)} className="w-full h-full bg-slate-900 border border-white/10 rounded-lg px-3 text-xs font-bold text-white placeholder-slate-600 focus:border-sky-500 outline-none" /></InfoTooltip>
                  <InfoTooltip label={t('System Fonts')} description={getDescription('System Fonts', t)} className="h-full">
                    <SystemFontButton
                        onFontLoaded={(name, buffer) => { const blob = new Blob([buffer], { type: 'font/ttf' }); const file = new File([blob], name + ".ttf", { type: "font/ttf" }); onFontUpload(file); }}
                        className="h-full px-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:opacity-50 text-white text-[10px] font-black uppercase rounded-lg transition-all border border-white/10 flex items-center justify-center whitespace-nowrap"
                        compact={true}
                        t={t}
                    />
                  </InfoTooltip>
                  <InfoTooltip label={t('Upload Font')} description={getDescription('Upload Font', t)} className="h-full">
                    <label className="flex items-center justify-center px-3 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg cursor-pointer transition-all border border-white/5 h-full">
                      <input type="file" className="hidden" accept=".ttf,.otf,.woff" onChange={(e) => e.target.files?.[0] && onFontUpload(e.target.files[0])} />
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                    </label>
                  </InfoTooltip>
                </div>
                <div className="grid grid-cols-2 gap-1 max-h-32 overflow-y-auto custom-scrollbar bg-slate-900 p-1 rounded-lg border border-white/5">
                  {filteredFonts.map(font => (<button key={font.name} onClick={() => updateGroupWithLock(activeGroup, { fontFamily: font.family }, false)} className={`text-left px-2 py-1.5 rounded text-lg truncate transition-all ${groupData.fontFamily === font.family ? 'bg-sky-600 text-white' : 'text-slate-400 hover:bg-white/5'}`} style={{ fontFamily: font.family }}>{font.name}</button>))}
                </div>
              </div>

              {/* {renderSlider(t('Font Size'), groupData.fontSize, 10, 200, 1, (v, c) => updateGroupWithLock(activeGroup, { fontSize: v }, c), "px", false, 34)} */}

              <div className="space-y-4 pt-4 border-t border-white/5">
                 {renderSlider(t('Arms / Symmetry'), groupData.arms, 2, 24, 1, (v, c) => updateGroup(activeGroup, { arms: v }, c), "", false, 6)}
                 <div className="space-y-2">
                    <div className="flex justify-between items-center">
                       <div className="flex items-center">
                          <InfoTooltip label={t('Outer Radius')} description={getDescription('Outer Radius', t)} />
                          {currentArmRadius !== 95 && (
                            <button
                              onClick={() => handleArmRadiusChange(95, true)}
                              className="w-4 h-4 rounded hover:bg-rose-500 hover:text-white text-slate-500 transition-colors flex items-center justify-center mr-1"
                              title={t('reset')}
                            >
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                              </svg>
                            </button>
                          )}
                       </div>
                       <div className="flex items-center gap-2">
                          {onSaveAsDefault && (
                            <button onClick={onSaveAsDefault} className="w-4 h-4 rounded hover:bg-emerald-500 hover:text-white text-slate-500 transition-colors flex items-center justify-center mr-1" title={t('saveDefault') || 'Save as Default'}>
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3h11l3 3v15H5V3z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 3v6h8V3" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 21v-6h8v6" /></svg>
                            </button>
                          )}
                          <span className="text-[10px] font-black text-slate-500">(D: <span className="text-white">{currentStats.activeGroupDiameter.toFixed(1)}mm</span>)</span>
                          <InfoTooltip label={t('Outer Radius Lock')} description={t('Lock toggled: when on, keep current outer radius constant while editing other parameters; when off, changes freely update size.')}
                                       className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setRadiusLocks(prev => {
                                  const currentLocked = prev[activeGroup]?.locked || false;
                                  const currentTarget = prev[activeGroup]?.target || currentStats.activeGroupRadius;
                                  return {
                                    ...prev,
                                    [activeGroup]: {
                                      ...prev[activeGroup],
                                      locked: !currentLocked,
                                      target: currentTarget,
                                    },
                                  };
                                });
                              }}
                              className={`w-8 h-8 rounded-lg border border-white/20 flex items-center justify-center transition-all ${radiusLocks[activeGroup]?.locked ? 'bg-sky-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                              title={radiusLocks[activeGroup]?.locked ? t('Unlock outer radius') : t('Lock outer radius')}
                            >
                              {radiusLocks[activeGroup]?.locked ? '🔒' : '🔓'}
                            </button>
                          </InfoTooltip>
                          <DeferredNumberInput value={currentArmRadius} min={10} max={500} step={0.1} onChange={(v, c) => handleArmRadiusChange(v, c)} suffix="mm" />
                       </div>
                    </div>
                    <input
                       type="range"
                       min={10}
                       max={500}
                       step={0.1}
                       value={currentArmRadius}
                       onChange={(e) => handleArmRadiusChange(parseFloat(e.target.value), false)}
                       onMouseUp={(e) => handleArmRadiusChange(parseFloat((e.target as HTMLInputElement).value), true)}
                       className="w-full h-1 bg-slate-800 rounded-lg accent-sky-500 cursor-pointer"
                    />
                 </div>
                 {renderSlider(t('Inner Radius'), groupData.textX, -100, 300, 0.1, (v, c) => handleGroupDistChange(v, c), "mm", false, activeGroup === 'primary' ? 20 : 10)}
                 {renderSlider(t('Boldness'), groupData.thickness, 0, 10, 0.1, (v, c) => updateGroup(activeGroup, { thickness: v }, c), "mm", false, 0)}
                 {renderSlider(t('Letter Spacing'), groupData.letterSpacing, -5, 20, 0.1, (v, c) => updateGroup(activeGroup, { letterSpacing: v }, c), "mm", false, 0)}
                 {renderSlider(t('Manual Rotation'), groupData.rotationOffset, -180, 180, 1, (v, c) => updateGroup(activeGroup, { rotationOffset: v }, c), "°", false, activeGroup === 'primary' ? 0 : 30)}
              </div>

              <div className="space-y-4 pt-4 border-t border-white/5">
                <div className={settingsHeaderClass}>
                  <div className={settingsHeaderDotClass}></div>
                  <span className={settingsHeaderLabelClass}>{t('Mirror Effect')}</span>
                  <div className="ml-auto flex items-center">
                    {onSaveAsDefault && <button onClick={onSaveAsDefault} className="w-4 h-4 rounded hover:bg-emerald-500 hover:text-white text-slate-500 transition-colors flex items-center justify-center mr-1" title={t('saveDefault') || 'Save as Default'}><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3h11l3 3v15H5V3z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 3v6h8V3" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 21v-6h8v6" /></svg></button>}
                    <Toggle
                      label={groupData.mirrorEnabled ? t('ON') : t('OFF')}
                      checked={groupData.mirrorEnabled}
                      onChange={(c) => updateGroup(activeGroup, { mirrorEnabled: c }, true)}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-end">
                  {!groupData.mirrorEnabled && <button onClick={() => updateGroup(activeGroup, { mirrorEnabled: true }, true)} className="w-4 h-4 rounded hover:bg-rose-500 hover:text-white text-slate-500 transition-colors flex items-center justify-center mr-1" title={t('reset')}><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg></button>}
                </div>
                {groupData.mirrorEnabled && renderSlider(t('Mirror Offset'), groupData.mirrorOffset, -200, 200, 0.1, (v, c) => updateGroup(activeGroup, { mirrorOffset: v }, c), "mm", false, 0)}
              </div>

              {groupData.underline && (
                    <div className="space-y-4 pt-4 border-t border-white/5">
                      <div className={settingsHeaderClass}>
                      <div className={settingsHeaderDotClass}></div>
                      <span className={settingsHeaderLabelClass}>{t('Underline')}</span>
                          <div className="ml-auto flex items-center">
                            {onSaveAsDefault && <button onClick={onSaveAsDefault} className="w-4 h-4 rounded hover:bg-emerald-500 hover:text-white text-slate-500 transition-colors flex items-center justify-center mr-1" title={t('saveDefault') || 'Save as Default'}><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3h11l3 3v15H5V3z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 3v6h8V3" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 21v-6h8v6" /></svg></button>}
                            <Toggle
                              label={groupData.underline.enabled ? t('ON') : t('OFF')}
                              checked={groupData.underline.enabled}
                              onChange={(c) => updateGroup(activeGroup, { underline: { ...groupData.underline, enabled: c } }, true)}
                            />
                          </div>
                      </div>
                        <div className="flex items-center justify-end">
                              {groupData.underline.enabled && <button onClick={() => updateGroup(activeGroup, { underline: { ...groupData.underline, enabled: false } }, true)} className="w-4 h-4 rounded hover:bg-rose-500 hover:text-white text-slate-500 transition-colors flex items-center justify-center mr-1" title={t('reset')}><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg></button>}
                      </div>
                      {groupData.underline.enabled && (
                          <div className="space-y-4 animate-in slide-in-from-top-2 duration-200">
                             <ControlRow label={t('Cap Style')} onReset={() => updateGroup(activeGroup, { underline: { ...groupData.underline, capType: 'none' } }, true)} onSaveDefault={onSaveAsDefault} isModified={groupData.underline.capType !== 'none'} t={t}>
                                 <div className="grid grid-cols-4 gap-1 bg-slate-900 p-1 rounded-lg">
                                     {(['none', 'square', 'round', 'chevron'] as const).map(cap => (
                                         <button
                                            key={cap}
                                            onClick={() => updateGroup(activeGroup, { underline: { ...groupData.underline, capType: cap } }, true)}
                                            className={`py-1 text-[9px] font-black uppercase rounded transition-all ${groupData.underline.capType === cap ? 'bg-sky-600 text-white' : 'text-slate-500'}`}
                                         >
                                            {cap === 'none' ? t('None') : (cap === 'square' ? t('Square') : (cap === 'round' ? t('Round') : t('Chevron')))}
                                         </button>
                                     ))}
                                 </div>
                             </ControlRow>
                             {groupData.underline.capType !== 'none' && renderSlider(t('Cap Length'), groupData.underline.capWidth, 2, 30, 0.1, (v, c) => updateGroup(activeGroup, { underline: { ...groupData.underline, capWidth: v } }, c), "mm", false, 10)}
                             {renderSlider(t('Underline Thickness'), groupData.underline.thickness, 0.1, 5, 0.1, (v, c) => updateGroup(activeGroup, { underline: { ...groupData.underline, thickness: v } }, c), "mm", false, 1.5)}
                             {renderSlider(t('Underline Start'), groupData.underline.startXOffset, -50, 200, 0.1, (v, c) => updateGroup(activeGroup, { underline: { ...groupData.underline, startXOffset: v } }, c), "mm", false, 0)}
                             {renderSlider(t('Underline Length'), groupData.underline.length, 10, 200, 0.1, (v, c) => updateGroup(activeGroup, { underline: { ...groupData.underline, length: v } }, c), "mm", false, 50)}
                             {renderSlider(t('Underline Mirror Offset'), groupData.underline.yOffset, -200, 200, 0.1, (v, c) => updateGroup(activeGroup, { underline: { ...groupData.underline, yOffset: v } }, c), "mm", false, -5)}
                          </div>
                      )}
                  </div>
              )}
            </div>
          )}

          {activeTab === 'Letter Ctrl' && (
             <div className="space-y-4 animate-in fade-in duration-200">
                {/* {renderSlider(t('Font Size'), groupData.fontSize, 10, 200, 1, (v, c) => updateGroupWithLock(activeGroup, { fontSize: v }, c), "px", false, 34)} */}
                <div className="flex space-x-2 overflow-x-auto custom-scrollbar pb-2 h-11"
                     style={{
                       display: 'flex',
                       gap: '8px',
                       overflowX: 'auto',
                       paddingBottom: '8px',
                       height: '44px'
                     }}>
                    {charControlEntries.map((entry, i) => (
                      <button
                        key={`${entry.storageIndex}-${entry.label}`}
                        onClick={() => setSelectedCharIndex(i)}
                        className={`min-w-[40px] h-9 rounded-lg text-lg font-bold border transition-all ${selectedCharIndex === i ? 'bg-sky-600 border-sky-500 text-white shadow-lg' : 'bg-slate-800 border-white/5 text-slate-400'}`}
                        style={{
                          minWidth: '40px',
                          height: '36px',
                          borderRadius: '8px',
                          fontSize: '18px',
                          fontWeight: 'bold',
                          border: '1px solid',
                          transition: 'all 0.2s',
                          backgroundColor: selectedCharIndex === i ? '#0284c7' : '#1e293b',
                          borderColor: selectedCharIndex === i ? '#0ea5e9' : 'rgba(255,255,255,0.05)',
                          color: selectedCharIndex === i ? 'white' : '#94a3b8',
                          cursor: 'pointer',
                          boxShadow: selectedCharIndex === i ? '0 10px 15px -3px rgba(0,0,0,0.1)' : 'none'
                        }}
                      >
                        {entry.label}
                      </button>
                    ))}
                </div>
                <div className="bg-slate-800/30 p-3 rounded-xl border border-white/5 space-y-4"
                     style={{
                       backgroundColor: 'rgba(30,41,59,0.3)',
                       padding: '12px',
                       borderRadius: '12px',
                       border: '1px solid rgba(255,255,255,0.05)',
                       display: 'flex',
                       flexDirection: 'column',
                       gap: '16px'
                     }}>
                  <p className="text-[9px] font-black uppercase text-slate-500 border-b border-white/5 pb-2 mb-2"
                     style={{
                       fontSize: '9px',
                       fontWeight: '900',
                       textTransform: 'uppercase',
                       color: '#64748b',
                       borderBottom: '1px solid rgba(255,255,255,0.05)',
                       paddingBottom: '8px',
                       marginBottom: '8px'
                     }}>
                    {t('Selected Character')}: <span className="text-white text-base ml-2" style={{ color: 'white', fontSize: '16px', marginLeft: '8px' }}>"{selectedCharEntry?.label ?? ''}"</span>
                  </p>
                  {renderSlider(t('Offset X'), groupData.charOffsets[selectedCharEntry?.storageIndex ?? 0]?.x || 0, -50, 50, 0.1, (v, c) => updateCharOffset(activeGroup, selectedCharEntry?.storageIndex ?? 0, { x: v }, c), "mm", false, 0)}
                  {renderSlider(t('Offset Y'), groupData.charOffsets[selectedCharEntry?.storageIndex ?? 0]?.y || 0, -50, 50, 0.1, (v, c) => updateCharOffset(activeGroup, selectedCharEntry?.storageIndex ?? 0, { y: v }, c), "mm", false, 0)}
                </div>
             </div>
          )}

          {activeTab === 'hubs' && (
             <div className="space-y-4 animate-in fade-in duration-200" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="grid grid-cols-4 gap-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                   {activeLayer.hubs.map((hub, i) => {
                     const isSelected = selectedHubIndex === i;
                     return (
                       <div key={hub.id} className="relative group">
                         <button
                           onClick={() => setSelectedHubIndex(i)}
                           className={`h-8 w-full rounded-lg text-xs font-bold uppercase border transition-all ${isSelected ? 'bg-sky-600 border-sky-500 text-white' : 'bg-slate-800 border-white/5 text-slate-400'}`}
                           style={{
                             height: '32px',
                             width: '100%',
                             borderRadius: '8px',
                             fontSize: '12px',
                             fontWeight: 'bold',
                             textTransform: 'uppercase',
                             border: '1px solid',
                             transition: 'all 0.2s',
                             backgroundColor: isSelected ? '#0284c7' : '#1e293b',
                             borderColor: isSelected ? '#0ea5e9' : 'rgba(255,255,255,0.05)',
                             color: isSelected ? 'white' : '#94a3b8',
                             cursor: 'pointer',
                             paddingRight: '22px'
                           }}
                         >
                           {t('Hub')} {i + 1}
                         </button>
                         <div
                           className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 pointer-events-none group-hover:pointer-events-auto focus-within:pointer-events-auto transition-opacity"
                           style={{
                             position: 'absolute',
                             right: '0px',
                             top: '0px',
                             transform: 'translate(-12%, 12%)'
                           }}
                         >
                           <InfoTooltip label={t('Delete Hub')}>
                             <button
                               type="button"
                               onClick={(e) => {
                                 e.stopPropagation();
                                 deleteHubAtIndex(i);
                               }}
                               className="h-5 w-5 rounded text-rose-300 hover:text-rose-200 hover:bg-rose-500/20"
                               style={{
                                 height: '20px',
                                 width: '20px',
                                 borderRadius: '6px'
                               }}
                               aria-label={`${t('Delete Hub')} ${i + 1}`}
                             >
                               X
                             </button>
                           </InfoTooltip>
                         </div>
                       </div>
                     );
                   })}
                   <InfoTooltip label={t('Add Hub')} description={getDescription('Add Hub', t)}>
                     <button
                       onClick={() => {
                         const newHub: HubConfig = {
                           id: `hub-${Date.now()}`,
                           enabled: true,
                           shape: 'circle',
                           sides: 6,
                           outerRadius: 20,
                           hollow: true,
                           wallThickness: 0.5,
                           starRatio: 0.5,
                           rotationOffset: 0,
                           oscillationEnabled: false,
                           oscillationAmplitude: 5,
                           oscillationFrequency: 6
                         };
                         updateHubs([...activeLayer.hubs, newHub], false);
                         setSelectedHubIndex(activeLayer.hubs.length);
                       }}
                       className="w-full h-8 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold uppercase transition-all hover:bg-emerald-500 hover:text-white"
                       style={{
                         width: '100%',
                         height: '32px',
                         borderRadius: '8px',
                         backgroundColor: 'rgba(16,185,129,0.1)',
                         color: '#34d399',
                         border: '1px solid rgba(16,185,129,0.2)',
                         fontSize: '12px',
                         fontWeight: 'bold',
                         textTransform: 'uppercase',
                         transition: 'all 0.2s',
                         cursor: 'pointer'
                       }}
                     >
                       {t('+ Hub')}
                     </button>
                   </InfoTooltip>
                </div>
                {activeLayer.hubs.length > 0 && activeLayer.hubs[selectedHubIndex] && (
                   <div className="space-y-5" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                     <div className="flex justify-between items-center border-b border-white/5 pb-2"
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                            paddingBottom: '8px'
                          }}>
                          <div className={settingsHeaderClass}>
                            <div className={settingsHeaderDotClass}></div>
                            <span className={settingsHeaderLabelClass}>{t('Hub Properties')}</span>
                          </div>
                          <div className="flex items-center gap-3" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                               <ControlRow label={t('Visible')} onReset={() => updateHubConfig({ enabled: true }, true)} onSaveDefault={onSaveAsDefault} isModified={!activeLayer.hubs[selectedHubIndex].enabled} t={t}>
                                   <div className="flex justify-end">
                                      <Toggle label="" checked={activeLayer.hubs[selectedHubIndex].enabled} onChange={(c) => updateHubConfig({ enabled: c }, true)} />
                                   </div>
                               </ControlRow>
                               <div className="w-px h-4 bg-white/10"></div>
                               <ControlRow label={t('Hollow')} onReset={() => updateHubConfig({ hollow: true }, true)} onSaveDefault={onSaveAsDefault} isModified={!activeLayer.hubs[selectedHubIndex].hollow} t={t}>
                                   <div className="flex justify-end">
                                      <Toggle label="" checked={activeLayer.hubs[selectedHubIndex].hollow} onChange={(c) => updateHubConfig({ hollow: c }, true)} />
                                   </div>
                               </ControlRow>
                          </div>
                     </div>
                     <ControlRow label={t('Hub Shape')} onReset={() => updateHubConfig({ shape: 'circle' }, true)} onSaveDefault={onSaveAsDefault} isModified={activeLayer.hubs[selectedHubIndex].shape !== 'circle'} t={t}>
                         <div className="grid grid-cols-3 gap-1 bg-slate-900 p-1 rounded-lg">{(['circle', 'polygon', 'star'] as const).map(s => (<InfoTooltip key={s} label={t(s)} description={getDescription(s, t)} className="flex-1"><button onClick={() => updateHubConfig({ shape: s }, true)} className={`w-full py-1 text-[9px] font-black uppercase rounded transition-all ${activeLayer.hubs[selectedHubIndex].shape === s ? 'bg-sky-600 text-white' : 'text-slate-500'}`}>{t(s)}</button></InfoTooltip>))}</div>
                     </ControlRow>
                     {renderSlider(
                        t('Hub Radius'),
                        activeLayer.hubs[selectedHubIndex].outerRadius,
                        1,
                        200,
                        0.1,
                        (v, c) => updateHubConfig({ outerRadius: v }, c),
                        "mm",
                        false,
                        20,
                        <span className="text-[10px] font-black text-slate-500 ml-2">(D: <span className="text-white">{(activeLayer.hubs[selectedHubIndex].outerRadius * 2).toFixed(1)}mm</span>)</span>
                     )}
                     {activeLayer.hubs[selectedHubIndex].hollow && renderSlider(t('Boldness'), activeLayer.hubs[selectedHubIndex].wallThickness, 0.5, 20, 0.1, (v, c) => updateHubConfig({ wallThickness: v }, c), "mm", false, 0.5)}
                     {activeLayer.hubs[selectedHubIndex].shape !== 'circle' && renderSlider(t('Hub Sides'), activeLayer.hubs[selectedHubIndex].sides, 3, 24, 1, (v, c) => updateHubConfig({ sides: v }, c), "", false, 6)}
                     {activeLayer.hubs[selectedHubIndex].shape === 'star' && renderSlider(t('Star Ratio'), activeLayer.hubs[selectedHubIndex].starRatio, 0.1, 0.9, 0.05, (v, c) => updateHubConfig({ starRatio: v }, c), "", false, 0.5)}

                     {activeLayer.hubs[selectedHubIndex].shape === 'circle' ? (
                       <>
                          {renderSlider(t('Rotation'), activeLayer.hubs[selectedHubIndex].rotationOffset, -180, 180, 1, (v, c) => updateHubConfig({ rotationOffset: v }, c), "°", false, 0)}
                            <div className="space-y-4 pt-4 border-t border-white/5">
                              <div className={settingsHeaderClass}>
                              <div className={settingsHeaderDotClass}></div>
                              <span className={settingsHeaderLabelClass}>{t('Oscillation')}</span>
                                  <div className="ml-auto flex items-center">
                                    {onSaveAsDefault && <button onClick={onSaveAsDefault} className="w-4 h-4 rounded hover:bg-emerald-500 hover:text-white text-slate-500 transition-colors flex items-center justify-center mr-1" title={t('saveDefault') || 'Save as Default'}><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3h11l3 3v15H5V3z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 3v6h8V3" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 21v-6h8v6" /></svg></button>}
                                    <Toggle
                                      label={activeLayer.hubs[selectedHubIndex].oscillationEnabled ? t('ON') : t('OFF')}
                                      checked={activeLayer.hubs[selectedHubIndex].oscillationEnabled}
                                      onChange={(c) => updateHubConfig({ oscillationEnabled: c }, true)}
                                    />
                                  </div>
                              </div>
                                <div className="flex items-center justify-end">
                                      {activeLayer.hubs[selectedHubIndex].oscillationEnabled && <button onClick={() => updateHubConfig({ oscillationEnabled: false }, true)} className="w-4 h-4 rounded hover:bg-rose-500 hover:text-white text-slate-500 transition-colors flex items-center justify-center mr-1" title={t('reset')}><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg></button>}
                              </div>
                              {activeLayer.hubs[selectedHubIndex].oscillationEnabled && (<>{renderSlider(t('Amplitude'), activeLayer.hubs[selectedHubIndex].oscillationAmplitude, 1, 100, 0.1, (v, c) => updateHubConfig({ oscillationAmplitude: v }, c), "mm", false, 5)}{renderSlider(t('Frequency'), activeLayer.hubs[selectedHubIndex].oscillationFrequency, 3, 24, 1, (v, c) => updateHubConfig({ oscillationFrequency: v }, c), "", false, 6)}</>)}
                          </div>
                       </>
                     ) : (
                       renderSlider(t('Rotation'), activeLayer.hubs[selectedHubIndex].rotationOffset, -180, 180, 1, (v, c) => updateHubConfig({ rotationOffset: v }, c), "°", false, 0)
                     )}
                   </div>
                )}
             </div>
          )}

          {activeTab === 'abstract' && (
             <div className="space-y-4 animate-in fade-in duration-200">
               <div className="flex gap-2 mb-2">
                  <InfoTooltip label={t('Add Shape')} description={getDescription('Add Shape', t)} className="flex-1">
                      <button
                          onClick={() => { const newAbs: AbstractConfig = { id: `abs-${Date.now()}`, enabled: true, type: 'sine', arms: 6, rotationOffset: 0, innerRadius: 20, outerRadius: 60, amplitude: 5, frequency: 0.4, thickness: 0.5, mirrorEnabled: true, mirrorOffset: 0 }; updateAbstracts([...activeLayer.abstracts, newAbs], false); setSelectedAbstractIndex(activeLayer.abstracts.length); }}
                          className="w-full h-8 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20 text-xs font-bold uppercase transition-all hover:bg-sky-500 hover:text-white"
                      >
                          {t('+ Shape')}
                      </button>
                  </InfoTooltip>
                  <InfoTooltip label={t('Add Fractal')} description={getDescription('Add Fractal', t)} className="flex-1">
                      <button
                          onClick={() => { const newAbs: AbstractConfig = { id: `fract-${Date.now()}`, enabled: true, type: 'fractal', arms: 6, rotationOffset: 0, innerRadius: 20, outerRadius: 60, amplitude: 5, frequency: 0.4, thickness: 0.5, mirrorEnabled: false, mirrorOffset: 0, trunkLength: 20, branchesPerNode: 2, recursionDepth: 4, minBranchLength: 5, branchPattern: 'symmetric', branchAngle: 45, initialLength: 30, lengthDecay: 0.8, randomSeed: 1234, angleVariation: 0, lengthVariation: 0, thicknessDecay: 0.8 }; updateAbstracts([...activeLayer.abstracts, newAbs], false); setSelectedAbstractIndex(activeLayer.abstracts.length); }}
                          className="w-full h-8 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold uppercase transition-all hover:bg-emerald-500 hover:text-white"
                      >
                          {t('+ Fractal')}
                      </button>
                  </InfoTooltip>
               </div>

               <div className="grid grid-cols-4 gap-2 mb-4">
                 {activeLayer.abstracts.map((abs, i) => {
                    const isFractal = abs.type === 'fractal';
                    const isSelected = selectedAbstractIndex === i;
                    const activeClass = isFractal
                        ? 'bg-emerald-600 border-emerald-500 text-white'
                        : 'bg-sky-600 border-sky-500 text-white';

                    return (
                        <div key={abs.id} className="relative group">
                        <button
                          onClick={() => setSelectedAbstractIndex(i)}
                          className={`h-8 w-full rounded-lg text-xs font-bold uppercase border transition-all ${isSelected ? activeClass : 'bg-slate-800 border-white/5 text-slate-400 hover:bg-slate-700'}`}
                          style={{ paddingRight: '22px' }}
                        >
                          {isFractal ? `${t('Fractal')} ${i + 1}` : `${t('Shape')} ${i + 1}`}
                        </button>
                            <div
                              className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 pointer-events-none group-hover:pointer-events-auto focus-within:pointer-events-auto transition-opacity"
                              style={{
                                position: 'absolute',
                                right: '0px',
                                top: '0px',
                                transform: 'translate(-12%, 12%)'
                              }}
                            >
                              <InfoTooltip label={t('Delete Abstract')}>
                                  <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        deleteAbstractAtIndex(i);
                                      }}
                                      className="h-5 w-5 rounded text-rose-300 hover:text-rose-200 hover:bg-rose-500/20"
                                      style={{
                                        height: '20px',
                                        width: '20px',
                                        borderRadius: '6px'
                                      }}
                                      aria-label={`${t('Delete Abstract')} ${i + 1}`}
                                  >
                                      X
                                  </button>
                              </InfoTooltip>
                            </div>
                      </div>
                    );
                 })}
               </div>

               {activeLayer.abstracts.length > 0 && activeLayer.abstracts[selectedAbstractIndex] && (
                 <div className="space-y-3 animate-in fade-in duration-200">
                    {/* Title row */}
                    <div className={settingsHeaderClass}>
                      <div className={settingsHeaderDotClass}></div>
                      <span className={settingsHeaderLabelClass}>{activeLayer.abstracts[selectedAbstractIndex].type === 'fractal' ? t('Fractal Settings') : t('Shape Settings')}</span>
                    </div>
                    {/* Toggle row */}
                    <div className="flex items-center gap-2 pb-2">
                          <ControlRow label={t('Mirror')} onReset={() => updateAbstractConfig({ mirrorEnabled: true }, true)} onSaveDefault={onSaveAsDefault} isModified={!activeLayer.abstracts[selectedAbstractIndex].mirrorEnabled} t={t}>
                              <div className="flex justify-end">
                                  <Toggle label="" checked={activeLayer.abstracts[selectedAbstractIndex].mirrorEnabled} onChange={(c) => updateAbstractConfig({ mirrorEnabled: c }, true)} />
                              </div>
                          </ControlRow>

                          {activeLayer.abstracts[selectedAbstractIndex].type === 'fractal' && (
                              <>
                                <div className="w-px h-4 bg-white/10 mx-1"></div>
                                <ControlRow label={t('Round Tips')} onReset={() => updateAbstractConfig({ roundedTips: false }, true)} onSaveDefault={onSaveAsDefault} isModified={activeLayer.abstracts[selectedAbstractIndex].roundedTips} t={t}>
                                    <div className="flex justify-end">
                                        <Toggle label="" checked={activeLayer.abstracts[selectedAbstractIndex].roundedTips || false} onChange={(c) => updateAbstractConfig({ roundedTips: c }, true)} />
                                    </div>
                                </ControlRow>
                              </>
                          )}

                          <div className="w-px h-4 bg-white/10 mx-1"></div>
                          <ControlRow label={t('Visible')} onReset={() => updateAbstractConfig({ enabled: true }, true)} onSaveDefault={onSaveAsDefault} isModified={!activeLayer.abstracts[selectedAbstractIndex].enabled} t={t}>
                              <div className="flex justify-end">
                                  <Toggle label="" checked={activeLayer.abstracts[selectedAbstractIndex].enabled} onChange={(c) => updateAbstractConfig({ enabled: c }, true)} />
                              </div>
                          </ControlRow>
                    </div>

                    {activeLayer.abstracts[selectedAbstractIndex].enabled && (
                      <>
                        {activeLayer.abstracts[selectedAbstractIndex].type !== 'fractal' && (
                            <div className="grid grid-cols-3 gap-1 bg-slate-900 p-1 rounded-lg">
                              {(['line', 'sine', 'zigzag'] as const).map(type => (
                                <InfoTooltip key={type} label={t(type)} description={getDescription(type, t)} className="flex-1"><button onClick={() => updateAbstractConfig({ type: type }, true)} className={`w-full py-1 text-[9px] font-black uppercase rounded transition-all ${activeLayer.abstracts[selectedAbstractIndex].type === type ? 'bg-sky-600 text-white' : 'text-slate-500'}`}>{t(type)}</button></InfoTooltip>
                              ))}
                            </div>
                        )}

                        {renderSlider(activeLayer.abstracts[selectedAbstractIndex].type === 'fractal' ? t('Tree Arms') : t('Shape Arms'), activeLayer.abstracts[selectedAbstractIndex].arms, 1, 24, 1, (v, c) => updateAbstractConfig({ arms: v }, c), "", false, 6)}
                        {renderSlider(t('Inner Radius'), activeLayer.abstracts[selectedAbstractIndex].innerRadius, 0, 150, 0.1, (v, c) => updateAbstractConfig({ innerRadius: v }, c), "mm", false, 20)}
                        {renderSlider(
                            t('Outer Radius'),
                            activeLayer.abstracts[selectedAbstractIndex].outerRadius,
                            10,
                            300,
                            0.1,
                            (v, c) => updateAbstractConfig({ outerRadius: v }, c),
                            "mm",
                            false,
                            60,
                            <span className="text-[10px] font-black text-slate-500 ml-2">(D: <span className="text-white">{(activeLayer.abstracts[selectedAbstractIndex].outerRadius * 2).toFixed(1)}mm</span>)</span>
                        )}
                        {renderSlider(t('Boldness'), activeLayer.abstracts[selectedAbstractIndex].thickness, 0.5, 10, 0.1, (v, c) => updateAbstractConfig({ thickness: v }, c), "mm", false, 0.5)}

                        {activeLayer.abstracts[selectedAbstractIndex].type === 'fractal' && (
                            <div className="space-y-4 pt-2">
                                <div className="space-y-2">
                                    <div className={settingsHeaderClass}>
                                      <div className={settingsHeaderDotClass}></div>
                                      <span className={settingsHeaderLabelClass}>{t('Branching Structure')}</span>
                                    </div>
                                    {renderSlider(t('Trunk Length'), activeLayer.abstracts[selectedAbstractIndex].trunkLength ?? 0, 0, 100, 1, (v, c) => updateAbstractConfig({ trunkLength: v }, c), "mm", false, 0)}
                                    {renderSlider(t('Branches Per Node'), activeLayer.abstracts[selectedAbstractIndex].branchesPerNode ?? 2, 1, 12, 0.1, (v, c) => updateAbstractConfig({ branchesPerNode: v }, c), "", false, 2)}
                                    {renderSlider(t('Recursion Depth'), activeLayer.abstracts[selectedAbstractIndex].recursionDepth ?? 4, 1, 6, 1, (v, c) => updateAbstractConfig({ recursionDepth: v }, c), "", false, 4)}
                                    {renderSlider(t('Min Branch Length'), activeLayer.abstracts[selectedAbstractIndex].minBranchLength ?? 5, 1, 50, 1, (v, c) => updateAbstractConfig({ minBranchLength: v }, c), "mm", false, 5)}

                                    <ControlRow label={t('Branch Pattern')} onReset={() => updateAbstractConfig({ branchPattern: 'symmetric' }, true)} onSaveDefault={onSaveAsDefault} isModified={activeLayer.abstracts[selectedAbstractIndex].branchPattern !== 'symmetric'} t={t}>
                                        <div className="grid grid-cols-3 gap-1 bg-slate-900 p-1 rounded-lg">
                                            {(['symmetric', 'alternating', 'random'] as const).map(p => (
                                                <InfoTooltip key={p} label={p} description={getDescription(p, t)} className="flex-1"><button onClick={() => updateAbstractConfig({ branchPattern: p }, true)} className={`w-full py-1 text-[9px] font-black uppercase rounded transition-all ${activeLayer.abstracts[selectedAbstractIndex].branchPattern === p ? 'bg-sky-600 text-white' : 'text-slate-500'}`}>{p}</button></InfoTooltip>
                                            ))}
                                        </div>
                                    </ControlRow>
                                </div>

                                <div className="space-y-2">
                                    <div className={settingsHeaderClass}>
                                      <div className={settingsHeaderDotClass}></div>
                                      <span className={settingsHeaderLabelClass}>{t('Branch Geometry')}</span>
                                    </div>
                                    {renderSlider(t('Branch Angle'), activeLayer.abstracts[selectedAbstractIndex].branchAngle ?? 45, 0, 180, 1, (v, c) => updateAbstractConfig({ branchAngle: v }, c), "°", false, 45)}
                                    {renderSlider(t('Initial Length'), activeLayer.abstracts[selectedAbstractIndex].initialLength ?? 30, 1, 100, 1, (v, c) => updateAbstractConfig({ initialLength: v }, c), "mm", false, 30)}
                                    {renderSlider(t('Length Decay'), activeLayer.abstracts[selectedAbstractIndex].lengthDecay ?? 0.8, 0.1, 1, 0.01, (v, c) => updateAbstractConfig({ lengthDecay: v }, c), "", false, 0.8)}
                                    {renderSlider(t('Random Seed'), activeLayer.abstracts[selectedAbstractIndex].randomSeed ?? 1234, 0, 9999, 1, (v, c) => updateAbstractConfig({ randomSeed: v }, c), "", false, 1234)}
                                    {renderSlider(t('Angle Variation'), activeLayer.abstracts[selectedAbstractIndex].angleVariation ?? 0, 0, 45, 1, (v, c) => updateAbstractConfig({ angleVariation: v }, c), "°", false, 0)}
                                    {renderSlider(t('Length Variation'), activeLayer.abstracts[selectedAbstractIndex].lengthVariation ?? 0, 0, 50, 1, (v, c) => updateAbstractConfig({ lengthVariation: v }, c), "mm", false, 0)}
                                    {renderSlider(t('Thickness Decay'), activeLayer.abstracts[selectedAbstractIndex].thicknessDecay ?? 0.8, 0.1, 1, 0.01, (v, c) => updateAbstractConfig({ thicknessDecay: v }, c), "", false, 0.8)}
                                </div>
                            </div>
                        )}

                        {activeLayer.abstracts[selectedAbstractIndex].type !== 'fractal' && (activeLayer.abstracts[selectedAbstractIndex].type === 'sine' || activeLayer.abstracts[selectedAbstractIndex].type === 'zigzag') && (
                            <>
                                {renderSlider(t('Amplitude'), activeLayer.abstracts[selectedAbstractIndex].amplitude, 1, 30, 0.1, (v, c) => updateAbstractConfig({ amplitude: v }, c), "mm", false, 5)}
                                {renderSlider(t('Frequency'), activeLayer.abstracts[selectedAbstractIndex].frequency, 0.01, 1, 0.01, (v, c) => updateAbstractConfig({ frequency: v }, c), "", false, 0.4)}
                            </>
                        )}

                        {renderSlider(t('Rotation'), activeLayer.abstracts[selectedAbstractIndex].rotationOffset, -180, 180, 1, (v, c) => updateAbstractConfig({ rotationOffset: v }, c), "°", false, 0)}

                        <div className="space-y-4 pt-4 border-t border-white/5">
                           {activeLayer.abstracts[selectedAbstractIndex].mirrorEnabled && renderSlider(t('Mirror Offset'), activeLayer.abstracts[selectedAbstractIndex].mirrorOffset, -200, 200, 0.1, (v, c) => updateAbstractConfig({ mirrorOffset: v }, c), "mm", false, 0)}
                        </div>
                      </>
                    )}
                 </div>
               )}
             </div>
          )}


          {activeTab === 'images' && (
            <div className="space-y-4 animate-in fade-in duration-200">

              {/* Upload button */}
              <InfoTooltip label={t('Import SVG')} description={getDescription('Import SVG', t)} className="w-full">
              <label className="flex items-center justify-center gap-2 w-full h-9 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20 text-xs font-bold uppercase transition-all hover:bg-sky-500 hover:text-white cursor-pointer">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Import SVG
                <input
                  type="file"
                  accept=".svg"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      const raw = ev.target?.result as string;
                      if (!raw) return;
                      const parseSVG = () => {
                        try {
                          const parser = new DOMParser();
                          const doc = parser.parseFromString(raw, 'image/svg+xml');
                          const svgEl = doc.querySelector('svg');
                          const paths: string[] = [];
                          const pathElements = doc.querySelectorAll('path');
                          const maxPaths = 1000;
                          const pathCount = Math.min(pathElements.length, maxPaths);
                          for (let i = 0; i < pathCount; i++) {
                            const d = pathElements[i].getAttribute('d');
                            if (d) paths.push(d);
                          }
                          if (paths.length === 0) {
                            const allElements = doc.querySelectorAll('[d]');
                            const elementCount = Math.min(allElements.length, maxPaths);
                            for (let i = 0; i < elementCount; i++) {
                              const d = allElements[i].getAttribute('d');
                              if (d) paths.push(d);
                            }
                          }
                          if (paths.length === 0) {
                            alert('No path elements found in this SVG. Please export your design as paths from your vector editor.');
                            return;
                          }
                          const vb = svgEl?.getAttribute('viewBox')?.split(/[\s,]+/).map(Number) || [0, 0, 100, 100];
                          const w = vb[2] || parseFloat(svgEl?.getAttribute('width') || '100');
                          const h = vb[3] || parseFloat(svgEl?.getAttribute('height') || '100');
                          const newImage = createDefaultImage(`img-${Date.now()}`, file.name.replace(/\.svg$/i, ''), paths, w, h);
                          const newImages = [...(activeLayer.images || []), newImage];
                          updateImages(newImages, false);
                          setSelectedImageIndex(newImages.length - 1);
                        } catch (err) {
                          alert('Failed to parse SVG file.');
                        }
                      };
                      if (window.requestIdleCallback) {
                        window.requestIdleCallback(parseSVG, { timeout: 2000 });
                      } else {
                        setTimeout(parseSVG, 100);
                      }
                    };
                    reader.readAsText(file);
                    e.target.value = '';
                  }}
                />
              </label>
              </InfoTooltip>

              {/* Image selector chips */}
              {(activeLayer.images || []).length > 0 && (
                <div className="grid grid-cols-3 gap-1.5">
                  {(activeLayer.images || []).map((img, i) => (
                    <button
                      key={img.id}
                      onClick={() => setSelectedImageIndex(i)}
                      className={`h-8 rounded-lg text-[10px] font-bold uppercase border transition-all truncate px-2 ${
                        selectedImageIndex === i
                          ? 'bg-sky-600 border-sky-500 text-white'
                          : 'bg-slate-800 border-white/5 text-slate-400 hover:bg-slate-700'
                      }`}
                    >
                      {img.name}
                    </button>
                  ))}
                </div>
              )}

              {/* Per-image controls */}
              {(activeLayer.images || []).length > 0 && (activeLayer.images || [])[selectedImageIndex] && (() => {
                const img = (activeLayer.images || [])[selectedImageIndex];
                const updateImg = (updates: Partial<ImageConfig>, commit = false) => {
                  const newImages = (activeLayer.images || []).map((im, i) =>
                    i === selectedImageIndex ? { ...im, ...updates } : im
                  );
                  updateImages(newImages, commit);
                };

                return (
                  <div className="space-y-3 animate-in fade-in duration-150">
                    {/* Header row: name + visible + delete */}
                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                      <span className="text-[10px] font-black uppercase text-slate-400 truncate flex-1 mr-2">{img.name}</span>
                      <div className="flex items-center gap-2">
                        <InfoTooltip label={t('Image Visible')} description={getDescription('Image Visible', t)}>
                          <Toggle
                            label={img.enabled ? 'ON' : 'OFF'}
                            checked={img.enabled}
                            onChange={(c) => updateImg({ enabled: c }, true)}
                          />
                        </InfoTooltip>
                        <InfoTooltip label={t('Delete Image')} description={getDescription('Delete Image', t)}>
                          <button
                            onClick={() => {
                              const newImages = (activeLayer.images || []).filter((_, i) => i !== selectedImageIndex);
                              updateImages(newImages, true);
                              setSelectedImageIndex(prev => Math.max(0, prev - 1));
                            }}
                            className="text-[9px] font-black uppercase text-rose-400 hover:text-rose-300 ml-1"
                          >
                            Delete
                          </button>
                        </InfoTooltip>
                      </div>
                    </div>

                    {/* SVG thumbnail */}
                    <div className="w-full h-24 bg-slate-900 rounded-lg border border-slate-700/30 flex items-center justify-center overflow-hidden relative">
                      {img.svgPaths.length > 0 ? (
                        <svg
                          viewBox={`0 0 ${img.svgWidth || 100} ${img.svgHeight || 100}`}
                          className="max-w-full max-h-full"
                          style={{ fill: '#38bdf8' }}
                        >
                          {img.svgPaths.slice(0, 100).map((d, di) => (
                            <path key={di} d={d} />
                          ))}
                        </svg>
                      ) : (
                        <div className="text-slate-600 text-xs">No paths</div>
                      )}
                    </div>

                    {/* Sliders — all routed through renderSlider which adds InfoTooltip via ControlRow */}
                    {renderSlider('Image Arms', img.arms, 1, 24, 1, (v, c) => updateImg({ arms: v }, c), '', false, 6)}
                    {renderSlider('Scale', img.scale, 0.05, 10, 0.05, (v, c) => updateImg({ scale: v }, c), '×', false, 1.0)}
                    {renderSlider('Image Inner Radius', img.innerRadius, 0, 200, 0.5, (v, c) => updateImg({ innerRadius: v }, c), 'mm', false, 10)}
                    {renderSlider('Y Offset', img.yOffset, -100, 100, 0.5, (v, c) => updateImg({ yOffset: v }, c), 'mm', false, 0)}
                    {renderSlider('Image Rotation', img.rotationOffset, -180, 180, 1, (v, c) => updateImg({ rotationOffset: v }, c), '°', false, 0)}

                    {/* Mirror */}
                    <div className="flex justify-between items-center">
                      <InfoTooltip label={t('Image Mirror')} description={getDescription('Image Mirror', t)}>
                        <span className="text-[9px] font-black uppercase text-slate-400 border-b border-dotted border-slate-600 cursor-help">Mirror</span>
                      </InfoTooltip>
                      <Toggle
                        label={img.mirrorEnabled ? 'ON' : 'OFF'}
                        checked={img.mirrorEnabled}
                        onChange={(c) => updateImg({ mirrorEnabled: c }, true)}
                      />
                    </div>
                    {img.mirrorEnabled && renderSlider('Image Mirror Offset', img.mirrorOffset, -200, 200, 0.5, (v, c) => updateImg({ mirrorOffset: v }, c), 'mm', false, 0)}

                    {/* Flip */}
                    <div className="flex justify-between items-center">
                      <InfoTooltip label={t('Flip Image')} description={getDescription('Flip Image', t)}>
                        <span className="text-[9px] font-black uppercase text-slate-400 border-b border-dotted border-slate-600 cursor-help">Flip Image</span>
                      </InfoTooltip>
                      <Toggle
                        label={img.flipEnabled ? 'ON' : 'OFF'}
                        checked={img.flipEnabled}
                        onChange={(c) => updateImg({ flipEnabled: c }, true)}
                      />
                    </div>

                    {/* SVG Rotation */}
                    {renderSlider('SVG Rotation', img.svgRotation, -180, 180, 1, (v, c) => updateImg({ svgRotation: v }, c), '°', false, 0)}
                  </div>
                );
              })()}

              {(activeLayer.images || []).length === 0 && (
                <div className="text-center py-8 text-slate-600 text-xs">
                  <svg className="w-10 h-10 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="font-bold uppercase tracking-wider">No SVG imported yet</p>
                  <p className="mt-1 opacity-60">Upload an SVG to use its outline as a snowflake arm</p>
                </div>
              )}

            </div>
          )}

          {activeTab === 'planes' && (
             <div className="space-y-5 animate-in fade-in duration-200">
                <div className="space-y-2 pb-4 border-b border-white/5">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center">
                            <InfoTooltip label={t('Sync All Planes')} description={getDescription('Sync All Planes', t)} />
                            {!config.syncAllLayers && <button onClick={() => onUpdate({ syncAllLayers: true })} className="w-4 h-4 rounded hover:bg-rose-500 hover:text-white text-slate-500 transition-colors flex items-center justify-center mr-1" title={t('reset')}><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg></button>}
                        </div>
                      <div className="flex items-center">
                        {onSaveAsDefault && <button onClick={onSaveAsDefault} className="w-4 h-4 rounded hover:bg-emerald-500 hover:text-white text-slate-500 transition-colors flex items-center justify-center mr-1" title={t('saveDefault') || 'Save as Default'}><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3h11l3 3v15H5V3z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 3v6h8V3" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 21v-6h8v6" /></svg></button>}
                        <Toggle label={config.syncAllLayers ? t('ON') : t('OFF')} checked={config.syncAllLayers} onChange={(c) => onUpdate({ syncAllLayers: c })} />
                      </div>
                    </div>
                      <div className="flex justify-between items-center">
                        <div className="flex items-center">
                          <InfoTooltip label={t('Highlight Active Plane Only')} description={getDescription('Highlight Active Plane Only', t)} />
                          {config.highlightActivePlaneOnly && <button onClick={() => onUpdate({ highlightActivePlaneOnly: false })} className="w-4 h-4 rounded hover:bg-rose-500 hover:text-white text-slate-500 transition-colors flex items-center justify-center mr-1" title={t('reset')}><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg></button>}
                        </div>
                        <Toggle label={config.highlightActivePlaneOnly ? t('ON') : t('OFF')} checked={config.highlightActivePlaneOnly} onChange={(c) => onUpdate({ highlightActivePlaneOnly: c })} />
                      </div>
                      {config.slotEnabled && (
                        <div className="flex justify-between items-center">
                          <InfoTooltip label={t('Enable All Slot Bridges')} description={getDescription('Enable All Slot Bridges', t)} />
                          <Toggle
                            label={(config.slotBridgesEnabled !== false) ? t('ON') : t('OFF')}
                            checked={config.slotBridgesEnabled !== false}
                            onChange={(checked) => onUpdate({ slotBridgesEnabled: checked })}
                          />
                        </div>
                      )}
                </div>

                <div className="space-y-2">
                   {config.layers.map((layer, idx) => (
                      <div key={layer.id} className={`p-2 rounded-lg border transition-all ${config.activeLayerIndex === idx ? 'bg-sky-900/20 border-sky-500/30' : 'bg-slate-800/30 border-white/5'}`}>
                         <div className="flex items-center gap-2 w-full">
                           <InfoTooltip label={t('Active Plane Selector')} description={getDescription('Active Plane Selector', t)}>
                              <input
                                type="radio"
                                checked={config.activeLayerIndex === idx}
                                onChange={() => onUpdate({ activeLayerIndex: idx })}
                                className="w-3 h-3 accent-sky-500 cursor-pointer shrink-0"
                              />
                            </InfoTooltip>
                            <DeferredTextInput
                              value={layer.name}
                              onChange={(v) => handleLayerUpdate(idx, { name: v })}
                              className="w-28 h-7 text-[10px]"
                              placeholder={t('Layer Name')}
                              t={t}
                              onSaveDefault={onSaveAsDefault}
                            />
                            <div className="flex items-center gap-2 ml-auto">
                                <span className={`text-[9px] font-black uppercase tracking-wide ${layer.enabled ? 'text-emerald-400' : 'text-slate-500'}`}>
                                  {layer.enabled ? t('ON') : t('OFF')}
                                </span>
                                <div className="shrink-0 flex items-center">
                                  <label className="cursor-pointer" title={layer.enabled ? t('Visible') : t('Hidden')}>
                                    <div className={`w-7 h-4 rounded-full border transition-colors relative ${layer.enabled ? 'bg-emerald-600/20 border-emerald-500/50' : 'bg-slate-800 border-white/10'}`}>
                                      <div className={`absolute top-0.5 left-0.5 w-2 h-2 rounded-full transition-all ${layer.enabled ? `bg-emerald-400 translate-x-3` : 'bg-slate-500 translate-x-0'}`} />
                                    </div>
                                    <input
                                      type="checkbox"
                                      className="hidden"
                                      checked={layer.enabled}
                                      onChange={(e) => {
                                        handleLayerUpdate(idx, { enabled: e.target.checked }, true);
                                      }}
                                    />
                                  </label>
                                </div>
                                <ExportMenu
                                  label={t('Export')}
                                  onExportSTL={(q) => onExportLayerSTL(idx, q)}
                                  onExport3MF={(q) => onExportLayer3MF(idx, q)}
                                  onExport2D={(format) => onExport2D?.(idx, format)}
                                  onEstimateExportStats={onEstimateExportStats}
                                  onPrecomputeExportStats={onPrecomputeExportStats}
                                  defaultEstimateLayerIndices={[idx]}
                                  isLoading={Boolean(exportLoading && exportLoadingKey === `layer-${idx}`)}
                                  t={t}
                                  disabled={!layer.enabled}
                                  className="w-[5.5rem] h-7 shrink-0"
                                  baseColor="bg-slate-700"
                                  direction="down"
                                  show2D={true}
                                  shortcut={getLayerShortcut(idx)}
                                  compact={true}
                                />
                            </div>
                         </div>
                         {layer.enabled && (
                            <div className="mt-2 space-y-3 pt-2 border-t border-white/5">
                               {renderSlider(t('Rot X'), layer.rotation3D.x, -180, 180, 1, (v, c) => handleLayerUpdate(idx, { rotation3D: { ...layer.rotation3D, x: v } }, c), "°", false, 0)}
                               {renderSlider(t('Rot Y'), layer.rotation3D.y, -180, 180, 1, (v, c) => handleLayerUpdate(idx, { rotation3D: { ...layer.rotation3D, y: v } }, c), "°", false, 0)}
                               {config.slotEnabled && (
                                   <>
                                       <div className="w-full h-px bg-white/5 my-1"></div>
                                      {renderSlider(t('Slot Length Adj'), layer.slotLengthAdjustment || 0, -50, 50, 0.05, (v, c) => handleLayerUpdate(idx, { slotLengthAdjustment: v }, c), "mm", false, 0)}
                                       {renderSlider(t('Slot Width Offset'), layer.slotWidthOffset || 0, -2, 2, 0.05, (v, c) => handleLayerUpdate(idx, { slotWidthOffset: v }, c), "mm", false, 0)}
                                      {config.slotMode === '3-plane' && (idx === 1 || idx === 2) && (
                                        <>
                                          <div className="flex justify-between items-center">
                                            <InfoTooltip label={t('Manual Slot Width Adjustment')} description={getDescription('Manual Slot Width Adjustment', t)} />
                                            <Toggle
                                              label={layer.slotManualWidthEnabled ? t('ON') : t('OFF')}
                                              checked={Boolean(layer.slotManualWidthEnabled)}
                                              onChange={(checked) => handleLayerUpdate(idx, { slotManualWidthEnabled: checked }, false)}
                                            />
                                          </div>
                                          {layer.slotManualWidthEnabled && idx === 1 && (
                                            <>
                                              <div className="flex justify-between items-center">
                                                <InfoTooltip label={t('Cross Main Slot Width Offset')} description={getDescription('Cross Main Slot Width Offset', t)} />
                                                <Toggle
                                                  label={layer.slotWidthCrossMainOffsetEnabled ? t('ON') : t('OFF')}
                                                  checked={Boolean(layer.slotWidthCrossMainOffsetEnabled)}
                                                  onChange={(checked) => handleLayerUpdate(idx, { slotWidthCrossMainOffsetEnabled: checked }, false)}
                                                />
                                              </div>
                                              {layer.slotWidthCrossMainOffsetEnabled && renderSlider(t('Cross Main Slot Width Offset'), layer.slotWidthCrossMainOffset || 0, -2, 2, 0.05, (v, c) => handleLayerUpdate(idx, { slotWidthCrossMainOffset: v }, c), "mm", false, 0)}

                                              <div className="flex justify-between items-center">
                                                <InfoTooltip label={t('Cross Tip-In Slot Width Offset')} description={getDescription('Cross Tip-In Slot Width Offset', t)} />
                                                <Toggle
                                                  label={layer.slotWidthCrossTipInOffsetEnabled ? t('ON') : t('OFF')}
                                                  checked={Boolean(layer.slotWidthCrossTipInOffsetEnabled)}
                                                  onChange={(checked) => handleLayerUpdate(idx, { slotWidthCrossTipInOffsetEnabled: checked }, false)}
                                                />
                                              </div>
                                              {layer.slotWidthCrossTipInOffsetEnabled && renderSlider(t('Cross Tip-In Slot Width Offset'), layer.slotWidthCrossTipInOffset || 0, -2, 2, 0.05, (v, c) => handleLayerUpdate(idx, { slotWidthCrossTipInOffset: v }, c), "mm", false, 0)}
                                            </>
                                          )}
                                          {layer.slotManualWidthEnabled && idx === 2 && (
                                            <>
                                              <div className="flex justify-between items-center">
                                                <InfoTooltip label={t('Tilt Main Slot Width Offset')} description={getDescription('Tilt Main Slot Width Offset', t)} />
                                                <Toggle
                                                  label={layer.slotWidthTiltMainOffsetEnabled ? t('ON') : t('OFF')}
                                                  checked={Boolean(layer.slotWidthTiltMainOffsetEnabled)}
                                                  onChange={(checked) => handleLayerUpdate(idx, { slotWidthTiltMainOffsetEnabled: checked }, false)}
                                                />
                                              </div>
                                              {layer.slotWidthTiltMainOffsetEnabled && renderSlider(t('Tilt Main Slot Width Offset'), layer.slotWidthTiltMainOffset || 0, -2, 2, 0.05, (v, c) => handleLayerUpdate(idx, { slotWidthTiltMainOffset: v }, c), "mm", false, 0)}

                                              <div className="flex justify-between items-center">
                                                <InfoTooltip label={t('Tilt Extension Slot Width Offset')} description={getDescription('Tilt Extension Slot Width Offset', t)} />
                                                <Toggle
                                                  label={layer.slotWidthTiltExtensionOffsetEnabled ? t('ON') : t('OFF')}
                                                  checked={Boolean(layer.slotWidthTiltExtensionOffsetEnabled)}
                                                  onChange={(checked) => handleLayerUpdate(idx, { slotWidthTiltExtensionOffsetEnabled: checked }, false)}
                                                />
                                              </div>
                                              {layer.slotWidthTiltExtensionOffsetEnabled && renderSlider(t('Tilt Extension Slot Width Offset'), layer.slotWidthTiltExtensionOffset || 0, -2, 2, 0.05, (v, c) => handleLayerUpdate(idx, { slotWidthTiltExtensionOffset: v }, c), "mm", false, 0)}
                                            </>
                                          )}
                                        </>
                                      )}
                                      {config.slotBridgesEnabled !== false && (
                                        <>
                                          <div className="w-full h-px bg-white/5 my-1"></div>
                                          <div className="flex justify-between items-center">
                                            <InfoTooltip label={t('Enable Slot Bridges')} description={getDescription('Enable Slot Bridges', t)} />
                                            <Toggle
                                              label={layer.slotBridgeEnabled ? t('ON') : t('OFF')}
                                              checked={Boolean(layer.slotBridgeEnabled)}
                                              onChange={(checked) => handleLayerUpdate(idx, { slotBridgeEnabled: checked }, true)}
                                            />
                                          </div>

                                          {layer.slotBridgeEnabled && (
                                            <>
                                              <div className="flex justify-between items-center">
                                                <InfoTooltip label={t('Manual Slot Bridge Width')} description={getDescription('Manual Slot Bridge Width', t)} />
                                                <Toggle
                                                  label={layer.slotBridgeManualWidthEnabled ? t('ON') : t('OFF')}
                                                  checked={Boolean(layer.slotBridgeManualWidthEnabled)}
                                                  onChange={(checked) => handleLayerUpdate(idx, { slotBridgeManualWidthEnabled: checked }, false)}
                                                />
                                              </div>

                                              {layer.slotBridgeManualWidthEnabled && (
                                                <>
                                                  {renderSlider(
                                                    t('Slot Bridge Width'),
                                                    layer.slotBridgeManualWidth || 6,
                                                    0.5,
                                                    20,
                                                    0.05,
                                                    (v, c) => handleLayerUpdate(idx, { slotBridgeManualWidth: v }, c),
                                                    "mm",
                                                    false,
                                                    6
                                                  )}
                                                  {config.slotMode === '3-plane' && idx === 1 && (
                                                    <>
                                                      <div className="flex justify-between items-center">
                                                        <InfoTooltip label={t('Cross Main Bridge Width')} description={getDescription('Cross Main Bridge Width', t)} />
                                                        <Toggle
                                                          label={layer.slotBridgeCrossMainManualWidthEnabled ? t('ON') : t('OFF')}
                                                          checked={Boolean(layer.slotBridgeCrossMainManualWidthEnabled)}
                                                          onChange={(checked) => handleLayerUpdate(idx, { slotBridgeCrossMainManualWidthEnabled: checked }, false)}
                                                        />
                                                      </div>
                                                      {layer.slotBridgeCrossMainManualWidthEnabled && renderSlider(t('Cross Main Bridge Width'), layer.slotBridgeCrossMainManualWidth || 6, 0.5, 20, 0.05, (v, c) => handleLayerUpdate(idx, { slotBridgeCrossMainManualWidth: v }, c), "mm", false, 6)}

                                                      <div className="flex justify-between items-center">
                                                        <InfoTooltip label={t('Cross Tip-In Bridge Width')} description={getDescription('Cross Tip-In Bridge Width', t)} />
                                                        <Toggle
                                                          label={layer.slotBridgeCrossTipInManualWidthEnabled ? t('ON') : t('OFF')}
                                                          checked={Boolean(layer.slotBridgeCrossTipInManualWidthEnabled)}
                                                          onChange={(checked) => handleLayerUpdate(idx, { slotBridgeCrossTipInManualWidthEnabled: checked }, false)}
                                                        />
                                                      </div>
                                                      {layer.slotBridgeCrossTipInManualWidthEnabled && renderSlider(t('Cross Tip-In Bridge Width'), layer.slotBridgeCrossTipInManualWidth || 6, 0.5, 20, 0.05, (v, c) => handleLayerUpdate(idx, { slotBridgeCrossTipInManualWidth: v }, c), "mm", false, 6)}
                                                    </>
                                                  )}
                                                  {config.slotMode === '3-plane' && idx === 2 && (
                                                    <>
                                                      <div className="flex justify-between items-center">
                                                        <InfoTooltip label={t('Tilt Main Bridge Width')} description={getDescription('Tilt Main Bridge Width', t)} />
                                                        <Toggle
                                                          label={layer.slotBridgeTiltMainManualWidthEnabled ? t('ON') : t('OFF')}
                                                          checked={Boolean(layer.slotBridgeTiltMainManualWidthEnabled)}
                                                          onChange={(checked) => handleLayerUpdate(idx, { slotBridgeTiltMainManualWidthEnabled: checked }, false)}
                                                        />
                                                      </div>
                                                      {layer.slotBridgeTiltMainManualWidthEnabled && renderSlider(t('Tilt Main Bridge Width'), layer.slotBridgeTiltMainManualWidth || 6, 0.5, 20, 0.05, (v, c) => handleLayerUpdate(idx, { slotBridgeTiltMainManualWidth: v }, c), "mm", false, 6)}

                                                      <div className="flex justify-between items-center">
                                                        <InfoTooltip label={t('Tilt Extension Bridge Width')} description={getDescription('Tilt Extension Bridge Width', t)} />
                                                        <Toggle
                                                          label={layer.slotBridgeTiltExtensionManualWidthEnabled ? t('ON') : t('OFF')}
                                                          checked={Boolean(layer.slotBridgeTiltExtensionManualWidthEnabled)}
                                                          onChange={(checked) => handleLayerUpdate(idx, { slotBridgeTiltExtensionManualWidthEnabled: checked }, false)}
                                                        />
                                                      </div>
                                                      {layer.slotBridgeTiltExtensionManualWidthEnabled && renderSlider(t('Tilt Extension Bridge Width'), layer.slotBridgeTiltExtensionManualWidth || 6, 0.5, 20, 0.05, (v, c) => handleLayerUpdate(idx, { slotBridgeTiltExtensionManualWidth: v }, c), "mm", false, 6)}
                                                    </>
                                                  )}
                                                </>
                                              )}
                                            </>
                                          )}
                                        </>
                                      )}

                                   </>
                               )}
                            </div>
                         )}

                      </div>
                   ))}
                </div>
                {config.slotEnabled && (
                    <div className="p-3 bg-slate-800/30 rounded-xl border border-white/5 space-y-4 mt-4">
                        <div className={settingsHeaderClass}>
                          <div className={settingsHeaderDotClass}></div>
                          <span className={settingsHeaderLabelClass}>{t('All Planes')}</span>
                        </div>
                        {renderSlider(t('Slot Length'), config.slotLength, 10, 200, 0.05, (v, c) => onUpdate({ slotLength: v }, c), "mm", false, 95)}
                        {renderSlider(t('Slot Width'), config.slotWidth, 0, 3, 0.05, (v, c) => onUpdate({ slotWidth: v }, c), "mm", false, 0.2)}
                    </div>
                )}
             </div>
          )}

        </div>

        {/* Footer actions */}
        <div className="p-2 bg-slate-900/80 border-t border-white/10 shrink-0">
            <div className="grid grid-cols-3 gap-2 h-8">
              <CutSlotsMenu config={config} onUpdate={onUpdate} className="w-full h-8" t={t} />
              <AiRandomizerMenu onGenerate={onAiPolish} isLoading={aiLoading} progress={aiProgress} className="w-full h-8" t={t} onOpenShortcutsModal={onOpenShortcutsModal} />
              <ExportMenu
                label="Export"
                onExportSTL={onExportSTL}
                onExport3MF={onExport3MF}
                onExportSelectedPlanesSTL={(layerIndices, quality) => onExportSelectedLayersSTL?.(layerIndices, quality)}
                onExportSelectedPlanes3MF={(layerIndices, quality) => onExportSelectedLayers3MF?.(layerIndices, quality)}
                onExport2D={(fmt) => onExport2D?.(config.activeLayerIndex, fmt)}
                onEstimateExportStats={onEstimateExportStats}
                onPrecomputeExportStats={onPrecomputeExportStats}
                isLoading={Boolean(exportLoading && (exportLoadingKey === 'combined-stl' || exportLoadingKey === 'combined-3mf' || exportLoadingKey === 'layers-batch-stl' || exportLoadingKey === 'layers-batch-3mf' || exportLoadingKey?.startsWith('layer-')))}
                t={t}
                className="w-full h-8"
                baseColor="bg-sky-600"
                show2D={true}
                shortcut={shortcuts?.exportCombinedSTL}
                planeActions={config.layers.slice(0, 3).map((layer, idx) => ({
                  label: `${layer.name || `Plane ${idx + 1}`}`,
                  onExportSTL: (q) => onExportLayerSTL(idx, q),
                  onExport3MF: (q) => onExportLayer3MF(idx, q),
                  layerIndex: idx,
                  isActive: layer.enabled,
                }))}
              />
            </div>
        </div>
      </div>
    </TooltipContext.Provider>
  );
};

export default ControlPanel;
