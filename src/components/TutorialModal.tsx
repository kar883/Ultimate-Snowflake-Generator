import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

// A target is a CSS selector, or a button/element found by its visible text.
type TargetSpec = string | { text: string; closest?: string };
type SettingsTab = 'shortcuts' | 'apikey' | 'aiscope' | 'settings' | 'appearance';

interface TutorialStep {
  icon: string;
  title: string;
  body: string;
  tips?: string[];
  targets?: TargetSpec[];
  // Separate highlight boxes (each a group of targets). Overrides 	argets for drawing.
  boxes?: TargetSpec[][];
  // Don't add the whole control panel to the highlight in advanced mode.
  noPanel?: boolean;
  // Opens a footer dropdown (matching data-tutorial=<id>) while the step is shown (advanced mode only).
  openMenu?: 'export' | 'slots' | 'ai';
  // Element clicked when the step opens (used to reveal the relevant tab).
  activate?: TargetSpec;
  // Extra per-variable explanations, shown only in advanced mode.
  details?: string[];
  // Steps that only appear in advanced mode.
  advancedOnly?: boolean;
  // Steps that only appear in basic mode.
  basicOnly?: boolean;
  // Select this plane before activating the step's control tab.
  planeIndex?: number;
  // Opens the Settings modal on this tab while the step is shown.
  settingsTab?: SettingsTab;
  // When 'preview', the card is parked over the preview so the control panel stays visible.
  anchor?: 'preview';
}

const resolveTarget = (spec: TargetSpec): HTMLElement | null => {
  if (typeof spec === 'string') return document.querySelector<HTMLElement>(spec);
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('button, span, label'));
  const match = candidates.find((el) => el.textContent?.trim() === spec.text && el.getClientRects().length > 0);
  if (!match) return null;
  return (spec.closest ? match.closest<HTMLElement>(spec.closest) : null) ?? match;
};

const CARD_WIDTH = 600;
const MIN_CARD_WIDTH = 480;
const GAP = 16;
const PAD = 6;

