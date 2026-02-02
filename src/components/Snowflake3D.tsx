
import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { SnowflakeConfig, ShortcutConfig } from '../types';
import { InfoTooltip } from './Tooltip';
import { modelCache3D, hashConfig } from '../geometryCache';

interface Snowflake3DProps {
  config: SnowflakeConfig;
  generateMesh: (onProgress: (p: number) => void) => Promise<THREE.Group>;
  color: string;
  undo?: () => void;
  redo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  initialDiameter?: number;
  shortcuts?: ShortcutConfig;
  isVisible: boolean;
}

const Snowflake3D: React.FC<Snowflake3DProps> = ({ config, generateMesh, color, undo, redo, canUndo, canRedo, initialDiameter, shortcuts, isVisible }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const meshGroupRef = useRef<THREE.Group | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const isVisibleRef = useRef(isVisible);
  
  const [loading, setLoading] = useState(false);
  const [layerStates, setLayerStates] = useState<Record<string, { visible: boolean; transparent: boolean }>>({});
  const [showGrid, setShowGrid] = useState(false);
  // Use initialDiameter prop as default state
  const [modelDiameter, setModelDiameter] = useState(initialDiameter || 0);

  useEffect(() => {
    isVisibleRef.current = isVisible;
  }, [isVisible]);

  useEffect(() => {
      if (initialDiameter) setModelDiameter(initialDiameter);
  }, [initialDiameter]);

  // Initialize Three.js
  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a); // System Default (Slate-900)
    scene.fog = new THREE.FogExp2(0x0f172a, 0.001); // System Default (Slate-900)
    sceneRef.current = scene;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
    camera.position.set(0, -300, 200);
    camera.up.set(0, 0, 1);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0; // System Default
    
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 10;
    controls.maxDistance = 1000;
    controlsRef.current = controls;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4); // System Default
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x1e293b, 1.0); // System Default
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0); // System Default
    dirLight.position.set(500, 1000, 500);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);

    const backLight = new THREE.DirectionalLight(0x38bdf8, 0.5); // System Default
    backLight.position.set(-100, 100, 50);
    scene.add(backLight);

    const gridHelper = new THREE.GridHelper(500, 50, 0x334155, 0x1e293b);
    gridHelper.rotation.x = Math.PI / 2;
    gridHelper.visible = showGrid;
    scene.add(gridHelper);
    gridHelperRef.current = gridHelper;

    let animationId: number;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      if (isVisibleRef.current) {
        controls.update();
        renderer.render(scene, camera);
      }
    };
    animate();

    const handleResize = () => {
      if (!containerRef.current || !camera || !renderer) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      // Force render on resize even if hidden to update buffer
      renderer.render(scene, camera);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Update Grid Visibility
  useEffect(() => {
    if (gridHelperRef.current) {
        gridHelperRef.current.visible = showGrid;
    }
  }, [showGrid]);

  // Sync Layer States
  useEffect(() => {
    setLayerStates(prev => {
        const next = { ...prev };
        config.layers.forEach(l => {
            // Initialize if missing. Default to visible.
            if (!next[l.id]) {
                next[l.id] = { visible: true, transparent: false };
            }
        });
        return next;
    });
  }, [config.layers]);

  // Generate Mesh with Caching
  useEffect(() => {
    let active = true;
    const configHash = hashConfig(config);

    const load = async () => {
        if (!sceneRef.current) return;

        // Check cache first
        let group = modelCache3D.get(configHash);
        let needsGeneration = !group;

        if (needsGeneration) {
            setLoading(true);
        }

        try {
            if (needsGeneration) {
                // Generate mesh in background
                group = await generateMesh(() => {
                    // Progress callback - could be used for loading indicator
                });

                if (!active) return;

                // Cache the generated mesh
                modelCache3D.set(configHash, group.clone());
            } else {
                // Use cached mesh - clone it for this instance
                group = group.clone();
            }

            if (!active) return;

            // Clean up previous mesh
            if (meshGroupRef.current) {
                sceneRef.current.remove(meshGroupRef.current);
                meshGroupRef.current.traverse(c => {
                    if (c instanceof THREE.Mesh) {
                        c.geometry.dispose();
                        if (Array.isArray(c.material)) c.material.forEach((m:any) => m.dispose());
                        else c.material.dispose();
                    }
                });
            }

            // Apply Material
            const mat = new THREE.MeshStandardMaterial({
                color: new THREE.Color(color),
                roughness: 0.2,
                metalness: 0.1,
                side: THREE.DoubleSide
            });

            // Measure Diameter: Calculate Max Radius from (0,0) across all vertices
            // We do this BEFORE centering the group to get the true design radius
            let maxRadiusSq = 0;

            group.traverse(c => {
                if (c instanceof THREE.Mesh) {
                    c.material = mat.clone(); // Clone material to allow individual transparency
                    c.castShadow = true;
                    c.receiveShadow = true;

                    if (c.geometry) {
                        const pos = c.geometry.attributes.position;
                        if (pos) {
                            for (let i = 0; i < pos.count; i++) {
                                const x = pos.getX(i);
                                const y = pos.getY(i);
                                // Z is ignored for diameter calculation as we want the planar extent
                                const distSq = x * x + y * y;
                                if (distSq > maxRadiusSq) {
                                    maxRadiusSq = distSq;
                                }
                            }
                        }
                    }
                }
            });

            const calculatedDiameter = Math.sqrt(maxRadiusSq) * 2;
            setModelDiameter(calculatedDiameter);

            // Center the group visually (Bounding Box Center)
            const box = new THREE.Box3().setFromObject(group);
            const center = box.getCenter(new THREE.Vector3());
            group.position.x = -center.x;
            group.position.y = -center.y;

            sceneRef.current.add(group);
            meshGroupRef.current = group;

            // Trigger layer state application
            applyLayerStates();

            // Force one render to update the view even if hidden (updates GPU buffers)
            if (rendererRef.current && sceneRef.current && cameraRef.current) {
                rendererRef.current.render(sceneRef.current, cameraRef.current);
            }

        } catch (e) {
            console.error(e);
        } finally {
            if (active && needsGeneration) setLoading(false);
        }
    };

    // Start loading immediately (will be instant if cached)
    load();

    return () => { active = false; };
  }, [config, generateMesh, color]);

  const applyLayerStates = () => {
      if (!meshGroupRef.current) return;
      meshGroupRef.current.children.forEach(c => {
          if (c instanceof THREE.Mesh) {
              const id = c.userData.layerId;
              
              // Resolve global visibility from config
              const layerConf = config.layers.find(l => l.id === id);
              // CRITICAL FIX: If layer is disabled in main config, hide mesh regardless of local state
              const isGloballyEnabled = layerConf ? layerConf.enabled : true;

              const state = layerStates[id];
              if (state && c.material instanceof THREE.MeshStandardMaterial) {
                  // Mesh is visible only if locally visible AND globally enabled
                  c.visible = state.visible && isGloballyEnabled;
                  c.material.transparent = state.transparent;
                  c.material.opacity = state.transparent ? 0.05 : 1.0; // Reduced to 0.05 for minimal visibility
                  c.material.depthWrite = !state.transparent;
                  c.material.needsUpdate = true;
              }
          }
      });
  };

  useEffect(() => {
      applyLayerStates();
  }, [layerStates]);

  const toggleLayer = (id: string, prop: 'visible' | 'transparent') => {
      setLayerStates(prev => ({
          ...prev,
          [id]: { ...prev[id], [prop]: !prev[id][prop] }
      }));
  };

  return (
    <div className="relative w-full h-full group">
      <div ref={containerRef} className="w-full h-full bg-slate-900/40 rounded-xl overflow-hidden shadow-inner cursor-move" />
      
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm z-50">
           <div className="flex flex-col items-center p-8 bg-slate-800 rounded-2xl shadow-2xl border border-white/10">
              <div className="w-16 h-16 border-4 border-slate-600 border-t-sky-500 rounded-full animate-spin mb-4"></div>
              <div className="text-xl font-bold text-white mb-2">Generating Model</div>
           </div>
        </div>
      )}

      {/* Top Left Controls: Diameter + Grid + Layers */}
      <div className="absolute top-4 left-4 z-40 max-h-[85%] overflow-y-auto custom-scrollbar flex flex-col gap-2">
          
          {/* Diameter Display */}
          <div className="bg-slate-900/80 backdrop-blur px-3 py-2 rounded-lg border border-white/10 shadow-lg">
             <span className="text-[10px] font-black uppercase text-slate-500 block mb-0.5">Diameter</span>
             <span className="text-xl font-bold text-white leading-none">{modelDiameter.toFixed(1)} <span className="text-sm text-sky-500">mm</span></span>
          </div>

          {/* Grid Toggle */}
          <button 
              onClick={() => setShowGrid(!showGrid)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border backdrop-blur transition-all ${showGrid ? 'bg-sky-600/90 border-sky-500 text-white shadow-lg' : 'bg-slate-900/80 border-white/10 text-slate-400 hover:bg-slate-800'}`}
          >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 01-2 2v-2z" />
              </svg>
              <span className="text-[10px] font-black uppercase tracking-wider">{showGrid ? 'Grid On' : 'Grid Off'}</span>
          </button>

          {/* Layer Controls - Compact */}
          <div className="flex flex-col gap-1">
             {config.layers.filter(l => l.enabled).map(layer => {
                 const state = layerStates[layer.id] || { visible: true, transparent: false };
                 return (
                    <div key={layer.id} className="flex items-center gap-1 bg-slate-900/80 backdrop-blur p-1.5 rounded-lg border border-white/10 shadow-lg group/layer">
                       <span className="text-[10px] font-bold text-slate-300 w-20 truncate pl-1" title={layer.name}>{layer.name}</span>
                       <button 
                         onClick={() => toggleLayer(layer.id, 'visible')}
                         className={`p-1.5 rounded transition-colors ${state.visible ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white' : 'bg-slate-800 text-slate-600 hover:text-slate-400'}`}
                         title="Toggle Visibility"
                       >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={state.visible ? "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 5 8.268 7.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" : "M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"} /></svg>
                       </button>
                       <button 
                         onClick={() => toggleLayer(layer.id, 'transparent')}
                         className={`p-1.5 rounded transition-colors ${state.transparent ? 'bg-sky-500/20 text-sky-400 hover:bg-sky-500 hover:text-white' : 'bg-slate-800 text-slate-600 hover:text-slate-400'}`}
                         title="Toggle Transparency"
                       >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" /></svg>
                       </button>
                    </div>
                 );
             })}
          </div>
      </div>

      {/* Undo/Redo */}
      {(canUndo || canRedo) && (
        <div className="absolute bottom-4 left-4 z-40 flex gap-2">
            <InfoTooltip label="Undo" shortcut={shortcuts?.undo}>
                <button onClick={undo} disabled={!canUndo} className="p-3 bg-slate-800/80 rounded-xl text-white disabled:opacity-30 hover:bg-sky-500 transition-all shadow-lg border border-white/5 backdrop-blur">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                </button>
            </InfoTooltip>
            <InfoTooltip label="Redo" shortcut={shortcuts?.redo}>
                <button onClick={redo} disabled={!canRedo} className="p-3 bg-slate-800/80 rounded-xl text-white disabled:opacity-30 hover:bg-sky-500 transition-all shadow-lg border border-white/5 backdrop-blur">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" /></svg>
                </button>
            </InfoTooltip>
        </div>
      )}

      {/* Reset View */}
      <div className="absolute bottom-6 right-6 z-40">
         <InfoTooltip label="Reset View" placement="left" description="Reset camera position to default.">
             <button 
               className="p-4 bg-slate-900/80 hover:bg-sky-600 text-white rounded-full backdrop-blur shadow-2xl border border-white/10 transition-all active:scale-90"
               onClick={() => {
                  if (controlsRef.current) {
                     controlsRef.current.reset();
                     cameraRef.current?.position.set(0, -300, 200);
                     cameraRef.current?.lookAt(0, 0, 0);
                  }
               }}
             >
               <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
               </svg>
             </button>
         </InfoTooltip>
      </div>
    </div>
  );
};

export default Snowflake3D;
