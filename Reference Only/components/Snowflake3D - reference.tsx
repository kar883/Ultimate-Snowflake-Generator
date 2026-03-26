
import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { SnowflakeConfig, ShortcutConfig } from '../types';
import { InfoTooltip } from './Tooltip';
import { modelCache3D, hashConfig, clearGeometryCache } from '../geometryCache';
import { useTranslation } from '../translations';
import { RealTimeProgressIndicator } from './RealTimeProgressIndicator';
import { useFreeFloatingDetection } from '../hooks/useFreeFloatingDetection';

interface Snowflake3DProps {
  config: SnowflakeConfig;
  generateMesh: (onProgress: (p: number, stage?: string, stageProgress?: number) => void) => Promise<THREE.Group>;
  color: string;
  undo?: () => void;
  redo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  initialDiameter?: number;
  shortcuts?: ShortcutConfig;
  isVisible: boolean;
  detectFreeFloatingBodies?: (config: SnowflakeConfig) => string[];
}

const Snowflake3D: React.FC<Snowflake3DProps> = ({ config, generateMesh, color, undo, redo, canUndo, canRedo, initialDiameter, shortcuts, isVisible, detectFreeFloatingBodies }) => {
  const { t } = useTranslation(config.language || 'en');
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const meshGroupRef = useRef<THREE.Group | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const isVisibleRef = useRef(isVisible);
  
  // Use the free floating detection hook
  const { freeFloatingLayers: workerFreeFloatingLayers, isDetecting, startDetection } = useFreeFloatingDetection();
  
  const [loading, setLoading] = useState(false);
  const [layerStates, setLayerStates] = useState<Record<string, { visible: boolean; transparent: boolean }>>({});
  const [showGrid, setShowGrid] = useState(false);
  // Use initialDiameter prop as default state
  const [modelDiameter, setModelDiameter] = useState(initialDiameter || 0);
  
  // Real-time progress state
  const [progress, setProgress] = useState(0);
  const [progressStage, setProgressStage] = useState('');
  const [stageProgress, setStageProgress] = useState(0);

  // Start free floating detection when config changes and checkbox is active
  useEffect(() => {
    if (config.freeFloatingCheck && isVisible) {
      startDetection(config);
    } else {
      // Clear results when checkbox is disabled
      // The hook will handle clearing the layers
    }
  }, [config, config.freeFloatingCheck, isVisible, startDetection]);

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
    camera.position.set(100, -100, 400); // Better angle to see edge-on planes
    camera.up.set(0, 0, 1);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ 
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
        failIfMajorPerformanceCaveat: false
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limit pixel ratio for performance
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
    dirLight.shadow.mapSize.width = 1024; // Reduced for performance
    dirLight.shadow.mapSize.height = 1024; // Reduced for performance
    dirLight.shadow.camera.near = 0.1;
    dirLight.shadow.camera.far = 2000;
    dirLight.shadow.camera.left = -500;
    dirLight.shadow.camera.right = 500;
    dirLight.shadow.camera.top = 500;
    dirLight.shadow.camera.bottom = -500;
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
    
    // Debounce to prevent multiple rapid cache checks
    const debounceTimer = setTimeout(() => {
      if (!active) return;
      
      const load = async () => {
        if (!sceneRef.current) return;

        // Check cache first - don't clear automatically
        let group = modelCache3D.get(configHash);
        let needsGeneration = !group;

        // Validate cached model before using it
        if (group) {
            const isValidCachedModel = group.children.length > 0 && 
                group.children.every(child => child instanceof THREE.Mesh && child.geometry);
            
            // CRITICAL FIX: Compare against TOTAL layers, not enabled layers
            // The app generates all layers (even disabled) for instant toggling
            const totalLayersInConfig = config.layers.length;
            const cachedLayerCount = group.children.length;
            
            // Only invalidate if layer structure actually changed
            const layerCountMismatch = totalLayersInConfig !== cachedLayerCount;
            
            if (!isValidCachedModel) {
                console.log(`🔍 CACHE INVALID - Cached model has invalid geometry`);
                modelCache3D.delete(configHash);
                group = null;
                needsGeneration = true;
            } else if (layerCountMismatch) {
                console.log(`🔍 CACHE INVALID - Layer count changed: ${cachedLayerCount} → ${totalLayersInConfig}`);
                modelCache3D.delete(configHash);
                group = null;
                needsGeneration = true;
            } else {
                // Cache is valid - just toggling visibility
                const enabledCount = config.layers.filter(l => l.enabled).length;
                // Reduce console spam - only log 10% of the time
                if (Math.random() < 0.1) {
                    console.log(`✅ CACHE HIT - Using cached model (${enabledCount}/${totalLayersInConfig} layers visible)`);
                }
            }
        }

        if (needsGeneration) {
            setLoading(true);
            setProgress(0);
            setProgressStage('Starting 3D generation...');
        }

        try {
            if (needsGeneration) {
                // Generate mesh with real-time progress feedback
                group = await generateMesh((totalProgress, stage, currentStageProgress) => {
                    setProgress(totalProgress);
                    setProgressStage(stage || 'Processing...');
                    setStageProgress(currentStageProgress || totalProgress);
                });

                if (!active) return;

                // Cache clearing is no longer necessary - the cache issue has been resolved
                // with the performance optimizations that eliminated duplicate clearGeometryCache() calls
                // modelCache3D.clear();
                // console.log(`🔍 CACHE CLEARED - Forcing fresh generation due to missing Cross Plane`);

                // Cache the generated mesh
                if (group) {
                  modelCache3D.set(configHash, group.clone());
                } else {
                  console.warn('Warning: Generated mesh group is undefined, skipping cache');
                }
            } else {
                // Use cached mesh - clone it for this instance
                console.log(`🔍 USING CACHED MESH - Checking contents before clone:`);
                const cachedGroup = modelCache3D.get(configHash);
                if (cachedGroup) {
                    console.log(`🔍 CACHED GROUP CONTENTS: ${cachedGroup.children.length} children`);
                    cachedGroup.children.forEach((child, index) => {
                        console.log(`  Cached Child ${index}:`, {
                            name: (child as THREE.Mesh).name || 'unnamed',
                            type: child.type,
                            isMesh: child instanceof THREE.Mesh,
                            visible: (child as THREE.Mesh).visible
                        });
                    });
                }
                if (cachedGroup) {
                    group = cachedGroup.clone();
                } else {
                    console.warn('Warning: Cached group is undefined, regenerating...');
                    // Fallback: regenerate the mesh
                    group = await generateMesh((totalProgress, stage, currentStageProgress) => {
                        setProgress(totalProgress);
                        setProgressStage(stage || 'Recovering from cache error...');
                        setStageProgress(currentStageProgress || totalProgress);
                    });
                }
            }

            if (!active) return;

            // CRITICAL DEBUG: Check group contents RIGHT BEFORE material application
            // Only log in development mode and reduce frequency
            if (process.env.NODE_ENV === 'development' && Math.random() < 0.1 && group && group.children) {
              console.log(`🔍 PRE-MATERIAL GROUP CONTENTS: ${group.children.length} children`);
              group.children.forEach((child, index) => {
                  console.log(`  Pre-Material Child ${index}:`, {
                      name: (child as THREE.Mesh).name || 'unnamed',
                      type: child.type,
                      isMesh: child instanceof THREE.Mesh,
                      visible: (child as THREE.Mesh).visible
                  });
              });
            }

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

            // Create red material for free floating bodies
            const redMat = new THREE.MeshStandardMaterial({
                color: new THREE.Color(0xff0000),
                roughness: 0.2,
                metalness: 0.1,
                side: THREE.DoubleSide
            });

            // Create warning material for free floating bodies (white if model color has R > G or B)
            const modelColor = new THREE.Color(color);
            const shouldUseWhiteWarning = modelColor.r > modelColor.g || modelColor.r > modelColor.b;
            const warningMat = new THREE.MeshStandardMaterial({
                color: new THREE.Color(0xffffff),
                roughness: 0.2,
                metalness: 0.1,
                side: THREE.DoubleSide
            });

            // Free floating layers are now provided by the web worker hook
            // Only process when checkbox is active and we have results
            const freeFloatingLayers = config.freeFloatingCheck ? workerFreeFloatingLayers : [];

            // Measure Diameter: Calculate Max Radius from (0,0) across all vertices
            // We do this BEFORE centering the group to get the true design radius
            let maxRadiusSq = 0;

            // CRITICAL DEBUG: Check what's being traversed
            // Only log in development mode and reduce frequency
            if (process.env.NODE_ENV === 'development' && Math.random() < 0.1 && group && group.children) {
              console.log(`🔍 TRAVERSAL DEBUG: Group has ${group.children.length} children`);
              group.children.forEach((child, index) => {
                  console.log(`  Traverse Child ${index}:`, {
                      name: (child as THREE.Mesh).name || 'unnamed',
                      type: child.type,
                      isMesh: child instanceof THREE.Mesh,
                      visible: (child as THREE.Mesh).visible
                  });
              });
            }

            // CRITICAL: Set visibility BEFORE any traverse operations
            // This ensures disabled layers are hidden before processing
            if (group && group.traverse) {
                group.traverse(c => {
                    if (c instanceof THREE.Mesh) {
                        const id = c.userData.layerId;
                        const layerConf = config.layers.find(l => l.id === id);
                        const isGloballyEnabled = layerConf ? layerConf.enabled : true;
                    const state = layerStates[id];
                    const isVisible = state ? state.visible : isGloballyEnabled;
                    
                    // Apply same visibility logic as applyLayerStates
                    const isSingleLayerMode = config.layers.filter(l => l.enabled).length === 1;
                    const isOnlyActiveLayer = isSingleLayerMode && isGloballyEnabled;
                    const shouldShowInSingleMode = !isSingleLayerMode || isOnlyActiveLayer;
                    
                    c.visible = isVisible && isGloballyEnabled && shouldShowInSingleMode;
                }
            });
            }

            if (group && group.traverse) {
            group.traverse(c => {
                if (c instanceof THREE.Mesh) {
                    // Only process visible meshes for free floating detection
                    if (!c.visible) {
                        // Skip invisible meshes entirely
                        return;
                    }
                    
                    // Only log in development mode and reduce frequency
                    if (process.env.NODE_ENV === 'development' && Math.random() < 0.1) {
                      console.log(`🔍 TRAVERSE: Processing visible mesh ${(c as THREE.Mesh).name || 'unnamed'}`);
                    }
                    
                    // Check if this mesh is a free floating body - only when checkbox is active
                    const meshName = (c as THREE.Mesh).name || '';
                    const meshId = (c as THREE.Mesh).userData.layerId || '';
                    
                    // More robust free floating detection - only when checkbox is active
                    let isFreeFloating = false;
                    if (config.freeFloatingCheck && freeFloatingLayers.length > 0) {
                        isFreeFloating = freeFloatingLayers.some(layerName => {
                            const lowerLayerName = layerName.toLowerCase();
                            const lowerMeshName = meshName.toLowerCase();
                            const lowerMeshId = meshId.toLowerCase();
                            
                            // Check multiple ways the layer might be identified
                            return lowerMeshName.includes(lowerLayerName) ||
                                   lowerLayerName.includes(lowerMeshName) ||
                                   lowerMeshId.includes(lowerLayerName) ||
                                   lowerLayerName.includes(lowerMeshId) ||
                                   (lowerMeshName.includes('base') && lowerLayerName.includes('base')) ||
                                   (lowerMeshName.includes('cross') && lowerLayerName.includes('cross')) ||
                                   (lowerMeshName.includes('tilt') && lowerLayerName.includes('tilt'));
                        });
                    }
                    
                    // Only log free floating check in development mode when checkbox is active and reduce frequency
                    if (config.freeFloatingCheck && process.env.NODE_ENV === 'development' && Math.random() < 0.1) {
                      console.log(`🔍 FREE FLOATING CHECK: mesh="${meshName}", id="${meshId}", freeFloating=${isFreeFloating}, freeFloatingLayers=${JSON.stringify(freeFloatingLayers)}`);
                    }
                    
                    // Apply appropriate material
                    if (isFreeFloating) {
                        c.material = shouldUseWhiteWarning ? warningMat.clone() : redMat.clone();
                        // Only log free floating warnings in development mode and reduce frequency
                        if (process.env.NODE_ENV === 'development' && Math.random() < 0.1) {
                          console.log(`🚨 FREE FLOATING: Applied ${shouldUseWhiteWarning ? 'white' : 'red'} material to ${meshName}`);
                        }
                    } else {
                        c.material = mat.clone();
                    }
                    
                    c.castShadow = true;
                    c.receiveShadow = true;

                    // CRITICAL DEBUG: Check material application
                    if (process.env.NODE_ENV === 'development' && Math.random() < 0.1) {
                      console.log(`🎯 MATERIAL DEBUG for mesh ${(c as THREE.Mesh).name}:`);
                      console.log(`  - Material exists: ${!!c.material}`);
                      console.log(`  - Material type: ${c.material?.type}`);
                      console.log(`  - Material color:`, (c.material as THREE.MeshStandardMaterial).color);
                      console.log(`  - Material visible: ${c.visible}`);
                      console.log(`  - Mesh in scene: ${c.parent?.type === 'Group'}`);
                    }
                }
            });

            // Center the group visually (Bounding Box Center)
            const box = new THREE.Box3().setFromObject(group);
            const center = box.getCenter(new THREE.Vector3());
            group.position.x = -center.x;
            group.position.y = -center.y;

            sceneRef.current.add(group);
            meshGroupRef.current = group;

            // CRITICAL: Apply layer states IMMEDIATELY after mesh creation
            // This ensures traverse operations see correct visibility
            applyLayerStates();

            // Additional safety check: Ensure visibility is properly set before traverse
            if (group && group.traverse) {
                group.traverse(c => {
                    if (c instanceof THREE.Mesh) {
                    const id = c.userData.layerId;
                    const layerConf = config.layers.find(l => l.id === id);
                    const isGloballyEnabled = layerConf ? layerConf.enabled : true;
                    const state = layerStates[id];
                    const isVisible = state ? state.visible : isGloballyEnabled;
                    
                    // Apply same visibility logic as applyLayerStates
                    const isSingleLayerMode = config.layers.filter(l => l.enabled).length === 1;
                    const isOnlyActiveLayer = isSingleLayerMode && isGloballyEnabled;
                    const shouldShowInSingleMode = !isSingleLayerMode || isOnlyActiveLayer;
                    
                    c.visible = isVisible && isGloballyEnabled && shouldShowInSingleMode;
                }
            });
            }

            // Force one render to update the view even if hidden (updates GPU buffers)
            if (rendererRef.current && sceneRef.current && cameraRef.current) {
                rendererRef.current.render(sceneRef.current, cameraRef.current);
            }
        }

        } catch (e) {
            console.error(e);
        } finally {
            if (active && needsGeneration) {
                setLoading(false);
                // Reset progress state
                setProgress(0);
                setProgressStage('');
                setStageProgress(0);
            }
        }
      };

      // Start loading immediately (will be instant if cached)
      load();
    }, 100); // 100ms debounce delay

    return () => {
      active = false;
      clearTimeout(debounceTimer);
    };
  }, [config, generateMesh, color]);

  const applyLayerStates = () => {
      if (!meshGroupRef.current) return;
      meshGroupRef.current.children.forEach(c => {
          if (c instanceof THREE.Mesh) {
              const id = c.userData.layerId;
              
              // Resolve global visibility from config
              const layerConf = config.layers.find(l => l.id === id);
              const isGloballyEnabled = layerConf ? layerConf.enabled : true;

              const state = layerStates[id];
              if (c.material instanceof THREE.MeshStandardMaterial) {
                  // CRITICAL FIX: Check if this layer should be visible in current mode
                  const isVisible = state ? state.visible : isGloballyEnabled;
                  
                  // Additional check: In single-layer mode, only show the active layer
                  const isSingleLayerMode = config.layers.filter(l => l.enabled).length === 1;
                  const isOnlyActiveLayer = isSingleLayerMode && isGloballyEnabled;
                  const shouldShowInSingleMode = !isSingleLayerMode || isOnlyActiveLayer;
                  
                  c.visible = isVisible && isGloballyEnabled && shouldShowInSingleMode;
                  c.material.transparent = state ? state.transparent : false;
                  c.material.opacity = c.material.transparent ? 0.05 : 1.0;
                  c.material.depthWrite = !c.material.transparent;
                  c.material.needsUpdate = true;
                  
                  // Only log plane visibility in development mode and reduce frequency
                  if (process.env.NODE_ENV === 'development' && Math.random() < 0.1) {
                    console.log(`🔍 ${layerConf?.name || 'Unknown'}: visible=${c.visible}, enabled=${isGloballyEnabled}, state=${JSON.stringify(state)}`);
                  }
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
      
      {/* Top Left Controls: Diameter + Grid + Layers */}
      <div className="absolute top-4 left-4 z-40 max-h-[85%] overflow-y-auto custom-scrollbar flex flex-col gap-2">
          
          {/* Diameter Display */}
          <div className="bg-slate-900/80 backdrop-blur px-3 py-2 rounded-lg border border-white/10 shadow-lg">
             <span className="text-[10px] font-black uppercase text-slate-500 block mb-0.5">{t('Diameter')}</span>
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
              <span className="text-[10px] font-black uppercase tracking-wider">{showGrid ? t('Grid On') : t('Grid Off')}</span>
          </button>

          {/* Layer Controls - Compact */}
          <div className="flex flex-col gap-1">
             {config.layers.filter(l => l.enabled).map(layer => {
                 const state = layerStates[layer.id] || { visible: true, transparent: false };
                 return (
                    <div key={layer.id} className="flex items-center gap-1 bg-slate-900/80 backdrop-blur p-1.5 rounded-lg border border-white/10 shadow-lg group/layer">
                       <span className="text-[10px] font-bold text-slate-300 w-20 truncate pl-1" title={t(layer.name)}>{t(layer.name)}</span>
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
      <div className="absolute bottom-8 right-8 z-40">
         <InfoTooltip label={t('Reset View')} placement="left" description={t('Reset View_desc')}>
             <button 
               className="p-6 bg-slate-900/80 hover:bg-sky-500 text-white rounded-[2rem] border border-white/10 shadow-2xl backdrop-blur-xl transition-all active:scale-90 group"
               onClick={() => {
                  if (controlsRef.current) {
                     controlsRef.current.reset();
                     cameraRef.current?.position.set(0, -300, 200);
                     cameraRef.current?.lookAt(0, 0, 0);
                  }
               }}
             >
               <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
             </button>
         </InfoTooltip>
      </div>
      
      {/* Real-time Progress Indicator */}
      <RealTimeProgressIndicator 
        progress={progress}
        stage={progressStage}
        stageProgress={stageProgress}
        isVisible={loading}
        slotCuttingActive={loading && progressStage.toLowerCase().includes('slot')}
      />
    </div>
  );
};

export default Snowflake3D;