const STEPS: TutorialStep[] = [
  {
    icon: '❄️',
    title: 'Welcome to the Ultimate Snowflake Generator',
    body: 'Design a snowflake, preview it in 2D and 3D, and export it as STL or 3MF for 3D printing, or as SVG or DXF vector files for laser cutting and CAD. This quick tour covers the main features and takes about a minute.',
    tips: [
      'Want more detail? Tick "Advanced" below for an in-depth tour that explains the variables on each tab and the export options.',
      'You can reopen this tour any time from Settings → Settings.',
    ],
  },
  {
    icon: '🖥️',
    title: 'The control panel',
    body: 'Everything you design with lives in the left panel. The tabs along the top (Text, Letter Ctrl, Hubs, Abstract, Images, Planes, Global) each control one part of the snowflake. We will go through them left to right.',
    tips: ['Changes appear in the preview on the right as you make them.'],
    targets: ['[data-tutorial="panel"]'],
  },
  {
    icon: '🎛️',
    title: 'Global settings',
    body: 'The Global tab controls what applies to the whole model: extrusion depth, edge bevel or fillet, boldness, model color, and the 2D measurement annotation color. In the 2D preview, use the Measurements toggle to show or hide width and height. Bevel rounds the edges without changing the overall thickness.',
    tips: ['Boldness thickens all text and shapes uniformly.'],
    targets: ['[data-tutorial="tab-global"]'],
    activate: '[data-tutorial="tab-global"]',
    anchor: 'preview',
    details: [
      'Extrusion Depth: thickness of each plane in mm (this is the printed thickness).',
      'Bevel Enabled / Profile Shape: Fillet rounds edges smoothly; Chamfer cuts a flat angle.',
      'Bevel Amount: edge size in mm. It is capped to what the geometry can support so edges never break.',
      'Fillet Detail: segments used to smooth the curve. Higher is smoother but slower to generate.',
      'Boldness: uniformly thickens every shape in the model.',
      'In-Plane Scale: changes the model width and height without changing plane thickness.',
      'Measurement Color: changes the 2D width/height lines and labels. The Measurements button at the top-left of the 2D preview toggles annotations on or off.',
      'Cut Slots: on/off for the interlocking slots. Slot Width (clearance), Slot Length and Automatic Slot Length appear only while Cut Slots is ON; Automatic Slot Length measures your design, including hubs and abstracts that extend past the text.',
    ],
  },
  {
    icon: '🔤',
    title: 'Text',
    body: 'Start on the Text tab. Type a word or phrase, pick a font, and set the number of arms, size, spacing and thickness. A secondary text group lets you add a second ring of lettering.',
    tips: ['Letter Ctrl lets you fine-tune individual characters.'],
    targets: ['[data-tutorial="tab-text"]'],
    activate: '[data-tutorial="tab-text"]',
    anchor: 'preview',
    details: [
      'Phrase Content: the words engraved around each arm. Each Text group (Text 1, Text 2…) has its own phrase, font and settings.',
      'Arms / Symmetry: how many times the design repeats around the centre (6 is a classic snowflake).',
      'Outer Radius / Inner Radius: where the lettering starts and ends measured from the centre, in mm. Together they set the overall diameter.',
      'Font Size and Letter Spacing: size of the glyphs, and the gap between them. Negative spacing makes cursive letters overlap and fuse into one connected shape.',
      'Thickness / Boldness: thickens the strokes so thin script fonts print reliably.',
      'Rotation Offset and Mirror: rotate the text group, or mirror it to the opposite side of each arm.',
    ],
  },
  {
    icon: '🔡',
    title: 'Letter Ctrl (per-letter control)',
    body: 'Letter Ctrl lets you pick a single character and adjust it without affecting the rest of the phrase.',
    targets: ['[data-tutorial="tab-Letter Ctrl"]'],
    activate: '[data-tutorial="tab-Letter Ctrl"]',
    anchor: 'preview',
    advancedOnly: true,
    details: [
      'Select a letter to change its own size, offset and rotation.',
      'Use it to tuck a letter closer to a neighbour so the two merge into a stronger joint.',
      'Overrides are remembered per letter, so editing the phrase keeps them where possible.',
    ],
  },
  {
    icon: '⭐',
    title: 'Hubs',
    body: 'The Hubs tab adds circles, polygons or stars at the centre of your snowflake. Add a hub to explore its shape and size controls.',
    tips: ['Hubs can be switched on or off, mirrored and rotated independently.'],
    targets: ['[data-tutorial="tab-hubs"]', '[data-tutorial="add-hub"]'],
    boxes: [['[data-tutorial="tab-hubs"]'], ['[data-tutorial="add-hub"]']],
    noPanel: true,
    basicOnly: true,
    activate: '[data-tutorial="tab-hubs"]',
    anchor: 'preview',
  },
  {
    icon: '〰️',
    title: 'Abstracts',
    body: 'The Abstract tab adds decorative lines, waves, zigzags and fractal branches along your snowflake arms.',
    tips: ['Add a shape or fractal to explore its controls. Abstracts can be mirrored and rotated independently.'],
    targets: ['[data-tutorial="tab-abstract"]', '[data-tutorial="add-abstract-shape"]', '[data-tutorial="add-abstract-fractal"]'],
    boxes: [['[data-tutorial="tab-abstract"]'], ['[data-tutorial="add-abstract-shape"]', '[data-tutorial="add-abstract-fractal"]']],
    noPanel: true,
    basicOnly: true,
    activate: '[data-tutorial="tab-abstract"]',
    anchor: 'preview',
  },
  {
    icon: '⭐',
    title: 'Hub options',
    body: 'Configure the hub for the selected plane. The same hub controls are available for Base, Cross and Tilt; Sync All Planes determines whether edits apply to every plane.',
    targets: ['[data-tutorial="tab-hubs"]', '[data-tutorial="add-hub"]'],
    boxes: [['[data-tutorial="tab-hubs"]'], ['[data-tutorial="add-hub"]']],
    advancedOnly: true,
    noPanel: true,
    activate: '[data-tutorial="tab-hubs"]',
    anchor: 'preview',
    details: [
      'Add/select a hub and use its ON/OFF control to include it in the design.',
      'Shape: choose Circle, Polygon or Star; Radius and Sides/Points control its size and silhouette.',
      'Thickness and Bevel: set the hub depth and edge fillet. Bevel limits are reported when the geometry cannot support the requested value.',
      'Hollow and Wall Thickness: make a ring-shaped hub and set the material left around its opening.',
      'Oscillation (circle only): enable a rippled edge, then adjust Amplitude and Frequency.',
      'Rotation Offset turns the hub around the centre.',
    ],
  },
  {
    icon: '〰️',
    title: 'Abstract options',
    body: 'Configure abstract shapes for the selected plane. The same abstract controls are available for Base, Cross and Tilt; Sync All Planes determines whether edits apply to every plane.',
    targets: ['[data-tutorial="tab-abstract"]', '[data-tutorial="add-abstract-shape"]', '[data-tutorial="add-abstract-fractal"]'],
    boxes: [['[data-tutorial="tab-abstract"]'], ['[data-tutorial="add-abstract-shape"]', '[data-tutorial="add-abstract-fractal"]']],
    advancedOnly: true,
    noPanel: true,
    activate: '[data-tutorial="tab-abstract"]',
    anchor: 'preview',
    details: [
      'Add/select a Shape or Fractal and use its ON/OFF control to include it in the design.',
      'Type: choose Line, Sine, Zigzag or Fractal. Inner/Outer Radius set where the shape runs along the arm.',
      'Amplitude and Frequency tune sine and zigzag patterns; Thickness sets the stroke width.',
      'Fractal controls include Recursion Depth, Branches Per Node, Branch Angle, Initial Length and Minimum Branch Length.',
      'Length Decay, Thickness Decay, Angle Variation and Length Variation shape branching across generations.',
      'Random Seed makes fractal variation repeatable. Mirror and Rotation Offset control placement and orientation.',
    ],
  },
  {
    icon: '📐',
    title: 'Planes',
    body: 'The Planes tab builds a multi-plane snowflake (Base, Cross and Tilt) that slots together into a standing 3D ornament.',
    tips: ['Each plane has its own on/off switch, name and rotation, so you can print a single flat flake or a full ornament.'],
    targets: ['[data-tutorial="tab-planes"]', '[data-tutorial="plane-cards"]'],
    boxes: [['[data-tutorial="tab-planes"]'], ['[data-tutorial="plane-cards"]']],
    noPanel: true,
    activate: '[data-tutorial="tab-planes"]',
    anchor: 'preview',
    details: [
      'Sync All Planes ON (default): Text, Hub, Abstract and other design edits are applied to every plane at once, so all planes stay identical.',
      'Sync All Planes OFF: edits only change the active plane (the one with its radio button selected), so each plane can have a different design. A reset arrow appears to turn sync back on.',
      'Highlight Active Plane Only: when sync is OFF, emphasises the active plane in the preview.',
      'Plane on/off: switches a plane in or out of the model and the export.',
      'Name: label each plane so exported files are easy to tell apart.',
      'Rot X / Rot Y: rotates the plane in 3D so it stands at the right angle against the others.',
      'Base, Cross and Tilt: Base lies flat, Cross stands upright through it, and Tilt is angled between them.',
      '(Visible only when slots are ON) Each plane card also shows its slot controls; see the Slots slide.',
    ],
  },
  {
    icon: '🖼️',
    title: 'Images',
    body: 'The Images tab turns your own artwork into snowflake shapes. Import an SVG and it is repeated around the snowflake as an arm element.',
    tips: ['Use Import SVG at the top of the Images tab. Simple, solid shapes work best.'],
    targets: ['[data-tutorial="tab-images"]', '[data-tutorial="import-images"]'],
    boxes: [['[data-tutorial="tab-images"]'], ['[data-tutorial="import-images"]']],
    noPanel: true,
    activate: '[data-tutorial="tab-images"]',
    anchor: 'preview',
    details: [
      'Import SVG: loads the outline paths from an SVG file. Each imported image appears as a thumbnail you can select, switch ON/OFF or delete.',
      'Image Layout: Radial repeats the image around the centre; Centered places a single copy in the middle.',
      'Image Arms (Radial only): how many times the image repeats around the centre.',
      'Scale: overall size of the image.',
      'Image Inner Radius and Y Offset (Radial only): how far from the centre the image starts and how far it slides along the arm.',
      'Image Rotation (Radial only) and SVG Rotation: turn the image around the centre, or turn the artwork itself.',
      'Mirror (Radial only) and Mirror Offset: add a mirrored copy on the other side of each arm.',
      'Flip Image: flips the artwork horizontally.',
    ],
  },
  {
    icon: '🧊',
    title: 'The 2D / 3D workspace',
    body: 'Switch between a fast 2D preview and the printable 3D model with the toggle at the preview’s top right. In 3D, drag to orbit and scroll to zoom.',
    tips: ['Plane visibility and Ghost affect only the preview, not exports.'],
    targets: ['[data-tutorial="preview"]'],
    noPanel: true,
    activate: '[data-tutorial="view-3d"]',
    details: [
      'Planes card: ON/OFF hides or shows a plane; Ghost makes it transparent. These are preview-only.',
      'Hanging ring: in the top-left of the 2D preview, toggle the ring for the active plane. When enabled, use the slider to change its size; the control shows the inner and outer diameters in mm.',
      'Drag the green hanging ring directly on the 2D model to position it. The ring is included in that plane’s 3D extrusion and exports.',
      'ID Bodies checks for disconnected pieces: green means connected; red highlights loose parts.',
      'Orbit by dragging or using the orientation gizmo; click an axis to snap to a view. Home resets the camera.',
      'Force refresh rebuilds the model. Auto Regen controls automatic rebuilds; Undo / Redo are at the bottom left.',
    ],
  },
  {
    icon: '💾',
    title: 'Save, load and undo',
    body: 'Save stores your whole project as a file you can reopen later, and Load brings a saved project back. Undo and Redo are always available while you work.',
    tips: ['Ctrl+Z / Ctrl+Y undo and redo, Ctrl+S saves, Ctrl+L loads.'],
    targets: ['[data-tutorial="save"]', '[data-tutorial="load"]'],
  },
  {
    icon: '🧩',
    title: 'Slots',
    body: 'Slots let the planes interlock. Turn on Cut Slots at the bottom of the panel to cut them automatically, then fine-tune them in the Planes tab.',
    tips: [
      'Slot settings only appear in the panel while Cut Slots is ON.',
      'Automatic Slot Length sizes slots to fit your design, including hubs and abstracts that extend past the text.',
    ],
    targets: ['[data-tutorial="slots"]'],
    noPanel: true,
    openMenu: 'slots',
    anchor: 'preview',
    details: [
      'Cut Slots button: turns the interlocking slots on or off. It is always visible; the arrow beside it opens the slot options shown here.',
      'Mode (2-Plane / 3-Plane): choose whether slots are cut for a two-plane cross or a three-plane (Base, Cross, Tilt) ornament.',
      'Save slots on/off as startup default: appears when you change the on/off state, so new sessions start the way you like.',
      '(Visible only when slots are ON) Automatic Slot Length: measures your design and sizes each slot to fit. Turn it off to set lengths by hand.',
      '(Visible only when slots are ON) Slot Width (clearance): the gap left in each slot so planes slide together easily.',
      '(Visible only when slots are ON) Slot Width Offset and Slot Length Adj: per-plane controls on each plane card. Offset: extra width added to a plane\'s slot to tune the fit for your printer.',
      '(Visible only when slots are ON) Main vs Extension slot: the Tilt plane has a main slot and an extension, each with its own length and width offset.',
    ],
  },
  {
    icon: '✨',
    title: 'AI suggestions',
    body: 'The AI button can suggest text and design ideas. It needs a Gemini API key, which you can add under Settings → API Key. Everything else works without it.',
    targets: ['[data-tutorial="ai"]'],
    noPanel: true,
    openMenu: 'ai',
    anchor: 'preview',
    details: [
      'AI button: runs the AI Randomizer in the last-used mode (shown in brackets). Click it again to get a fresh suggestion.',
      'Mode 3D / 2D / Trad.: 3D designs for the multi-plane model, 2D for a flat flake, and Trad. for a traditional fractal-style snowflake.',
      'Settings (gear icon): opens the AI settings, including your Gemini API key and what the AI is allowed to change.',
      'Shuffle / Shuffle Again: generates another variation in the selected mode.',
      'Reset on Shuffle: when ON, each shuffle starts from default settings instead of building on the current design.',
    ],
  },
  {
    icon: '📦',
    title: 'Export',
    body: 'The Export button at the bottom of the panel writes your design to a file. The main button exports immediately in the current format; the arrow beside it opens the export options.',
    tips: [
      'STL and 3MF are for 3D printing. SVG and DXF are 2D outlines of the active plane.',
      'Ctrl+E exports the combined STL.',
    ],
    targets: ['[data-tutorial="export"]'],
    openMenu: 'export',
    anchor: 'preview',
    details: [
      'Format: STL is the universal 3D-print mesh. 3MF is a modern 3D-print format that is more compact. SVG and DXF export the active plane as a flat 2D outline for laser cutters, vinyl cutters and CAD.',
      'Hovering STL or 3MF shows an estimate of triangle count, file size and export time for the current selection.',
      'Quality (Low / Med / High): how finely curves are tessellated. Higher is smoother but gives larger files and takes longer to export.',
      'Export button: writes the chosen format. With no planes selected it exports the combined model.',
      'Single Plane: pick one or more planes (Base, Cross, Tilt) to export only those as separate files, handy for printing each plane flat. Planes that are switched off cannot be selected.',
      'Clear Selection: returns to exporting the combined model.',
    ],
  },
  {
    icon: '⚙️',
    title: 'Open Settings',
    body: 'The Settings button is in the app header. Select Next to see the Settings options, or continue to About Snowflake Generator.',
    targets: ['[data-tutorial="settings"]'],
    noPanel: true,
  },
  ...([
    {
      tab: 'shortcuts',
      title: 'Settings: Shortcuts',
      body: 'Choose the interface language, turn tooltips on or off, and review or customize keyboard shortcuts. Save your changes or reset shortcuts to their defaults.',
    },
    {
      tab: 'apikey',
      title: 'Settings: API Key',
      body: 'Add a Gemini API key to enable AI text suggestions and randomization. Keys saved here stay in your browser; a VITE_GEMINI_API_KEY environment variable takes priority.',
    },
    {
      tab: 'aiscope',
      title: 'Settings: AI Controls',
      body: 'Choose which design parameters the AI Randomizer may change. Disable a whole section or fine-tune the individual variables it can use.',
    },
    {
      tab: 'settings',
      title: 'Settings: Settings',
      body: 'Save the current design as your startup default, configure the Basic or Advanced startup tutorial, restore factory defaults, and reset adaptive export-estimate learning.',
    },
    {
      tab: 'appearance',
      title: 'Settings: Appearance',
      body: 'Customize the app background, panel, model, and measurement colors. You can also reduce interface animations, increase contrast, or reset appearance settings.',
    },
  ] as const).map(({ tab, title, body }): TutorialStep => ({
    icon: '⚙️',
    title,
    body,
    settingsTab: tab,
    advancedOnly: true,
    noPanel: true,
    targets: [`[data-tutorial="settings-tab-${tab}"]`, '[data-tutorial="settings-content"]'],
    boxes: [[`[data-tutorial="settings-tab-${tab}"]`], ['[data-tutorial="settings-content"]']],
  })),
  {
    icon: 'ℹ️',
    title: 'About Snowflake Generator',
    body: 'The About Snowflake Generator window is available from the About button at the top of Settings. It contains app information, update checks, and links for support and feedback.',
    tips: ['Open Settings, then select About. You can click the highlighted About button while the tutorial is open.'],
    targets: ['[data-tutorial="about-button"]'],
    settingsTab: 'settings',
    noPanel: true,
  },
];

