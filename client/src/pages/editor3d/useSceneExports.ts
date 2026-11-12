import { useState, type RefObject } from 'react'
import { toast } from '../../components/toast/toast'
import type { SceneObject } from '../../types/scene'

// Downloading the scene: GLTF straight away, GLB after asking for a file name.
// The exporters are loaded only when used (they pull in three's exporters).
export function useSceneExports(objectsRef: RefObject<SceneObject[]>) {
  const [glbDialogOpen, setGlbDialogOpen] = useState(false)
  const [glbName, setGlbName] = useState('')

  const exportGltf = async () => {
    try {
      const { exportGLTF } = await import('../../editor/export/exportGLTF')
      await exportGLTF(objectsRef.current ?? [])
      toast.success('Exported the scene as GLTF.')
    } catch {
      toast.error('Could not export the scene as GLTF.')
    }
  }

  const exportGlb = async () => {
    const filename = `${glbName || 'scene'}.glb`
    setGlbDialogOpen(false)
    setGlbName('')
    try {
      const { exportGLB } = await import('../../editor/export/exportGLB')
      await exportGLB(objectsRef.current ?? [], filename)
      toast.success(`Exported ${filename}.`)
    } catch {
      toast.error('Could not export the scene as GLB.')
    }
  }

  return {
    exportGltf,
    glb: {
      open: glbDialogOpen,
      name: glbName,
      setName: setGlbName,
      show: () => setGlbDialogOpen(true),
      close: () => setGlbDialogOpen(false),
      confirm: exportGlb,
    },
  }
}
