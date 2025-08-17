import * as React from 'react';

export type ViewerControlsApi = {
  move: (dx: number, dy: number, dz: number) => void; // camera-local axes
  rotateYaw: (radians: number) => void;
  rotatePitch: (radians: number) => void;
  zoomIn: (factor?: number) => void;
  zoomOut: (factor?: number) => void;
  reset: () => void;
  setSpeed: (unitsPerSecond: number) => void;
  getSuggestedStep: () => number;
  setControlsEnabled: (enabled: boolean) => void;
};

export function ViewerR3F(props: {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  controlsElementRef?: React.RefObject<HTMLElement>; // attach OrbitControls here so wheel works above overlay
  onUVSample: (uv: [number, number], pressure?: number) => void;
  modelPath?: string;
  getPaintCanvas?: () => HTMLCanvasElement | null;
  controlsApiRef?: React.RefObject<ViewerControlsApi | null>;
  visibleNodeNames?: string[]; // if provided, only nodes whose name is in this list will be visible
  paintEnabled?: boolean;
  onBeginPaint?: (uv: [number, number], pressure?: number) => void;
  onEndPaint?: () => void;
}) {
  const paintEnabledRef = React.useRef<boolean>(!!props.paintEnabled);
  React.useEffect(() => { paintEnabledRef.current = !!props.paintEnabled; }, [props.paintEnabled]);
  React.useEffect(() => {
    const cv = props.canvasRef.current;
    if (!cv) return;

    let cleanup: (() => void) | null = null;

    (async () => {
      try {
        const THREE: any = await import('three');
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader');
        const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls');
        // Renderer & scene
        const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
        const dpr = Math.max(1, Math.min(2, (typeof window !== 'undefined' && (window as any).devicePixelRatio) ? (window as any).devicePixelRatio : 1));
        renderer.setPixelRatio(dpr);
        renderer.setClearColor(0x0b0b0b, 1);
        const scene = new THREE.Scene();
        const modelGroup = new THREE.Group();
        scene.add(modelGroup);
        // Start with safe aspect, then compute precisely once we know CSS size
        const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
        camera.position.set(0, 0, 5.0);
        const controlsDom = props.controlsElementRef?.current ?? cv;
        const controls = new OrbitControls(camera, controlsDom);
        controls.enableDamping = true;
        controls.enablePan = true;
        controls.enableZoom = true; // mouse wheel & pinch
        controls.enableRotate = true;
        // Ensure no auto-rotation at any time
        (controls as any).autoRotate = false;
        (controls as any).autoRotateSpeed = 0;
        // Map mouse buttons: LEFT = rotate, MIDDLE = pan, RIGHT = none (reserved for paint)
        try {
          const MOUSE = (THREE as any).MOUSE;
          (controls as any).mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.PAN, RIGHT: (MOUSE as any).NONE };
        } catch {}
        controls.minDistance = 1.0;
        controls.maxDistance = 20;
        const light = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
        scene.add(light);
        const dir = new THREE.DirectionalLight(0xffffff, 0.6);
        dir.position.set(5, 5, 5);
        scene.add(dir);

        // Ensure we have a non-zero backbuffer size before first render using the actual canvas CSS size
        {
          const rect = cv.getBoundingClientRect();
          const cssW = Math.max(1, Math.floor(rect.width)) || 1;
          const cssH = Math.max(1, Math.floor(rect.height)) || 1;
          renderer.setSize(cssW, cssH, false);
          camera.aspect = cssW / cssH;
          camera.updateProjectionMatrix();
        }

        // Load model or fallback cube
        let targetMesh: any = null;
        let rootAdded: any = null;
        if (props.modelPath) {
          try {
            const loader = new GLTFLoader();
            const gltf = await loader.loadAsync(props.modelPath);
            const root = gltf.scene || gltf.scenes?.[0];
            if (root) {
              modelGroup.add(root);
              rootAdded = root;
              // Pick first mesh for raycasting
              root.traverse((obj: any) => { if (!targetMesh && obj.isMesh) targetMesh = obj; });
            }
          } catch (e) {
            console.warn('Failed to load model, falling back to cube:', e);
          }
        }
        if (!targetMesh) {
          const geo = new THREE.BoxGeometry(1, 1, 1);
          const mat = new THREE.MeshStandardMaterial({ color: 0x888888 });
          targetMesh = new THREE.Mesh(geo, mat);
          modelGroup.add(targetMesh);
          rootAdded = targetMesh;
        }

        // Dynamic canvas texture from paint canvas
        let canvasTex: any = null;
        const getCanvas = props.getPaintCanvas;
        if (getCanvas) {
          const c = getCanvas();
          if (c && c.width > 0 && c.height > 0) {
            canvasTex = new THREE.CanvasTexture(c);
            canvasTex.flipY = false;
            canvasTex.needsUpdate = true;
            // Ensure USE_UV is defined by assigning a 1x1 white map when none exists
            const whiteTex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
            whiteTex.flipY = false;
            whiteTex.needsUpdate = true;
            // Patch materials to overlay paint alpha without killing lighting
            const ensureOverlay = (mat: any) => {
              if (!mat || mat.userData?._paintPatched) return;
              // Ensure UV pipeline is enabled in shader by setting a dummy white map if none
              try { if (!mat.map) { mat.map = whiteTex; mat.needsUpdate = true; } } catch {}
              mat.onBeforeCompile = (shader: any) => {
                shader.uniforms.uPaintMap = { value: canvasTex };
                const isGL2 = shader.vertexShader.includes('#version 300 es');
                // Vertex shader: create a dedicated varying/out for vPaintUv sourced from existing vUv
                if (isGL2) {
                  // GLSL3
                  shader.vertexShader = shader.vertexShader.replace(
                    'void main() {',
                    `out vec2 vPaintUv;\nvoid main() {\n  vPaintUv = vUv;`
                  );
                } else {
                  // GLSL1
                  const vsHeader = `varying vec2 vPaintUv;`;
                  shader.vertexShader = shader.vertexShader.replace(
                    'void main() {',
                    `${vsHeader}\nvoid main() {\n  vPaintUv = vUv;`
                  );
                }
                // Fragment shader: declare uniform and varying/in, then blend paint over computed diffuseColor
                if (isGL2) {
                  shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <map_pars_fragment>',
                    `#include <map_pars_fragment>\nuniform sampler2D uPaintMap;\nin vec2 vPaintUv;`
                  );
                  shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <map_fragment>',
                    `#include <map_fragment>\n  vec4 paint = texture(uPaintMap, vPaintUv);\n  diffuseColor.rgb = mix(diffuseColor.rgb, paint.rgb, paint.a);`
                  );
                } else {
                  shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <map_pars_fragment>',
                    `#include <map_pars_fragment>\nuniform sampler2D uPaintMap;\nvarying vec2 vPaintUv;`
                  );
                  shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <map_fragment>',
                    `#include <map_fragment>\n  vec4 paint = texture2D(uPaintMap, vPaintUv);\n  diffuseColor.rgb = mix(diffuseColor.rgb, paint.rgb, paint.a);`
                  );
                }
                mat.userData._paintUniforms = shader.uniforms;
              };
              mat.userData._paintPatched = true;
              mat.needsUpdate = true;
            };
            const patchObj = (obj: any) => {
              if (!obj.material) return;
              // Skip patching if geometry has no UVs; painting requires UVs
              const hasUVs = !!(obj.geometry && obj.geometry.attributes && obj.geometry.attributes.uv);
              if (!hasUVs) return;
              if (Array.isArray(obj.material)) obj.material.forEach(ensureOverlay); else ensureOverlay(obj.material);
            };
            (rootAdded || targetMesh).traverse?.(patchObj) ?? patchObj(targetMesh);
          }
        }

        // Normalize model scale to fit a target radius and frame camera
        let normalized = false;
        const frameScene = () => {
          const box = new THREE.Box3().setFromObject(modelGroup);
          const center = new THREE.Vector3();
          const size = new THREE.Vector3();
          box.getCenter(center);
          box.getSize(size);
          let radius = Math.max(size.x, size.y, size.z) * 0.5;
          if (!normalized) {
            const targetRadius = 1.0; // world units
            if (radius > 0) {
              const s = targetRadius / radius;
              modelGroup.scale.setScalar(s);
              // Recompute after scaling
              const box2 = new THREE.Box3().setFromObject(modelGroup);
              box2.getCenter(center);
              box2.getSize(size);
              radius = Math.max(size.x, size.y, size.z) * 0.5;
            }
            // Center model at origin for stable controls target
            modelGroup.position.sub(center);
            normalized = true;
            // Update center after recentering
            center.set(0, 0, 0);
          } else {
            // If already normalized, target origin
            center.set(0, 0, 0);
          }
          const fitOffset = 1.25;
          const fov = (camera.fov * Math.PI) / 180;
          const fitHeightDistance = radius / Math.tan(fov / 2);
          const fitWidthDistance = fitHeightDistance / camera.aspect;
          const distance = fitOffset * Math.max(fitHeightDistance, fitWidthDistance);
          const dirVec = new THREE.Vector3(0, 0, 1);
          camera.position.copy(center.clone().add(dirVec.multiplyScalar(distance)));
          camera.near = Math.max(0.001, distance / 100);
          camera.far = Math.max(camera.near + 1, distance * 100);
          camera.updateProjectionMatrix();
          controls.target.copy(center);
          controls.update();
        };
        frameScene();

        const raycaster = new THREE.Raycaster();
        const ndc = new THREE.Vector2();
        let isPainting = false;
        let lastUV: [number, number] | null = null;

        const stampAtEvent = (e: PointerEvent, uv: [number, number]) => {
          props.onUVSample(uv, (e as any).pressure ?? 1);
        };

        const onPointerDown = (e: PointerEvent) => {
          try { console.debug('[ViewerR3F] pointerdown', { button: e.button, paintEnabled: paintEnabledRef.current }); } catch {}
          // Paint with RMB only when enabled
          if (!paintEnabledRef.current) return;
          if (e.button !== 2) return; // right button
          const rect = cv.getBoundingClientRect();
          ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(ndc, camera);
          const hits = modelGroup ? raycaster.intersectObject(modelGroup, true) : [];
          try { console.debug('[ViewerR3F] pointerdown hits', { count: hits.length, hasUV: hits[0]?.uv ? true : false, firstObject: hits[0]?.object?.name }); } catch {}
          if (hits.length && hits[0].uv) {
            e.preventDefault();
            try { (cv as any).setPointerCapture?.(e.pointerId); } catch {}
            controls.enabled = false;
            isPainting = true;
            lastUV = [hits[0].uv.x, hits[0].uv.y];
            try { console.debug('[ViewerR3F] RMB down paint start', { uv: lastUV }); } catch {}
            props.onBeginPaint?.(lastUV, (e as any).pressure ?? 1);
            stampAtEvent(e, lastUV);
          }
        };

        const onPointerMove = (e: PointerEvent) => {
          const rect = cv.getBoundingClientRect();
          ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(ndc, camera);
          const hits = modelGroup ? raycaster.intersectObject(modelGroup, true) : [];
          if (!hits.length || !hits[0].uv) {
            try { console.debug('[ViewerR3F] pointermove no valid UV hit', { count: hits.length, hasUV: hits[0]?.uv ? true : false }); } catch {}
            return;
          }
          const uvNow: [number, number] = [hits[0].uv.x, hits[0].uv.y];
          if (isPainting && paintEnabledRef.current) {
            try { console.debug('[ViewerR3F] RMB move', { uv: uvNow }); } catch {}
            // interpolate between last and current UV to avoid gaps
            if (lastUV) {
              const dx = uvNow[0] - lastUV[0];
              const dy = uvNow[1] - lastUV[1];
              const dist = Math.sqrt(dx * dx + dy * dy);
              const steps = Math.max(1, Math.ceil(dist * 64)); // 64 samples per UV unit
              for (let i = 1; i <= steps; i++) {
                const t = i / steps;
                const u = lastUV[0] + dx * t;
                const v = lastUV[1] + dy * t;
                stampAtEvent(e, [u, v]);
              }
            } else {
              stampAtEvent(e, uvNow);
            }
            lastUV = uvNow;
          }
        };

        const onPointerUp = (e: PointerEvent) => {
          if (e.button !== 2) return;
          isPainting = false;
          lastUV = null;
          controls.enabled = true;
          try { console.debug('[ViewerR3F] RMB up paint end'); } catch {}
          try { props.onEndPaint?.(); } catch {}
          try { (cv as any).releasePointerCapture?.(e.pointerId); } catch {}
        };
        // Preempt OrbitControls for RMB when paint mode is on
        const prePointerDown = (e: PointerEvent) => {
          try { console.debug('[ViewerR3F] prePointerDown on controlsDom', { button: e.button, paintEnabled: paintEnabledRef.current }); } catch {}
          if (paintEnabledRef.current && e.button === 2) { e.preventDefault(); e.stopImmediatePropagation?.(); e.stopPropagation(); }
        };
        controlsDom.addEventListener('pointerdown', prePointerDown, { capture: true } as any);
        // Prevent browser context menu so RMB painting doesn't get blocked
        const preventCtx = (e: Event) => { e.preventDefault(); };
        cv.addEventListener('contextmenu', preventCtx);

        cv.addEventListener('pointerdown', onPointerDown);
        cv.addEventListener('pointermove', onPointerMove);
        cv.addEventListener('pointerup', onPointerUp);
        cv.addEventListener('pointercancel', onPointerUp);
        cv.addEventListener('pointerleave', onPointerUp);
        cv.addEventListener('contextmenu', (e) => { if (props.paintEnabled) { e.preventDefault(); e.stopPropagation(); } });

        // --- Keyboard free-fly navigation ---
        const pressed = new Set<string>();
        let userSpeed = 2.0;
        const onKeyDown = (e: KeyboardEvent) => { pressed.add(e.code); };
        const onKeyUp = (e: KeyboardEvent) => { pressed.delete(e.code); };
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);

        let raf = 0;
        let running = true;
        let paused = false;
        let lastT = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const tmpForward = new THREE.Vector3();
        const tmpRight = new THREE.Vector3();
        const tmpUp = new THREE.Vector3();
        const moveDelta = new THREE.Vector3();

        // Expose imperative API for UI controls
        const moveCameraLocal = (dx: number, dy: number, dz: number) => {
          // camera-local axis move: forward (z), right (x), up (y)
          const f = new THREE.Vector3();
          const r = new THREE.Vector3();
          const u = new THREE.Vector3();
          camera.getWorldDirection(f).normalize();
          r.copy(f).cross(camera.up).normalize();
          u.copy(camera.up).normalize();
          const delta = new THREE.Vector3();
          delta.addScaledVector(r, dx).addScaledVector(u, dy).addScaledVector(f, dz);
          camera.position.add(delta);
          controls.target.add(delta);
        };

        const api: ViewerControlsApi = {
          move: (dx, dy, dz) => {
            try { console.debug('[ViewerR3F.API] move', { dx, dy, dz }); } catch {}
            moveCameraLocal(dx, dy, dz);
            controls.update();
          },
          rotateYaw: (rad) => {
            try { console.debug('[ViewerR3F.API] rotateYaw', { rad }); } catch {}
            const prev = controls.enabled; controls.enabled = true;
            (controls as any).rotateLeft?.(-rad);
            controls.update();
            controls.enabled = prev;
          },
          rotatePitch: (rad) => {
            try { console.debug('[ViewerR3F.API] rotatePitch', { rad }); } catch {}
            const prev = controls.enabled; controls.enabled = true;
            (controls as any).rotateUp?.(rad);
            controls.update();
            controls.enabled = prev;
          },
          zoomIn: (factor = 1.1) => {
            try { console.debug('[ViewerR3F.API] zoomIn', { factor }); } catch {}
            const prev = controls.enabled; controls.enabled = true;
            if ((controls as any).dollyIn) (controls as any).dollyIn(factor); else camera.zoom *= factor;
            camera.updateProjectionMatrix();
            controls.update();
            controls.enabled = prev;
          },
          zoomOut: (factor = 1.1) => {
            try { console.debug('[ViewerR3F.API] zoomOut', { factor }); } catch {}
            const prev = controls.enabled; controls.enabled = true;
            if ((controls as any).dollyOut) (controls as any).dollyOut(factor); else camera.zoom /= factor;
            camera.updateProjectionMatrix();
            controls.update();
            controls.enabled = prev;
          },
          reset: () => { controls.reset(); },
          setSpeed: (unitsPerSecond: number) => { userSpeed = Math.max(0.1, unitsPerSecond); },
          getSuggestedStep: () => {
            const dist = camera.position.distanceTo(controls.target);
            return Math.max(0.1, Math.min(5, dist * 0.2));
          },
          setControlsEnabled: (enabled: boolean) => { controls.enabled = enabled; },
        };
        if (props.controlsApiRef) (props.controlsApiRef as any).current = api;
        // Also attach to canvas dataset for quick sanity checks
        (cv as any)._viewerControlsApi = api;

        const tick = () => {
          if (!running) return;
          if (paused || (typeof document !== 'undefined' && document.hidden)) {
            if (running) raf = requestAnimationFrame(tick);
            return;
          }
          // Apply visibility filter if requested
          if (props.visibleNodeNames && rootAdded) {
            const visibleNames = new Set(props.visibleNodeNames);
            rootAdded.traverse((obj: any) => { if (obj.isMesh) obj.visible = visibleNames.has(obj.name); });
          } else if (rootAdded) {
            rootAdded.traverse((obj: any) => { if (obj.isMesh) obj.visible = true; });
          }
          // Disabled auto-rotation
          const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
          const dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000)); // clamp delta
          lastT = now;

          // compute camera-local axes
          camera.getWorldDirection(tmpForward).normalize();
          tmpRight.copy(tmpForward).cross(camera.up).normalize();
          tmpUp.copy(camera.up).normalize();

          // accumulate movement from keys
          const forward = (pressed.has('KeyW') ? 1 : 0) - (pressed.has('KeyS') ? 1 : 0);
          const right = (pressed.has('KeyD') ? 1 : 0) - (pressed.has('KeyA') ? 1 : 0);
          const up = (pressed.has('KeyE') ? 1 : 0) - (pressed.has('KeyQ') ? 1 : 0);
          const baseSpeed = userSpeed; // units per second
          const speed = pressed.has('ShiftLeft') || pressed.has('ShiftRight') ? baseSpeed * 3 : baseSpeed;
          moveDelta.set(0, 0, 0)
            .addScaledVector(tmpForward, forward)
            .addScaledVector(tmpRight, right)
            .addScaledVector(tmpUp, up)
            .multiplyScalar(speed * dt);
          if (moveDelta.lengthSq() > 0) {
            camera.position.add(moveDelta);
            controls.target.add(moveDelta);
          }
          // Always allow normal OrbitControls when not painting; painting sequence disables controls explicitly
          controls.enableRotate = true;
          controls.enablePan = true;
          controls.enableZoom = true;
          // keep aspect and renderer size in sync with CSS size
          const rect = cv.getBoundingClientRect();
          const cssW = Math.max(1, Math.floor(rect.width)) || 1;
          const cssH = Math.max(1, Math.floor(rect.height)) || 1;
          // If container is effectively 0x0, skip this frame to avoid incomplete framebuffer
          if (cssW < 2 || cssH < 2) {
            if (running) raf = requestAnimationFrame(tick);
            return;
          }
          // Only resize when needed to avoid layout thrash
          const currentPixelRatio = (renderer as any).getPixelRatio ? renderer.getPixelRatio() : 1;
          const neededW = Math.max(1, Math.floor(cssW));
          const neededH = Math.max(1, Math.floor(cssH));
          const canvasW = cv.width;
          const canvasH = cv.height;
          let resized = false;
          if (canvasW !== Math.floor(neededW * currentPixelRatio) || canvasH !== Math.floor(neededH * currentPixelRatio)) {
            renderer.setSize(neededW, neededH, false);
            resized = true;
          }
          if (camera.aspect !== neededW / neededH) {
            camera.aspect = neededW / neededH;
            camera.updateProjectionMatrix();
            resized = true;
          }
          if (resized) frameScene();
          controls.update();
          if (canvasTex) canvasTex.needsUpdate = true;
          // Update patched materials with the current paint texture
          if (canvasTex && rootAdded) {
            rootAdded.traverse((obj: any) => {
              const mat = obj.material;
              if (!mat) return;
              const upd = (m: any) => { if (m.userData?._paintUniforms) { m.userData._paintUniforms.uPaintMap.value = canvasTex; } };
              if (Array.isArray(mat)) mat.forEach(upd); else upd(mat);
            });
          }
          // Guard against context loss or disposed renderer
          const gl = (renderer as any).getContext?.();
          const dbw = (gl as any)?.drawingBufferWidth ?? 0;
          const dbh = (gl as any)?.drawingBufferHeight ?? 0;
          if (!dbw || !dbh) {
            if (running) raf = requestAnimationFrame(tick);
            return;
          }
          if (gl && !(gl as any).isContextLost?.()) {
            try {
              (renderer as any).resetState?.();
              renderer.render(scene, camera);
            } catch {}
          }
          if (running) raf = requestAnimationFrame(tick);
        };
        tick();

        const onVis = () => { paused = typeof document !== 'undefined' ? document.hidden : false; if (!paused && running) raf = requestAnimationFrame(tick); };
        document.addEventListener('visibilitychange', onVis);
        const onLost = (e: any) => { try { e.preventDefault(); } catch {} paused = true; };
        const onRestored = () => {
          paused = false;
          const rect = cv.getBoundingClientRect();
          const cssW = Math.max(1, Math.floor(rect.width)) || 1;
          const cssH = Math.max(1, Math.floor(rect.height)) || 1;
          renderer.setSize(cssW, cssH, false);
          camera.aspect = cssW / cssH;
          camera.updateProjectionMatrix();
          frameScene();
          if (running) raf = requestAnimationFrame(tick);
        };
        const gl = (renderer as any).getContext?.();
        (gl as any)?.canvas?.addEventListener?.('webglcontextlost', onLost, false);
        (gl as any)?.canvas?.addEventListener?.('webglcontextrestored', onRestored, false);

        cleanup = () => {
          controls.dispose();
        };
      } catch {
        // Fallback: no three installed yet. Map pointer to UV directly.
        const onPointerMove = (e: PointerEvent) => {
          const rect = cv.getBoundingClientRect();
          const u = (e.clientX - rect.left) / rect.width;
          const v = (e.clientY - rect.top) / rect.height;
          props.onUVSample([u, v], (e as any).pressure ?? 1);
        };
        cv.addEventListener('pointermove', onPointerMove);
        cleanup = () => cv.removeEventListener('pointermove', onPointerMove);
      }
    })();

    return () => { cleanup?.(); };
  }, [props.canvasRef]);

  return null;
}

