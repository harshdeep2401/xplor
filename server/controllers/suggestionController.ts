import type { Request, Response } from 'express'
import { prisma } from '../config/db'
import { validateSceneV1, formatErrors, type SceneV1 } from '../services/converter'
import { listCatalog } from '../services/catalog'
import { getRecommender } from '../services/recommender'

// POST /api/projects/:id/suggestions  Body: { scene, roomId?, limit? }
// Furniture suggestions for the scene the 3D editor is showing right now
// (sent in the body, so unsaved edits count), per room, each with a spot to
// place it. Nothing is stored.
export const suggestFurniture = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { scene, roomId, limit } = req.body as {
      scene?: unknown
      roomId?: unknown
      limit?: unknown
    }
    if (!validateSceneV1(scene)) {
      return res.status(400).json({
        message: `scene must be a valid scene-v1: ${formatErrors(validateSceneV1.errors)}`,
      })
    }

    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      select: { userId: true },
    })
    if (!project) return res.status(404).json({ message: 'Project not found' })
    if (project.userId !== req.user!.id) {
      return res.status(401).json({ message: 'Not authorized to access this project' })
    }

    const recommender = getRecommender()
    const rooms = recommender.recommend({
      scene: scene as SceneV1,
      catalog: await listCatalog(),
      roomId: typeof roomId === 'string' ? roomId : undefined,
      limit: typeof limit === 'number' ? Math.max(1, Math.min(20, Math.floor(limit))) : undefined,
    })
    return res.status(200).json({ recommender: recommender.name, rooms })
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message })
  }
}
