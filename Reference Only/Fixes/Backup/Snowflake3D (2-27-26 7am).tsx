import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
// @ts-ignore
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
// @ts-ignore
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
// @ts-ignore
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
// @ts-ignore
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { SnowflakeConfig, ShortcutConfig, DesignQuality } from '../types';

// Distinct colours for body-identification mode
const BODY_COLORS = [
  '#ef4444','#f97316','#eab308','#22c55e',
  '#06b6d4','#3b82f6','#8b5cf6','#ec4899',
  '#14b8a6','#f43f5e','#84cc16','#a855f7',
];

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

// Dynamic XYZ gizmo — projects world axes through camera quaternion each frame
const XYZGizmo: React.FC<{ camera: THREE.PerspectiveCamera | null }> = ({ camera }) => {
  const [axes, setAxes] = useState<{label:string;x:number;y:number;color:string;z:number}[]>([]);
  useEffect(() => {
    let raf: number;
    const update = () => {
      if (camera) {
        const R = 26, cx = 36, cy = 36;
        const defs = [
          { label:'X', vec: new THREE.Vector3(1,0,0), color:'#ef4444' },
          { label:'Y', vec: new THREE.Vector3(0,1,0), color:'#22c55e' },
          { label:'Z', vec: new THREE.Vector3(0,0,1), color:'#3b82f6' },
        ];
        const proj = defs.map(({label,vec,color}) => {
          const v = vec.clone().applyQuaternion(camera.quaternion);
          return { label, color, x: cx + v.x*R, y: cy - v.y*R, z: v.z };
        });
        proj.sort((a,b) => a.z - b.z);
        setAxes(proj);
      }
      raf = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(raf);
  }, [camera]);

  return (
    <svg width="72" height="72" className="block select-none">
      <circle cx="36" cy="36" r="34" fill="rgba(15,23,42,0.5)" stroke="rgba(255,255,255,0.07)" strokeWidth="1"/>
      {axes.map(({label,x,y,color,z}) => {
        const op = 0.4 + 0.6 * Math.max(0,(z+1)/2);
        return (
          <g key={label} opacity={op}>
            <line x1="36" y1="36" x2={x} y2={y} stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
            <text x={x+(x-36)*0.4} y={y+(y-36)*0.4+3.5}
              fill={color} fontSize="10" fontWeight="800" textAnchor="middle"
              style={{fontFamily:'system-ui,sans-serif'}}>{label}</text>
          </g>
        );
      })}
      <circle cx="36" cy="36" r="3" fill="white" opacity="0.9"/>
    </svg>
  );
};

const EyeIcon: React.FC<{visible:boolean}> = ({visible}) => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
    {!visible && <line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"/>}
  </svg>
);

const GhostIcon: React.FC = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3C8.134 3 5 6.134 5 10v8l2-2 2 2 2-2 2 2 2-2 2 2v-8c0-3.866-3.134-7-7-7z"/>
  </svg>
);

const BodyColorIcon: React.FC = () => (
  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
    <rect x="1" y="1" width="6" height="6" rx="1" fill="#ef4444"/>
    <rect x="9" y="1" width="6" height="6" rx="1" fill="#22c55e"/>
    <rect x="1" y="9" width="6" height="6" rx="1" fill="#3b82f6"/>
    <rect x="9" y="9" width="6" height="6" rx="1" fill="#f97316"/>
  </svg>
);

