
import * as THREE from 'three';
// @ts-ignore
import { Brush, Evaluator, SUBTRACTION, ADDITION } from 'three-bvh-csg';

const evaluator = new Evaluator();
evaluator.attributes = ['position', 'normal'];
evaluator.useGroups = false;

self.onmessage = (e) => {
    const { base, slots, rotation } = e.data;

    // Helper to recreate geometry from buffer data
    const parseGeometry = (data: any) => {
        const geo = new THREE.BufferGeometry();
        if (data.position) geo.setAttribute('position', new THREE.Float32BufferAttribute(data.position, 3));
        if (data.normal) geo.setAttribute('normal', new THREE.Float32BufferAttribute(data.normal, 3));
        if (data.index) geo.setIndex(new THREE.BufferAttribute(data.index, 1));
        return geo;
    };

    let baseGeo: THREE.BufferGeometry | null = null;
    let toolBrush: Brush | null = null;

    try {
        baseGeo = parseGeometry(base);
        // Ensure base has normals for CSG
        if (!baseGeo.attributes.normal) baseGeo.computeVertexNormals();
        
        const baseBrush = new Brush(baseGeo);
        baseBrush.updateMatrixWorld();

        for (const slotData of slots) {
            const slotGeo = parseGeometry(slotData);
            
            // Apply rotation logic inside worker to match the layer orientation
            // The slot generation created them at origin, we rotate them to cut through the rotated plane correctly
            slotGeo.rotateX(rotation.x * Math.PI / 180);
            slotGeo.rotateY(rotation.y * Math.PI / 180);
            
            const brush = new Brush(slotGeo);
            brush.updateMatrixWorld();

            if (!toolBrush) {
                toolBrush = brush;
            } else {
                const nextTool = evaluator.evaluate(toolBrush, brush, ADDITION);
                // Clean up intermediate geometry to prevent memory leaks in worker
                if (toolBrush.geometry !== brush.geometry) toolBrush.geometry.dispose(); 
                brush.geometry.dispose();
                toolBrush = nextTool;
            }
        }

        if (!toolBrush) {
            // No slots, return original data
            const pos = base.position;
            const norm = base.normal;
            const idx = base.index;
            (self as any).postMessage({ position: pos, normal: norm, index: idx });
            return;
        }

        toolBrush.updateMatrixWorld();
        const result = evaluator.evaluate(baseBrush, toolBrush, SUBTRACTION);
        
        // Clean up
        toolBrush.geometry.dispose();
        baseGeo.dispose();

        const resGeo = result.geometry;
        const position = resGeo.attributes.position.array;
        const normal = resGeo.attributes.normal?.array;
        const index = resGeo.index?.array;

        // Use Transferables for performance
        const transferables: Transferable[] = [position.buffer];
        if (normal) transferables.push(normal.buffer);
        if (index) transferables.push(index.buffer);

        (self as any).postMessage({
            position,
            normal,
            index
        }, transferables);

    } catch (error) {
        console.error("Worker CSG Error:", error);
        // Fallback: return original if calculation fails
        (self as any).postMessage({ 
            position: base.position, 
            normal: base.normal, 
            index: base.index 
        });
    }
};