interface TutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Called when the user changes the "don't show at startup" checkbox.
  onDisableAtStartupChange: (disabled: boolean) => void;
  disableAtStartup: boolean;
  advanced: boolean;
  onAdvancedChange: (advanced: boolean) => void;
  onSelectPlane?: (planeIndex: number) => void;
  onShowSettingsTab?: (tab: SettingsTab | null) => void;
}

const TutorialModal: React.FC<TutorialModalProps> = ({
  isOpen,
  onClose,
  onDisableAtStartupChange,
  disableAtStartup,
  advanced,
  onAdvancedChange,
  onSelectPlane,
  onShowSettingsTab,
}) => {
  const steps = useMemo(
    () => STEPS.filter((s) => advanced ? !s.basicOnly : !s.advancedOnly),
    [advanced]
  );
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [boxes, setBoxes] = useState<DOMRect[]>([]);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const focusNextAfterTransition = useRef(false);

  useEffect(() => {
    if (isOpen) setStep(0);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) onShowSettingsTab?.(null);
  }, [isOpen, onShowSettingsTab]);

  // When Basic/Advanced toggles, stay on the same slide (or the nearest earlier one) instead of shifting.
  const [prevSteps, setPrevSteps] = useState(steps);
  if (prevSteps !== steps) {
    const currentTitle = prevSteps[Math.min(step, prevSteps.length - 1)]?.title;
    const order = STEPS.findIndex((s) => s.title === currentTitle);
    let next = 0;
    steps.forEach((s, i) => {
      if (STEPS.indexOf(s) <= order) next = i;
    });
    setPrevSteps(steps);
    setStep(next);
  }

  useEffect(() => {
    if (!focusNextAfterTransition.current) return;
    focusNextAfterTransition.current = false;
    nextButtonRef.current?.focus({ preventScroll: true });
  }, [step]);

  const advanceStep = useCallback(() => {
    if (step >= steps.length - 1) return;
    focusNextAfterTransition.current = true;
    setStep(step + 1);
  }, [step, steps.length]);

  // Reveal the relevant tab, then track the highlighted element's bounds.
  useLayoutEffect(() => {
    if (!isOpen) return;
    const stepDef = steps[step];
    if (!stepDef) return;
    onShowSettingsTab?.(stepDef.settingsTab ?? null);
    if (stepDef.planeIndex !== undefined) {
      onSelectPlane?.(stepDef.planeIndex);
    }
    if (stepDef.activate) resolveTarget(stepDef.activate)?.click();

    const menuId = advanced ? stepDef.openMenu : undefined;
    const setMenu = (open: boolean) =>
      window.dispatchEvent(new CustomEvent('tutorial:menu', { detail: { id: menuId, open } }));
    if (menuId) setMenu(true);

    const measure = () => {
      const specs: TargetSpec[] = [...(stepDef.targets ?? [])];
      if (menuId) specs.push(`[data-tutorial="${menuId}-menu"]`);
      // In advanced mode, detail steps highlight the whole control panel.
      else if (advanced && stepDef.details && !stepDef.noPanel) specs.push('[data-tutorial="panel"]');
      const els = specs.map(resolveTarget).filter((el): el is HTMLElement => !!el);
      const boxSpecs = stepDef.boxes && !menuId ? stepDef.boxes : null;
      const boxRects = (boxSpecs ?? []).map((group) => {
        const rs = group.map(resolveTarget).filter((el): el is HTMLElement => !!el).map((el) => el.getBoundingClientRect());
        if (rs.length === 0) return null;
        const l = Math.min(...rs.map((r) => r.left));
        const tp = Math.min(...rs.map((r) => r.top));
        return new DOMRect(l, tp, Math.max(...rs.map((r) => r.right)) - l, Math.max(...rs.map((r) => r.bottom)) - tp);
      }).filter((r): r is DOMRect => !!r);
      setBoxes(boxRects);
      setAnchorRect(document.querySelector('[data-tutorial="preview"]')?.getBoundingClientRect() ?? null);
      if (els.length === 0) {
        setRect(null);
        return;
      }
      const rects = els.map((el) => el.getBoundingClientRect());
      const left = Math.min(...rects.map((r) => r.left));
      const top = Math.min(...rects.map((r) => r.top));
      const right = Math.max(...rects.map((r) => r.right));
      const bottom = Math.max(...rects.map((r) => r.bottom));
      setRect(new DOMRect(left, top, right - left, bottom - top));
    };
    // Bring off-screen targets into view before measuring.
    const scrollTargets = () => {
      (stepDef.targets ?? []).forEach((spec) => {
        resolveTarget(spec)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      });
      measure();
    };
    measure();
    // Panels re-render after a tab switch, so measure again shortly after.
    const timer = window.setTimeout(scrollTargets, 120);
    const timer2 = window.setTimeout(measure, 400);
    const timer3 = window.setTimeout(measure, 1500);
    window.addEventListener('resize', measure);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(timer2);
      window.clearTimeout(timer3);
      window.removeEventListener('resize', measure);
      if (menuId) setMenu(false);
    };
  }, [isOpen, step, steps, advanced, onSelectPlane, onShowSettingsTab]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      else if (event.key === 'ArrowRight') advanceStep();
      else if (event.key === 'ArrowLeft') setStep((s) => Math.max(0, s - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose, steps.length, advanceStep]);

  if (!isOpen) return null;

  const current = steps[Math.min(step, steps.length - 1)];
  const isLast = step === steps.length - 1;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Shrink the card (down to a floor) so it can sit beside the highlight instead of covering it.
  const spaceRight = rect ? vw - (rect.right + PAD + 4 + GAP * 2) : CARD_WIDTH;
  const cardW = Math.min(vw - GAP * 2, Math.max(Math.min(CARD_WIDTH, spaceRight), MIN_CARD_WIDTH));
  const cardMaxH = vh - GAP * 2;
  const holes = boxes.length > 0 ? boxes : rect ? [rect] : [];
  let cardStyle: React.CSSProperties | undefined;
  if (rect) {
    const cardH = Math.min(cardRef.current?.offsetHeight ?? 380, cardMaxH);
    const clampTop = (t: number) => Math.max(GAP, Math.min(vh - cardH - GAP, t));
    const clampLeft = (l: number) => Math.max(GAP, Math.min(vw - cardW - GAP, l));
    const hole = {
      left: rect.left - PAD - 4,
      top: rect.top - PAD - 4,
      right: rect.right + PAD + 4,
      bottom: rect.bottom + PAD + 4,
    };
    const overlaps = (l: number, t: number) =>
      l < hole.right && l + cardW > hole.left && t < hole.bottom && t + cardH > hole.top;

    const candidates: Array<{ left: number; top: number }> = [];
    if (current.anchor === 'preview' && anchorRect) {
      candidates.push({ left: clampLeft(Math.max(anchorRect.left + GAP, hole.right + GAP)), top: clampTop(anchorRect.top + GAP) });
    }
    candidates.push(
      { left: clampLeft(hole.right + GAP), top: clampTop(rect.top) },
      { left: clampLeft(hole.left - GAP - cardW), top: clampTop(rect.top) },
      { left: clampLeft(rect.left), top: clampTop(hole.bottom + GAP) },
      { left: clampLeft(rect.left), top: clampTop(hole.top - GAP - cardH) },
      { left: GAP, top: GAP },
      { left: vw - cardW - GAP, top: GAP },
      { left: GAP, top: vh - cardH - GAP },
      { left: vw - cardW - GAP, top: vh - cardH - GAP }
    );
    const best = candidates.find((c) => !overlaps(c.left, c.top)) ?? candidates[0];
    cardStyle = { left: best.left, top: best.top };
  }
  return (
    <div
      className={`fixed inset-0 z-[300] ${rect ? 'pointer-events-none' : 'flex items-center justify-center bg-black/70 backdrop-blur-sm p-4'}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorial-title"
    >
      {rect && (
        <>
          <svg className="fixed inset-0 w-full h-full pointer-events-none">
            <defs>
              <mask id="tutorial-mask">
                <rect width="100%" height="100%" fill="white" />
                {holes.map((h, i) => (
                  <rect key={i} x={h.left - PAD} y={h.top - PAD} width={h.width + PAD * 2} height={h.height + PAD * 2} rx="8" fill="black" />
                ))}
              </mask>
            </defs>
            <rect width="100%" height="100%" fill="rgba(2,6,23,0.75)" mask="url(#tutorial-mask)" />
          </svg>
          {holes.map((h, i) => (
            <div
              key={i}
              className="fixed rounded-lg border-2 border-sky-400 pointer-events-none transition-all duration-300"
              style={{
                left: h.left - PAD,
                top: h.top - PAD,
                width: h.width + PAD * 2,
                height: h.height + PAD * 2,
                boxShadow: '0 0 18px 4px rgba(56,189,248,0.6)',
              }}
            />
          ))}
        </>
      )}
      <div
        ref={cardRef}
        data-tutorial-card
        className={`pointer-events-auto rounded-2xl border border-white/10 bg-slate-900 shadow-2xl overflow-hidden ${rect ? 'fixed' : 'w-full max-w-lg'}`}
        style={rect ? { ...cardStyle, width: cardW, maxHeight: cardMaxH, overflowY: 'auto' } : { maxHeight: cardMaxH, overflowY: 'auto' }}
      >
        <div className="h-1 bg-slate-800">
          <div
            className="h-full bg-sky-500 transition-all duration-300"
            style={{ width: `${((step + 1) / steps.length) * 100}%` }}
          />
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="text-3xl" aria-hidden="true">{current.icon}</div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-sky-400">
                  Step {step + 1} of {steps.length}
                </div>
                <h2 id="tutorial-title" className="text-lg font-black text-white leading-tight">
                  {current.title}
                </h2>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-slate-500 hover:text-white text-xl leading-none"
              aria-label="Close tutorial"
            >
              ×
            </button>
          </div>

          <p className="text-sm text-slate-300 leading-relaxed">{current.body}</p>

          {advanced && current.details && (
            <div className="space-y-1.5 rounded-lg bg-sky-950/40 border border-sky-500/20 p-3">
              <div className="text-[10px] font-black uppercase tracking-wider text-sky-300">Settings in detail</div>
              <ul className="space-y-1.5">
                {current.details.map((d) => (
                  <li key={d} className="text-xs text-slate-300 flex gap-2">
                    <span className="text-sky-400">▸</span>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {current.tips && (
            <ul className="space-y-1.5 rounded-lg bg-slate-800/50 border border-white/5 p-3">
              {current.tips.map((tip) => (
                <li key={tip} className="text-xs text-slate-400 flex gap-2">
                  <span className="text-sky-400">•</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex justify-center gap-1.5 pt-1">
            {steps.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                aria-label={`Go to step ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? 'w-5 bg-sky-400' : 'w-1.5 bg-slate-600 hover:bg-slate-500'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-slate-950/50 px-6 py-4">
          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={disableAtStartup}
              onChange={(event) => onDisableAtStartupChange(event.target.checked)}
              className="w-4 h-4 accent-sky-500"
            />
            <span className="whitespace-nowrap">Don&apos;t show at startup</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={advanced}
              onChange={(event) => onAdvancedChange(event.target.checked)}
              className="w-4 h-4 accent-sky-500"
            />
            <span>Advanced</span>
          </label>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                className="px-3 h-8 rounded-lg bg-slate-800 text-slate-300 border border-white/10 text-xs font-black uppercase tracking-wider hover:bg-slate-700"
              >
                Back
              </button>
            )}
            {isLast ? (
              <button
                onClick={onClose}
                className="px-4 h-8 rounded-lg bg-emerald-600 text-white text-xs font-black uppercase tracking-wider hover:bg-emerald-500"
              >
                Get Started
              </button>
            ) : (
              <>
                <button
                  onClick={onClose}
                  className="px-3 h-8 rounded-lg text-slate-500 text-xs font-black uppercase tracking-wider hover:text-slate-300"
                >
                  Skip
                </button>
                <button
                  ref={nextButtonRef}
                  onClick={advanceStep}
                  className="px-4 h-8 rounded-lg bg-sky-600 text-white text-xs font-black uppercase tracking-wider hover:bg-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-300"
                >
                  Next
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TutorialModal;
