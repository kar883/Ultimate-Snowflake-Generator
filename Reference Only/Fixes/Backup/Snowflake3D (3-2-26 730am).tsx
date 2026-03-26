import React, { useRef, useEffect, useState } from 'react';
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
import { InfoTooltip } from './Tooltip';

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

const Snowflake3D: React.FC<Snowflake3DProps> = ({ config, generateMesh, color, undo, redo, canUndo, canRedo, initialDiameter, shortcuts, isVisible }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const composerRef = useRef<EffectComposer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const meshGroupRef = useRef<THREE.Group | null>(null);
  const isVisibleRef = useRef(isVisible);
  
  const [loading, setLoading] = useState(false);
  const [modelDiameter, setModelDiameter] = useState(initialDiameter || 0);
  
  // Dynamic orientation state
  const [cameraOrientation, setCameraOrientation] = useState({ x: 0, y: 0, z: 0 });

  // Plane visibility and transparency state - each plane can be toggled independently
  const [planeVisibility, setPlaneVisibility] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    config.layers.forEach((layer, index) => {
      initial[layer.id] = layer.enabled;
    });
    return initial;
  });
  
  const [planeTransparency, setPlaneTransparency] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    config.layers.forEach((layer, index) => {
      initial[layer.id] = 1.0; // Fully opaque by default
    });
    return initial;
  });

  // Separate state for transparency toggle (on/off)
  const [planeTransparencyEnabled, setPlaneTransparencyEnabled] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    config.layers.forEach((layer, index) => {
      initial[layer.id] = false; // Transparency off by default
    });
    return initial;
  });

  useEffect(() => { isVisibleRef.current = isVisible; }, [isVisible]);

  // Sync plane visibility: only initialise NEW layer IDs (never override user toggles).
  // When a plane flips enabled→disabled in config, hide it. enabled→visible only for
  // layers we haven't seen before.
  useEffect(() => {
    setPlaneVisibility(prev => {
      const updated: Record<string, boolean> = { ...prev };
      config.layers.forEach(layer => {
        if (!(layer.id in prev)) {
          // Brand-new layer — default to its enabled state
          updated[layer.id] = layer.enabled;
        } else if (!layer.enabled) {
          // Layer was explicitly disabled in config → always hide it
          updated[layer.id] = false;
        }
        // Otherwise leave the user's toggle alone
      });
      return updated;
    });
    setPlaneTransparencyEnabled(prev => {
      const updated: Record<string, boolean> = { ...prev };
      config.layers.forEach(layer => {
        if (!(layer.id in prev)) updated[layer.id] = false;
      });
      return updated;
    });
    setPlaneTransparency(prev => {
      const updated: Record<string, number> = { ...prev };
      config.layers.forEach(layer => {
        if (!(layer.id in prev)) updated[layer.id] = 1.0;
      });
      return updated;
    });
  }, [config.layers]);

  // Toggle plane visibility
  const togglePlaneVisibility = (layerId: string) => {
    setPlaneVisibility(prev => {
      const newVisibility = !prev[layerId];
      
      // Reset transparency to opaque when toggling visibility
      if (newVisibility) {
        setPlaneTransparency(transparencyPrev => ({
          ...transparencyPrev,
          [layerId]: 1.0 // Fully opaque when becoming visible
        }));
      }
      
      return {
        ...prev,
        [layerId]: newVisibility
      };
    });
  };

  // Toggle transparency for a plane
  const togglePlaneTransparency = (layerId: string) => {
    setPlaneTransparencyEnabled(prev => {
      const newTransparencyEnabled = !prev[layerId];
      
      // Set opacity based on transparency toggle
      setPlaneTransparency(transparencyPrev => ({
        ...transparencyPrev,
        [layerId]: newTransparencyEnabled ? 0.1 : 1.0 // 10% if enabled, 100% if disabled
      }));
      
      return {
        ...prev,
        [layerId]: newTransparencyEnabled
      };
    });
  };
  
  // Update plane transparency
  const updatePlaneTransparency = (layerId: string, opacity: number) => {
    setPlaneTransparency(prev => ({
      ...prev,
      [layerId]: opacity
    }));
  };

  // Immediate visibility update effect
  useEffect(() => {
    if (meshGroupRef.current) {
      meshGroupRef.current.traverse(c => {
        if (c instanceof THREE.Mesh) {
          // Find layerId using same logic as mesh loading
          let layerId = c.userData.layerId;
          if (!layerId) {
            const meshName = c.name || '';
            const enabledLayers = config.layers.filter(l => l.enabled);
            
            if (meshName.includes('base') || meshName.includes('0')) {
              layerId = enabledLayers[0]?.id;
            } else if (meshName.includes('cross') || meshName.includes('1')) {
              layerId = enabledLayers[1]?.id;
            } else if (meshName.includes('tilt') || meshName.includes('2')) {
              layerId = enabledLayers[2]?.id;
            } else {
              const zPos = c.position.z;
              const sortedLayers = [...enabledLayers].sort((a, b) => (a.zOffset || 0) - (b.zOffset || 0));
              if (zPos < -50) {
                layerId = sortedLayers[0]?.id;
              } else if (zPos > 50) {
                layerId = sortedLayers[sortedLayers.length - 1]?.id;
              } else {
                layerId = sortedLayers[1]?.id;
              }
            }
          }
          
          if (layerId) {
            c.visible = planeVisibility[layerId] ?? true;
            // Update transparency immediately
            if (c.material && 'opacity' in c.material) {
              (c.material as any).opacity = planeTransparency[layerId] ?? 1.0;
            }
          }
        }
      });
    }
  }, [planeVisibility, planeTransparency, planeTransparencyEnabled, config.layers]);

  useEffect(() => {
    if (!containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020617);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 2000);
    // Look straight down the Z axis so the flat base plane faces the viewer
    camera.position.set(0, 0, 500);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    
    // Ensure canvas is visible and properly sized
    const canvas = renderer.domElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    const bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.8, 0.4, 0.2);
    composer.addPass(bloomPass);
    composerRef.current = composer;

    // 3-point lighting rig for depth
    scene.add(new THREE.AmbientLight(0x38bdf8, 0.2));
    
    // Key Light - main directional light with shadows
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.5);
    keyLight.position.set(500, 1000, 500);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    scene.add(keyLight);
    
    // Fill Light - cool blue from left
    const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.8);
    fillLight.position.set(-300, 300, 300);
    scene.add(fillLight);
    
    // Rim Light - cold blue from front
    const rimLight = new THREE.DirectionalLight(0x4488ff, 1.0);
    rimLight.position.set(0, 0, 300);
    scene.add(rimLight);

    // Environment Map
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
    panel.position.z = 500;
    envScene.add(panel);
    scene.environment = pmrem.fromScene(envScene).texture;
    pmrem.dispose();

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controlsRef.current = controls;

    const animate = () => {
      requestAnimationFrame(animate);
      if (isVisibleRef.current) {
        controls.update();
        
        // Update camera orientation for dynamic indicator
        if (cameraRef.current) {
          const camera = cameraRef.current;
          const direction = new THREE.Vector3();
          camera.getWorldDirection(direction);
          
          // Calculate Euler angles from direction vector
          const euler = new THREE.Euler();
          euler.setFromQuaternion(camera.quaternion);
          
          setCameraOrientation({
            x: THREE.MathUtils.radToDeg(euler.x),
            y: THREE.MathUtils.radToDeg(euler.y),
            z: THREE.MathUtils.radToDeg(euler.z)
          });
        }
        
        // Render directly without post-processing
        if (rendererRef.current && sceneRef.current && cameraRef.current) {
          rendererRef.current.render(sceneRef.current, cameraRef.current);
        }
      }
    };
    animate();

    const handleResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      containerRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const group = await generateMesh(() => {}, undefined, config);
        
        if (cancelled || !sceneRef.current) return;
        
        if (meshGroupRef.current) {
          sceneRef.current.remove(meshGroupRef.current);
        }

        // Apply final material directly
        const material = new THREE.MeshStandardMaterial({
          color: new THREE.Color(0x38bdf8), // Vibrant sky blue/cyan
          metalness: 0.6,        // High metallic sheen
          roughness: 0.08,       // Very low for sharp reflections
          emissive: new THREE.Color(0x38bdf8),
          emissiveIntensity: 0.05, // Subtle internal glow
          envMapIntensity: 2.0,   // Strong environment reflections
          side: THREE.DoubleSide
        });

        group.traverse(c => { 
          if (c instanceof THREE.Mesh) {
            c.material = material;
            c.geometry.computeVertexNormals();
            c.geometry.computeBoundingBox();
            
            // Center the mesh properly
            const bounds = c.geometry.boundingBox!;
            const center = new THREE.Vector3();
            bounds.getCenter(center);
            c.position.sub(center);
            
            // Apply plane visibility and transparency - find which layer this mesh belongs to
            // and set properties based on planeVisibility and planeTransparency state
            let layerId = c.userData.layerId;
            
            // Fallback: identify plane by mesh name or position if layerId not available
            if (!layerId) {
              const meshName = c.name || '';
              const enabledLayers = config.layers.filter(l => l.enabled);
              
              // Try to identify by mesh name first
              if (meshName.includes('base') || meshName.includes('0')) {
                layerId = enabledLayers[0]?.id;
              } else if (meshName.includes('cross') || meshName.includes('1')) {
                layerId = enabledLayers[1]?.id;
              } else if (meshName.includes('tilt') || meshName.includes('2')) {
                layerId = enabledLayers[2]?.id;
              } else {
                // Fallback: identify by z-position (assuming planes are stacked vertically)
                const zPos = c.position.z;
                const sortedLayers = [...enabledLayers].sort((a, b) => (a.zOffset || 0) - (b.zOffset || 0));
                if (zPos < -50) {
                  layerId = sortedLayers[0]?.id; // Base plane (lowest z)
                } else if (zPos > 50) {
                  layerId = sortedLayers[sortedLayers.length - 1]?.id; // Top plane
                } else {
                  layerId = sortedLayers[1]?.id; // Middle plane (cross)
                }
              }
            }
            
            if (layerId) {
              c.visible = planeVisibility[layerId] ?? true;
              
              // Create individual material for each plane to control transparency
              const planeMaterial = material.clone();
              planeMaterial.transparent = true;
              planeMaterial.opacity = planeTransparency[layerId] ?? 1.0;
              c.material = planeMaterial;
            }
            
            c.castShadow = true;
            c.receiveShadow = true;
            c.frustumCulled = false;
          }
        });
        
        sceneRef.current.add(group);
        meshGroupRef.current = group;
        
      } catch (error) {
        console.error('Snowflake3D: Error generating mesh:', error);
      } finally { 
        setLoading(false);
      }
    };
    
    const timeoutId = setTimeout(load, 100);
    
    return () => { 
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [config, generateMesh]);

  // Update mesh visibility and transparency when plane states change
  useEffect(() => {
    if (meshGroupRef.current) {
      meshGroupRef.current.traverse(c => {
        if (c instanceof THREE.Mesh) {
          const layerId = c.userData.layerId;
          if (layerId) {
            c.visible = planeVisibility[layerId] ?? true;
            
            // Update material transparency
            if (c.material && c.material instanceof THREE.Material) {
              const material = c.material as THREE.MeshStandardMaterial;
              material.transparent = true;
              material.opacity = planeTransparency[layerId] ?? 1.0;
              material.needsUpdate = true;
            }
          }
        }
      });
    }
  }, [planeVisibility, planeTransparency, config]);

  return (
    <div className="relative w-full h-full group">
      <div ref={containerRef} className="w-full h-full bg-slate-950 rounded-xl overflow-hidden" />
      
      {/* Loading Indicator */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 rounded-xl">
          <div className="text-white text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
            <div className="text-sm">Generating Snowflake...</div>
          </div>
        </div>
      )}
      
      {/* UI Controls Restored */}
      <div className="absolute top-4 left-4 z-40 flex flex-col gap-2">
          <div className="bg-slate-900/80 backdrop-blur px-3 py-2 rounded-lg border border-white/10">
             <span className="text-[10px] font-black uppercase text-slate-500 block">Diameter</span>
             <span className="text-xl font-bold text-white">{initialDiameter?.toFixed(1) || "0.0"} <span className="text-sm text-sky-500">mm</span></span>
          </div>
          
          {/* Plane Visibility Controls */}
          <div className="bg-slate-900/80 backdrop-blur px-3 py-2 rounded-lg border border-white/10">
             <span className="text-[10px] font-black uppercase text-slate-500 block">Planes</span>
             <div className="flex flex-col gap-2 mt-1">
               {config.layers.filter(layer => layer.enabled).map((layer, index) => (
                 <div key={layer.id} className="flex items-center gap-2">
                   {/* Visibility Toggle */}
                   <button
                     onClick={() => togglePlaneVisibility(layer.id)}
                     className={`p-2 bg-slate-800/80 rounded-lg text-white disabled:opacity-30 hover:bg-sky-500 transition-all shadow-lg border border-white/5 relative`}
                   >
                     {/* 2D sketch style eye icon */}
                     <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                       {!planeVisibility[layer.id] && (
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M3 3L21 21" className="text-red-500" />
                       )}
                     </svg>
                   </button>
                   
                   {/* Transparency Toggle */}
                   <button
                     onClick={() => togglePlaneTransparency(layer.id)}
                     className={`p-2 rounded-lg text-white transition-all shadow-lg border border-white/5 ${
                       planeTransparencyEnabled[layer.id] 
                         ? 'bg-cyan-500/80 hover:bg-cyan-400' 
                         : 'bg-slate-700/80 hover:bg-slate-600'
                     }`}
                     title="Toggle Transparency"
                   >
                     <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                     </svg>
                   </button>
                   
                   <span className="text-xs text-white truncate max-w-16">
                     {layer.name || `Plane ${index + 1}`}
                   </span>
                 </div>
               ))}
             </div>
          </div>
      </div>

      {(canUndo || canRedo) && (
        <div className="absolute bottom-4 left-4 z-40 flex gap-2">
          <button onClick={undo} disabled={!canUndo} className="p-2 bg-slate-800/80 rounded-lg text-white disabled:opacity-30 hover:bg-sky-500 transition-all shadow-lg border border-white/5">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          </button>
          <button onClick={redo} disabled={!canRedo} className="p-2 bg-slate-800/80 rounded-lg text-white disabled:opacity-30 hover:bg-sky-500 transition-all shadow-lg border border-white/5">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
            </svg>
          </button>
        </div>
      )}

      {/* XYZ Orientation Indicator and Home Button */}
      <div className="absolute bottom-4 right-4 z-40 flex flex-col gap-2">
        {/* XYZ Orientation Indicator */}
        <div className="bg-slate-900/80 backdrop-blur p-3 rounded-lg border border-white/10">
          <svg width="60" height="60" className="block">
            {/* Origin point */}
            <circle cx="30" cy="30" r="2" fill="white" />
            
            {/* X-axis - Red line to the right */}
            <line x1="30" y1="30" x2="50" y2="30" stroke="#ef4444" strokeWidth="2" />
            <text x="52" y="32" fill="#ef4444" fontSize="10" fontWeight="bold">X</text>
            
            {/* Y-axis - Green line up */}
            <line x1="30" y1="30" x2="30" y2="10" stroke="#10b981" strokeWidth="2" />
            <text x="32" y="8" fill="#10b981" fontSize="10" fontWeight="bold">Y</text>
            
            {/* Z-axis - Blue line diagonal (forward) */}
            <line x1="30" y1="30" x2="45" y2="15" stroke="#3b82f6" strokeWidth="2" />
            <text x="47" y="13" fill="#3b82f6" fontSize="10" fontWeight="bold">Z</text>
          </svg>
        </div>
        
        {/* Home Button */}
        <button 
          onClick={() => {
            if (controlsRef.current) {
              controlsRef.current.reset();
            }
          }}
          className="p-3 bg-slate-900/80 hover:bg-sky-500 text-white rounded-[2rem] border border-white/10 shadow-2xl backdrop-blur-xl transition-all active:scale-90 group"
        >
          <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default Snowflake3D;