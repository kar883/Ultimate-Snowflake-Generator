import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
// @ts-ignore
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { SnowflakeConfig, ShortcutConfig, DesignQuality } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// BFS flood-fill: finds connected bodies within a BufferGeometry.
// Returns bodyPerVertex[i] = integer body index (0-based).
// Vertices are "connected" if they share a triangle edge.
// ─────────────────────────────────────────────────────────────────────────────
function findConnectedBodies(geo: THREE.BufferGeometry): {
  bodyPerVertex: Int32Array;
  bodyCount: number;
} {
  const posCount = geo.attributes.position.count;
  const idx = geo.index;
  const bodyPerVertex = new Int32Array(posCount).fill(-1);

  // adjacency: vertex → neighbouring vertices that share a triangle
  const adj: Set<number>[] = Array.from({ length: posCount }, () => new Set<number>());
  const triCount = idx ? idx.count / 3 : posCount / 3;
  for (let t = 0; t < triCount; t++) {
    const a = idx ? idx.getX(t * 3)     : t * 3;
    const b = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
    const c = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    if (a === b || b === c || a === c) continue; // degenerate
    adj[a].add(b); adj[a].add(c);
    adj[b].add(a); adj[b].add(c);
    adj[c].add(a); adj[c].add(b);
  }

  let bodyCount = 0;
  for (let start = 0; start < posCount; start++) {
    if (bodyPerVertex[start] !== -1 || adj[start].size === 0) continue;
    const queue: number[] = [start];
    bodyPerVertex[start] = bodyCount;
    let qi = 0;
    while (qi < queue.length) {
      const cur = queue[qi++];
      adj[cur].forEach(nb => {
        if (bodyPerVertex[nb] === -1) {
          bodyPerVertex[nb] = bodyCount;
          queue.push(nb);
        }
      });
    }
    bodyCount++;
  }
  return { bodyPerVertex, bodyCount };
}

// ─────────────────────────────────────────────────────────────────────────────
// Build vertex colour attribute: body 0 = base colour, bodies 1-N = palette
// ─────────────────────────────────────────────────────────────────────────────
const BODY_PALETTE = [
  '#f97316','#eab308','#22c55e','#06b6d4',
  '#8b5cf6','#ec4899','#14b8a6','#f43f5e',
  '#84cc16','#a855f7','#fb923c','#34d399',
];

