import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three-stdlib'
import type { SceneObject } from '../../types/scene'
import { resolveServerUrl } from '../../services/serverUrl'
import { DEFAULT_ASSET_SIZE_M, MAX_PLAUSIBLE_SIZE_M, MIN_PLAUSIBLE_SIZE_M } from '../utils/scale'
import { setMeta, type PlacedMeta, type Size3 } from './objectMeta'

// Placed objects (models and primitives) share one structure:
//
//   wrapper Group  ← the asset's transform (position on the floor, rotation, scale)
//     └ content    ← fitted so it measures exactly baseSize metres, with its
//                    bottom-centre at the wrapper's origin
//
// so a saved transform means the same thing whatever units the model file was
// authored in, and position.y = 0 means "standing on the floor".

// One download per model URL; each placement gets its own copy.
const gltfCache = new Map<string, Promise<GLTF>>()

function loadGltf(url: string): Promise<GLTF> {
  let pending = gltfCache.get(url)
  if (!pending) {
    pending = new GLTFLoader().loadAsync(url)
    // A failed download shouldn't stay cached: let the next attempt retry.
    pending.catch(() => gltfCache.delete(url))
    gltfCache.set(url, pending)
  }
  return pending
}

// Deep copy with its own materials, so recolouring one placed chair doesn't
// recolour every other chair from the same file.
function cloneWithOwnMaterials(root: THREE.Object3D): THREE.Object3D {
  const copy = root.clone(true)
  copy.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((m) => m.clone())
      : mesh.material.clone()
    mesh.castShadow = true
    mesh.receiveShadow = true
  })
  return copy
}

export function measure(obj: THREE.Object3D): Size3 {
  const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3())
  return { x: size.x, y: size.y, z: size.z }
}

// A sensible real-world size for a model with no known size (uploaded or linked
// files): keep it if it's already furniture-sized, otherwise scale it uniformly
// so its largest side is DEFAULT_ASSET_SIZE_M.
export function guessBaseSize(natural: Size3): Size3 {
  const maxDim = Math.max(natural.x, natural.y, natural.z)
  if (!isFinite(maxDim) || maxDim <= 0) return { x: 1, y: 1, z: 1 }
  if (maxDim >= MIN_PLAUSIBLE_SIZE_M && maxDim <= MAX_PLAUSIBLE_SIZE_M) return natural
  const k = DEFAULT_ASSET_SIZE_M / maxDim
  return { x: natural.x * k, y: natural.y * k, z: natural.z * k }
}

// Scale `content` (per axis) to measure exactly `size` metres, then move it so
// its bottom-centre sits at the origin of its parent.
export function fitToSize(content: THREE.Object3D, size: Size3): void {
  content.updateMatrixWorld(true)
  const natural = measure(content)
  const ratio = (target: number, current: number) =>
    current > 1e-9 && target > 0 ? target / current : 1
  content.scale.multiply(
    new THREE.Vector3(ratio(size.x, natural.x), ratio(size.y, natural.y), ratio(size.z, natural.z)),
  )
  content.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(content)
  const centre = box.getCenter(new THREE.Vector3())
  content.position.x -= centre.x
  content.position.z -= centre.z
  content.position.y -= box.min.y
  content.updateMatrixWorld(true)
}

function wrap(content: THREE.Object3D, name: string, meta: PlacedMeta): SceneObject {
  const wrapper = new THREE.Group()
  wrapper.name = name
  wrapper.add(content)
  setMeta(wrapper, meta)
  return { id: crypto.randomUUID(), name, object3d: wrapper }
}

export interface ModelOptions {
  // GLB URL (relative server paths like /static/... are resolved).
  source: string
  name: string
  catalogId?: string
  // Real-world size to fit to. Omitted → guessed from the file (guessBaseSize).
  baseSize?: Size3
}

// Load a GLB as ONE placed object (the whole file, not one object per child),
// fitted to its real-world size.
export async function createModelObject(opts: ModelOptions): Promise<SceneObject> {
  const gltf = await loadGltf(resolveServerUrl(opts.source))
  const content = cloneWithOwnMaterials(gltf.scene)
  const baseSize = opts.baseSize ?? guessBaseSize(measure(content))
  fitToSize(content, baseSize)
  const obj = wrap(content, opts.name, {
    kind: 'model',
    source: opts.source,
    catalogId: opts.catalogId,
    baseSize,
  })
  if (gltf.animations?.length) obj.animations = gltf.animations.map((a) => a.clone())
  return obj
}

export type PrimitiveShape = 'cube' | 'sphere'

const PRIMITIVE_COLOURS: Record<PrimitiveShape, number> = {
  cube: 0x8aaaff,
  sphere: 0xff8aaf,
}

// A 1 m cube or 1 m-diameter sphere standing on the floor.
export function createPrimitiveObject(shape: PrimitiveShape): SceneObject {
  const geometry =
    shape === 'cube' ? new THREE.BoxGeometry(1, 1, 1) : new THREE.SphereGeometry(0.5, 32, 32)
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: PRIMITIVE_COLOURS[shape] }),
  )
  mesh.position.y = 0.5
  mesh.castShadow = true
  mesh.receiveShadow = true
  const name = shape === 'cube' ? 'Cube' : 'Sphere'
  return wrap(mesh, name, { kind: 'primitive', source: shape })
}