const Snowflake3D: React.FC<Snowflake3DProps> = ({
  config, generateMesh, color,
  undo, redo, canUndo, canRedo,
  initialDiameter, shortcuts, isVisible
}) => {
  const containerRef  = useRef<HTMLDivElement>(null);
  const rendererRef   = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef      = useRef<THREE.Scene | null>(null);
  const cameraRef     = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef   = useRef<OrbitControls | null>(null);
  const meshGroupRef  = useRef<THREE.Group | null>(null);
  const isVisibleRef  = useRef(isVisible);
  const [cameraSnap, setCameraSnap] = useState<THREE.PerspectiveCamera | null>(null);
  const [loading, setLoading] = useState(false);

  const [planeVisibility, setPlaneVisibility] = useState<Record<string,boolean>>(() =>
    Object.fromEntries(config.layers.map(l => [l.id, l.enabled]))
  );
  const [planeTransparent, setPlaneTransparent] = useState<Record<string,boolean>>(() =>
    Object.fromEntries(config.layers.map(l => [l.id, false]))
  );
  const [bodyColorMode, setBodyColorMode] = useState(false);

  const enabledLayers = config.layers.filter(l => l.enabled);

  useEffect(() => { isVisibleRef.current = isVisible; }, [isVisible]);

  useEffect(() => {
    setPlaneVisibility(prev => {
      const next: Record<string,boolean> = {};
      config.layers.forEach(l => { next[l.id] = l.id in prev ? prev[l.id] : l.enabled; });
      return next;
    });
  }, [config.layers]);

  const toggleVisibility  = (id: string) => setPlaneVisibility(p  => ({...p, [id]: !p[id]}));
  const toggleTransparent = (id: string) => setPlaneTransparent(p => ({...p, [id]: !p[id]}));

  const applyMeshStates = useCallback(() => {
    if (!meshGroupRef.current) return;
    meshGroupRef.current.traverse(c => {
      if (!(c instanceof THREE.Mesh)) return;
      const layerId: string | undefined = c.userData.layerId;
      if (!layerId) return;
      c.visible = planeVisibility[layerId] ?? true;
      const mat = c.material as THREE.MeshStandardMaterial;
      if (!mat) return;
      if (bodyColorMode) {
        const bi: number = c.userData.bodyIndex ?? 0;
        mat.color.set(BODY_COLORS[bi % BODY_COLORS.length]);
        mat.emissive.set(BODY_COLORS[bi % BODY_COLORS.length]);
        mat.emissiveIntensity = 0.2;
        mat.transparent = false;
        mat.opacity = 1.0;
        mat.metalness = 0.2;
        mat.roughness = 0.5;
      } else {
        mat.color.set(color || '#38bdf8');
        mat.emissive.set(color || '#38bdf8');
        mat.emissiveIntensity = 0.05;
        mat.metalness = 0.6;
        mat.roughness = 0.08;
        const ghost = planeTransparent[layerId] ?? false;
        mat.transparent = ghost;
        mat.opacity = ghost ? 0.18 : 1.0;
      }
      mat.needsUpdate = true;
    });
  }, [planeVisibility, planeTransparent, bodyColorMode, color]);

  useEffect(() => { applyMeshStates(); },
    [planeVisibility, planeTransparent, bodyColorMode, applyMeshStates]);

  // Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;
    const w = containerRef.current.clientWidth;
    const h = containerRef.current.clientHeight;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020617);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(40, w/h, 0.1, 2000);
    // Base plane is extruded along Z (flat on XY).
    // Position camera so the base reads as lying flat — slightly above, looking down-forward.
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
      width:'100%', height:'100%', display:'block', position:'absolute', top:'0', left:'0'
    });

    scene.add(new THREE.AmbientLight(0x38bdf8, 0.2));
    const key = new THREE.DirectionalLight(0xffffff, 3.5);
    key.position.set(500,1000,500); key.castShadow = true;
    key.shadow.mapSize.set(2048,2048); scene.add(key);
    const fill = new THREE.DirectionalLight(0x38bdf8, 0.8);
    fill.position.set(-300,300,300); scene.add(fill);
    const rim = new THREE.DirectionalLight(0x4488ff, 1.0);
    rim.position.set(0,0,300); scene.add(rim);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envS = new THREE.Scene();
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(1000,1000),
      new THREE.MeshBasicMaterial({color:0xffffff, side:THREE.DoubleSide})
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
      if (frame++ % 2 === 0) setCameraSnap(cam => cam === camera ? camera : camera);
    };
    animate();

    const onResize = () => {
      if (!containerRef.current) return;
      const nw = containerRef.current.clientWidth;
      const nh = containerRef.current.clientHeight;
      camera.aspect = nw/nh; camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); renderer.dispose(); containerRef.current?.removeChild(renderer.domElement); };
  }, []);

  // Mesh loading
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

        const layerBodyCount: Record<string,number> = {};
        group.traverse(c => {
          if (!(c instanceof THREE.Mesh)) return;
          const lid: string | undefined = c.userData.layerId;
          if (lid) {
            if (!(lid in layerBodyCount)) layerBodyCount[lid] = 0;
            c.userData.bodyIndex = layerBodyCount[lid]++;
          }
          c.material = baseMat.clone();
          c.castShadow = true; c.receiveShadow = true;
          c.frustumCulled = false;
          c.geometry.computeVertexNormals();
        });

        // Centre the group as a whole (not each mesh individually)
        const box = new THREE.Box3().setFromObject(group);
        const centre = new THREE.Vector3(); box.getCenter(centre);
        group.position.sub(centre);

        sceneRef.current.add(group);
        meshGroupRef.current = group;
        setTimeout(() => applyMeshStates(), 0);
      } catch (err) {
        console.error('Snowflake3D: mesh generation failed', err);
      } finally { if (!cancelled) setLoading(false); }
    };
    const t = setTimeout(load, 100);
    return () => { cancelled = true; clearTimeout(t); };
  }, [config, generateMesh]);

  useEffect(() => { applyMeshStates(); },
    [planeVisibility, planeTransparent, bodyColorMode, applyMeshStates]);

  const PLANE_DOTS = ['#38bdf8','#a78bfa','#34d399'];

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full bg-slate-950 rounded-xl overflow-hidden"/>

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 rounded-xl pointer-events-none">
          <div className="text-white text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-400 mx-auto mb-2"/>
            <div className="text-sm text-slate-300">Generating…</div>
          </div>
        </div>
      )}

      {/* Top-left: diameter + plane controls */}
      <div className="absolute top-3 left-3 z-40 flex flex-col gap-2">
        <div className="bg-slate-900/85 backdrop-blur-md px-3 py-2 rounded-lg border border-white/10 shadow-xl">
          <span className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500 block leading-none mb-1">Diameter</span>
          <span className="text-lg font-bold text-white leading-none">
            {(initialDiameter ?? 0).toFixed(1)}<span className="text-xs text-sky-400 ml-1">mm</span>
          </span>
        </div>

        {enabledLayers.length > 0 && (
          <div className="bg-slate-900/85 backdrop-blur-md px-3 py-2.5 rounded-lg border border-white/10 shadow-xl">
            <span className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500 block leading-none mb-2">Planes</span>
            <div className="flex flex-col gap-1.5">
              {enabledLayers.map((layer, idx) => {
                const vis   = planeVisibility[layer.id] ?? true;
                const ghost = planeTransparent[layer.id] ?? false;
                const dot   = PLANE_DOTS[idx] ?? '#94a3b8';
                return (
                  <div key={layer.id} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background: dot}}/>
                    <span className="text-[11px] font-medium text-slate-300 flex-1 min-w-0 truncate">{layer.name}</span>
                    <button
                      onClick={() => toggleVisibility(layer.id)}
                      title={vis ? 'Hide' : 'Show'}
                      className={`p-1.5 rounded-md transition-all border ${
                        vis ? 'bg-sky-500/20 border-sky-500/40 text-sky-300 hover:bg-sky-500/35'
                            : 'bg-slate-700/50 border-slate-600/40 text-slate-500 hover:bg-slate-600/50'
                      }`}
                    ><EyeIcon visible={vis}/></button>
                    <button
                      onClick={() => toggleTransparent(layer.id)}
                      title={ghost ? 'Make opaque' : 'Make transparent'}
                      className={`p-1.5 rounded-md transition-all border ${
                        ghost ? 'bg-cyan-500/25 border-cyan-400/50 text-cyan-300 hover:bg-cyan-500/40'
                              : 'bg-slate-700/50 border-slate-600/40 text-slate-400 hover:bg-slate-600/50'
                      }`}
                    ><GhostIcon/></button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Top-right: identify disconnected bodies toggle */}
      <div className="absolute top-3 right-3 z-40">
        <button
          onClick={() => setBodyColorMode(b => !b)}
          title="Toggle body colour mode — each mesh body gets a unique colour to identify disconnected parts after slot cuts"
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border shadow-xl backdrop-blur-md transition-all text-xs font-semibold ${
            bodyColorMode
              ? 'bg-violet-600/80 border-violet-400/60 text-white'
              : 'bg-slate-900/85 border-white/10 text-slate-300 hover:bg-slate-800/90 hover:text-white'
          }`}
        >
          <BodyColorIcon/>
          <span className="hidden sm:inline">{bodyColorMode ? 'Body Colours ON' : 'Identify Bodies'}</span>
        </button>
      </div>

      {/* Undo/Redo */}
      {(canUndo || canRedo) && (
        <div className="absolute bottom-4 left-4 z-40 flex gap-2">
          <button onClick={undo} disabled={!canUndo}
            className="p-2 bg-slate-800/80 backdrop-blur rounded-lg text-white disabled:opacity-30 hover:bg-sky-500 transition-all shadow-lg border border-white/5">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/>
            </svg>
          </button>
          <button onClick={redo} disabled={!canRedo}
            className="p-2 bg-slate-800/80 backdrop-blur rounded-lg text-white disabled:opacity-30 hover:bg-sky-500 transition-all shadow-lg border border-white/5">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6"/>
            </svg>
          </button>
        </div>
      )}

      {/* Bottom-right: dynamic XYZ gizmo + home */}
      <div className="absolute bottom-4 right-4 z-40 flex flex-col items-center gap-2">
        <div className="bg-slate-900/75 backdrop-blur-md rounded-xl border border-white/10 shadow-xl p-1.5">
          <XYZGizmo camera={cameraRef.current}/>
          <div className="text-center mt-0.5">
            <span className="text-[8px] font-bold uppercase tracking-widest text-slate-500">Orientation</span>
          </div>
        </div>
        <button
          onClick={() => controlsRef.current?.reset()}
          title="Reset camera"
          className="p-2.5 bg-slate-900/85 backdrop-blur-md hover:bg-sky-500 text-slate-300 hover:text-white rounded-xl border border-white/10 shadow-xl transition-all active:scale-90"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
          </svg>
        </button>
      </div>
    </div>
  );
};

export default Snowflake3D;