function buildBodyColors(
  geo: THREE.BufferGeometry,
  bodyPerVertex: Int32Array,
  bodyCount: number,
  baseHex: string
): THREE.BufferAttribute {
  const pos = geo.attributes.position;
  const arr = new Float32Array(pos.count * 3);
  const baseC = new THREE.Color(baseHex);
  const paletteC = BODY_PALETTE.map(h => new THREE.Color(h));

  for (let i = 0; i < pos.count; i++) {
    const bi = bodyPerVertex[i];
    const c = bi <= 0 ? baseC : paletteC[(bi - 1) % paletteC.length];
    arr[i * 3]     = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  return new THREE.BufferAttribute(arr, 3);
}

// ─────────────────────────────────────────────────────────────────────────────
// Dynamic XYZ orientation gizmo — projects world axes through camera quaternion
// ─────────────────────────────────────────────────────────────────────────────
const XYZGizmo: React.FC<{ q: THREE.Quaternion | null }> = ({ q }) => {
  if (!q) return null;
  const R = 22, cx = 32, cy = 32;
  const axes = [
    { label: 'X', dir: new THREE.Vector3(1, 0, 0), color: '#ef4444' },
    { label: 'Y', dir: new THREE.Vector3(0, 1, 0), color: '#22c55e' },
    { label: 'Z', dir: new THREE.Vector3(0, 0, 1), color: '#3b82f6' },
  ].map(({ label, dir, color }) => {
    const v = dir.clone().applyQuaternion(q);
    return { label, color, x: cx + v.x * R, y: cy - v.y * R, depth: v.z };
  }).sort((a, b) => a.depth - b.depth); // draw back → front

  return (
    <svg width="64" height="64" className="block select-none">
      <circle cx="32" cy="32" r="30" fill="rgba(15,23,42,0.55)"
        stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      {axes.map(({ label, x, y, color, depth }) => {
        const op = 0.35 + 0.65 * ((depth + 1) / 2);
        return (
          <g key={label} opacity={op}>
            <line x1="32" y1="32" x2={x} y2={y}
              stroke={color} strokeWidth="2.5" strokeLinecap="round" />
            <text x={x + (x - 32) * 0.45} y={y + (y - 32) * 0.45 + 3.5}
              fill={color} fontSize="9" fontWeight="900" textAnchor="middle"
              style={{ fontFamily: 'ui-monospace,monospace' }}>{label}</text>
          </g>
        );
      })}
      <circle cx="32" cy="32" r="2.5" fill="white" opacity="0.9" />
    </svg>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
interface Snowflake3DProps {
  config: SnowflakeConfig;
  generateMesh: (onProgress: (p: number) => void, overrideQuality?: DesignQuality, overrideConfig?: SnowflakeConfig) => Promise<THREE.Group>;
  color: string;
  undo?: () => void;
  redo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  initialDiameter?: number;
  shortcuts?: ShortcutConfig;
  isVisible: boolean;
}

const Snowflake3D: React.FC<Snowflake3DProps> = ({
  config, generateMesh, color,
  undo, redo, canUndo, canRedo,
  initialDiameter, isVisible,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef  = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef     = useRef<THREE.Scene | null>(null);
  const cameraRef    = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef  = useRef<OrbitControls | null>(null);
  const meshGroupRef = useRef<THREE.Group | null>(null);
  const isVisibleRef = useRef(isVisible);

  const [loading, setLoading] = useState(false);
  const [camQ, setCamQ]       = useState<THREE.Quaternion | null>(null);

  // per-plane UI state
  const enabledLayers = config.layers.filter(l => l.enabled);
  const [planeVis,   setPlaneVis]   = useState<Record<string, boolean>>(() =>
    Object.fromEntries(config.layers.map(l => [l.id, l.enabled])));
  const [planeGhost, setPlaneGhost] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(config.layers.map(l => [l.id, false])));

  // body-colour mode
  const [bodyMode, setBodyMode] = useState(false);

  useEffect(() => { isVisibleRef.current = isVisible; }, [isVisible]);

  // keep visibility in sync when config.layers changes (planes enabled/disabled)
  useEffect(() => {
    setPlaneVis(prev => {
      const next: Record<string, boolean> = {};
      config.layers.forEach(l => { next[l.id] = l.id in prev ? prev[l.id] : l.enabled; });
      return next;
    });
  }, [config.layers]);

  // ── Apply material / visibility to all scene meshes ──────────────────────
  const applyAppearance = useCallback((bm: boolean) => {
    if (!meshGroupRef.current) return;
    meshGroupRef.current.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      const lid: string | undefined = child.userData.layerId;
      if (!lid) return;

      child.visible = planeVis[lid] ?? true;
      const mat = child.material as THREE.MeshStandardMaterial;
      if (!mat) return;

      if (bm) {
        // Body-colour mode: show disconnected bodies as different colours.
        // Colour attribute was built at load time if bodyCount > 1.
        const bodyCount: number = child.userData.bodyCount ?? 1;
        if (bodyCount > 1 && !child.geometry.attributes.color) {
          // Build it now (deferred in case it wasn't done at load)
          const bpv: Int32Array | undefined = child.userData.bodyPerVertex;
          const layerIdx = enabledLayers.findIndex(l => l.id === lid);
          const layerBaseColors = ['#38bdf8', '#a78bfa', '#34d399'];
          const baseColor = layerBaseColors[layerIdx] ?? '#38bdf8';
          if (bpv) {
            child.geometry.setAttribute(
              'color', buildBodyColors(child.geometry, bpv, bodyCount, baseColor)
            );
          }
        }
        mat.vertexColors = bodyCount > 1;
        if (bodyCount <= 1) mat.color.set(color || '#38bdf8');
        mat.emissive.set('#111111');
        mat.emissiveIntensity = 0.08;
        mat.metalness = 0.15;
        mat.roughness = 0.55;
        mat.transparent = false;
        mat.opacity = 1.0;
      } else {
        // Normal shading
        mat.vertexColors = false;
        mat.color.set(color || '#38bdf8');
        mat.emissive.set(color || '#38bdf8');
        mat.emissiveIntensity = 0.05;
        mat.metalness = 0.6;
        mat.roughness = 0.08;
        const ghost = planeGhost[lid] ?? false;
        mat.transparent = ghost;
        mat.opacity = ghost ? 0.18 : 1.0;
      }
      mat.needsUpdate = true;
    });
  }, [planeVis, planeGhost, color, enabledLayers]);

  useEffect(() => { applyAppearance(bodyMode); },
    [planeVis, planeGhost, bodyMode, applyAppearance]);

  // ── Three.js scene ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const w = containerRef.current.clientWidth;
    const h = containerRef.current.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020617);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 2000);
    camera.position.set(0, -280, 200);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(w, h);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    Object.assign(renderer.domElement.style, {
      width: '100%', height: '100%', display: 'block',
      position: 'absolute', top: '0', left: '0',
    });

    // lighting
    scene.add(new THREE.AmbientLight(0x38bdf8, 0.2));
    const key = new THREE.DirectionalLight(0xffffff, 3.5);
    key.position.set(500, 1000, 500); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048); scene.add(key);
    const fill = new THREE.DirectionalLight(0x38bdf8, 0.8);
    fill.position.set(-300, 300, 300); scene.add(fill);
    const rim = new THREE.DirectionalLight(0x4488ff, 1.0);
    rim.position.set(0, 0, 300); scene.add(rim);

    // env map
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envS = new THREE.Scene();
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(1000, 1000),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
    );
    panel.position.z = 500; envS.add(panel);
    scene.environment = pmrem.fromScene(envS).texture; pmrem.dispose();

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controlsRef.current = controls;

    let frame = 0;
    const animate = () => {
      requestAnimationFrame(animate);
      if (!isVisibleRef.current) return;
      controls.update();
      renderer.render(scene, camera);
      // throttle gizmo updates to every 2 frames
      if (frame++ % 2 === 0) setCamQ(camera.quaternion.clone());
    };
    animate();

    const onResize = () => {
      if (!containerRef.current) return;
      const nw = containerRef.current.clientWidth;
      const nh = containerRef.current.clientHeight;
      camera.aspect = nw / nh; camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      containerRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  // ── Mesh loading ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const group = await generateMesh(() => {}, undefined, config);
        if (cancelled || !sceneRef.current) return;
        if (meshGroupRef.current) sceneRef.current.remove(meshGroupRef.current);

        const baseMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(color || '#38bdf8'),
          metalness: 0.6, roughness: 0.08,
          emissive: new THREE.Color(color || '#38bdf8'),
          emissiveIntensity: 0.05,
          envMapIntensity: 2.0,
          side: THREE.DoubleSide,
          transparent: true, opacity: 1.0,
        });

        const layerBaseColors = ['#38bdf8', '#a78bfa', '#34d399'];

        group.traverse(child => {
          if (!(child instanceof THREE.Mesh)) return;
          const lid: string | undefined = child.userData.layerId;
          child.material = baseMat.clone();
          child.castShadow = true;
          child.receiveShadow = true;
          child.frustumCulled = false;
          child.geometry.computeVertexNormals();

          // BFS body analysis — store results, build colour attr if needed
          if (lid) {
            try {
              const { bodyPerVertex, bodyCount } = findConnectedBodies(child.geometry);
              child.userData.bodyPerVertex = bodyPerVertex;
              child.userData.bodyCount     = bodyCount;

              if (bodyCount > 1) {
                const layerIdx = config.layers.filter(l => l.enabled).findIndex(l => l.id === lid);
                const baseColor = layerBaseColors[layerIdx] ?? '#38bdf8';
                child.geometry.setAttribute(
                  'color', buildBodyColors(child.geometry, bodyPerVertex, bodyCount, baseColor)
                );
              }
            } catch (e) {
              console.warn('BFS body analysis failed for', lid, e);
              child.userData.bodyCount = 1;
            }
          }
        });

        // Centre whole group (not per-mesh — avoids exploding the assembly)
        const box = new THREE.Box3().setFromObject(group);
        const centre = new THREE.Vector3(); box.getCenter(centre);
        group.position.sub(centre);

        sceneRef.current.add(group);
        meshGroupRef.current = group;
        setTimeout(() => applyAppearance(bodyMode), 0);
      } catch (err) {
        console.error('Snowflake3D: mesh generation failed', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const t = setTimeout(load, 100);
    return () => { cancelled = true; clearTimeout(t); };
  }, [config, generateMesh]);

  useEffect(() => { applyAppearance(bodyMode); },
    [planeVis, planeGhost, bodyMode, applyAppearance]);

  // ── Render ───────────────────────────────────────────────────────────────
  const PLANE_DOTS = ['#38bdf8', '#a78bfa', '#34d399'];

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full bg-slate-950 rounded-xl overflow-hidden" />

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 rounded-xl pointer-events-none">
          <div className="text-white text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-400 mx-auto mb-2" />
            <div className="text-sm text-slate-300">Generating…</div>
          </div>
        </div>
      )}

      {/* ── TOP-LEFT: diameter + per-plane visibility controls ────────────── */}
      <div className="absolute top-3 left-3 z-40 flex flex-col gap-2">
        {/* Diameter badge */}
        <div className="bg-slate-900/85 backdrop-blur-md px-3 py-2 rounded-lg border border-white/10 shadow-xl">
          <span className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500 block leading-none mb-0.5">
            Diameter
          </span>
          <span className="text-lg font-bold text-white leading-none">
            {(initialDiameter ?? 0).toFixed(1)}
            <span className="text-xs text-sky-400 ml-1">mm</span>
          </span>
        </div>

        {/* Plane controls — only show rows for enabled layers */}
        {enabledLayers.length > 0 && (
          <div className="bg-slate-900/85 backdrop-blur-md px-3 py-2.5 rounded-lg border border-white/10 shadow-xl">
            <span className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500 block leading-none mb-2">
              Planes
            </span>
            <div className="flex flex-col gap-1.5">
              {enabledLayers.map((layer, idx) => {
                const vis   = planeVis[layer.id]   ?? true;
                const ghost = planeGhost[layer.id] ?? false;
                const dot   = PLANE_DOTS[idx] ?? '#94a3b8';
                return (
                  <div key={layer.id} className="flex items-center gap-1.5">
                    {/* colour dot */}
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dot }} />
                    <span className="text-[11px] font-medium text-slate-300 flex-1 min-w-0 truncate">
                      {layer.name}
                    </span>

                    {/* Eye — visibility */}
                    <button
                      onClick={() => setPlaneVis(p => ({ ...p, [layer.id]: !p[layer.id] }))}
                      title={vis ? 'Hide plane' : 'Show plane'}
                      className={`p-1.5 rounded-md border transition-all ${
                        vis
                          ? 'bg-sky-500/20 border-sky-500/40 text-sky-300 hover:bg-sky-500/35'
                          : 'bg-slate-700/50 border-slate-600/40 text-slate-500 hover:bg-slate-600/50'
                      }`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        {!vis && (
                          <line x1="4" y1="4" x2="20" y2="20" stroke="currentColor"
                            strokeWidth={2.5} strokeLinecap="round" />
                        )}
                      </svg>
                    </button>

                    {/* Ghost — transparency */}
                    <button
                      onClick={() => setPlaneGhost(p => ({ ...p, [layer.id]: !p[layer.id] }))}
                      title={ghost ? 'Make opaque' : 'Make transparent'}
                      className={`p-1.5 rounded-md border transition-all ${
                        ghost
                          ? 'bg-cyan-500/25 border-cyan-400/50 text-cyan-300 hover:bg-cyan-500/40'
                          : 'bg-slate-700/50 border-slate-600/40 text-slate-400 hover:bg-slate-600/50'
                      }`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M12 3C8.134 3 5 6.134 5 10v8l2-2 2 2 2-2 2 2 2-2 2 2v-8c0-3.866-3.134-7-7-7z" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── BOTTOM-LEFT: undo / redo ─────────────────────────────────────── */}
      {(canUndo || canRedo) && (
        <div className="absolute bottom-4 left-4 z-40 flex gap-2">
          <button onClick={undo} disabled={!canUndo}
            className="p-2 bg-slate-800/80 backdrop-blur rounded-lg text-white disabled:opacity-30 hover:bg-sky-500 transition-all shadow-lg border border-white/5">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          </button>
          <button onClick={redo} disabled={!canRedo}
            className="p-2 bg-slate-800/80 backdrop-blur rounded-lg text-white disabled:opacity-30 hover:bg-sky-500 transition-all shadow-lg border border-white/5">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
            </svg>
          </button>
        </div>
      )}

      {/* ── BOTTOM-RIGHT: gizmo + home + "ID Bodies" button ─────────────────
           All three are stacked here, well away from the 2D/3D toggle
           which sits at the top-centre of the parent layout. */}
      <div className="absolute bottom-4 right-4 z-40 flex flex-col items-end gap-2">

        {/* Dynamic XYZ gizmo — rotates live with the camera */}
        <div className="bg-slate-900/75 backdrop-blur-md rounded-xl border border-white/10 shadow-xl p-1.5">
          <XYZGizmo q={camQ} />
          <p className="text-center text-[8px] font-bold uppercase tracking-widest text-slate-500 mt-0.5">
            Orientation
          </p>
        </div>

        {/* Reset camera */}
        <button
          onClick={() => controlsRef.current?.reset()}
          title="Reset camera"
          className="p-2.5 bg-slate-900/85 backdrop-blur-md hover:bg-sky-500 text-slate-300 hover:text-white rounded-xl border border-white/10 shadow-xl transition-all active:scale-90"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
              d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </button>

        {/* "Identify Bodies" toggle — body 0 (connected) stays the layer colour;
            any disconnected body gets a distinct palette colour so you can
            immediately spot floating geometry after slot cuts. */}
        <button
          onClick={() => setBodyMode(b => !b)}
          title={bodyMode
            ? 'Body mode ON — each disconnected mesh body has a unique colour'
            : 'Toggle body-colour mode to identify disconnected parts'}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl border shadow-xl backdrop-blur-md transition-all text-xs font-semibold whitespace-nowrap ${
            bodyMode
              ? 'bg-violet-600/80 border-violet-400/50 text-white'
              : 'bg-slate-900/85 border-white/10 text-slate-300 hover:bg-slate-800/90 hover:text-white'
          }`}
        >
          {/* Four-quadrant segmented icon */}
          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 16 16" fill="none">
            <rect x="1"  y="1"  width="6" height="6" rx="1"
              fill={bodyMode ? '#f472b6' : '#ef4444'} opacity="0.95" />
            <rect x="9"  y="1"  width="6" height="6" rx="1"
              fill={bodyMode ? '#34d399' : '#22c55e'} opacity="0.95" />
            <rect x="1"  y="9"  width="6" height="6" rx="1"
              fill={bodyMode ? '#60a5fa' : '#3b82f6'} opacity="0.95" />
            <rect x="9"  y="9"  width="6" height="6" rx="1"
              fill={bodyMode ? '#fbbf24' : '#f97316'} opacity="0.95" />
          </svg>
          {bodyMode ? 'Bodies ON' : 'ID Bodies'}
        </button>
      </div>
    </div>
  );
};

export default Snowflake3D;
