import * as THREE from "three";

// The 3D editor's world unit is 1 metre. Primitives (a 1 m cube, a 0.5 m-radius
// sphere), the room dimensions collected at creation, and placed library assets
// all share this unit. This is the project's "scale".
export const WORLD_UNIT = "metre";

// Target real-world size (metres) an out-of-range library asset is scaled to,
// and the plausible range within which an asset is assumed already in-scale.
export const DEFAULT_ASSET_SIZE_M = 1.2;
export const MIN_PLAUSIBLE_SIZE_M = 0.2;
export const MAX_PLAUSIBLE_SIZE_M = 4.0;

/**
 * Uniformly scale an object to real-world metres.
 *
 * Library models come in arbitrary units (some authored in metres, some in
 * centimetres, some huge). If the object's largest dimension is already within
 * a plausible furniture range it's left untouched; otherwise it's uniformly
 * scaled so its largest dimension becomes `target` metres. This keeps
 * well-authored assets correct while rescuing wildly-sized ones.
 */
export function normalizeToScale(
  obj: THREE.Object3D,
  target = DEFAULT_ASSET_SIZE_M,
  min = MIN_PLAUSIBLE_SIZE_M,
  max = MAX_PLAUSIBLE_SIZE_M,
) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3();
  box.getSize(size);

  const maxDim = Math.max(size.x, size.y, size.z);
  if (!isFinite(maxDim) || maxDim <= 0) return;
  if (maxDim >= min && maxDim <= max) return; // already sensibly sized

  obj.scale.multiplyScalar(target / maxDim);
  obj.updateMatrixWorld(true);
}
