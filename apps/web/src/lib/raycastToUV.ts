// Raycast screen coords to UV on a mesh (three.js skeleton; requires three at runtime)
// Prefer hit.uv provided by three's raycaster; otherwise return null to avoid incorrect interpolation.

export interface RaycastEnv {
  THREE: any; // three module
  camera: any; // THREE.Camera
  scene: any; // THREE.Scene
  raycaster?: any; // THREE.Raycaster (optional override)
}

export function raycastToUV(env: RaycastEnv, sx: number, sy: number, viewportW: number, viewportH: number): [number, number] | null {
  const { THREE, camera, scene } = env;
  const raycaster = env.raycaster || new THREE.Raycaster();
  const ndc = new THREE.Vector2((sx / viewportW) * 2 - 1, -(sy / viewportH) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const intersects = raycaster.intersectObjects(scene.children, true);
  if (!intersects.length) return null;
  const hit = intersects[0];
  if (hit.uv) return [hit.uv.x, hit.uv.y];
  return null;
}

