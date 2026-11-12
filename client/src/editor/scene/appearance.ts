import * as THREE from 'three'
import { resolveServerUrl } from '../../services/serverUrl'

// Colour and texture changes on an object. Materials are cloned before they
// change: Object3D.clone shares materials, so editing them in place would also
// change undo snapshots and copies of the object.

type ColouredMaterial = THREE.Material & { color?: THREE.Color; map?: THREE.Texture | null }

function editMaterials(root: THREE.Object3D, edit: (m: ColouredMaterial) => void): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh || !mesh.material) return
    const own = (m: THREE.Material) => {
      const copy = m.clone() as ColouredMaterial
      edit(copy)
      copy.needsUpdate = true
      return copy
    }
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(own) : own(mesh.material)
  })
}

export function paintObject(root: THREE.Object3D, colorHex: string): void {
  editMaterials(root, (m) => {
    if (m.color) m.color = new THREE.Color(colorHex)
  })
}

// Apply a texture to every mesh, or remove textures with null.
export function textureObject(root: THREE.Object3D, texture: THREE.Texture | null): void {
  editMaterials(root, (m) => {
    if ('map' in m) m.map = texture
  })
}

export async function loadTexture(url: string): Promise<THREE.Texture> {
  const texture = await new THREE.TextureLoader().loadAsync(resolveServerUrl(url))
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}
