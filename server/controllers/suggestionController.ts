import type { Request, Response } from 'express'
import { assertOwnsProject, currentUserId } from '../services/access'
import { listCatalog } from '../services/catalog'
import { getRecommender } from '../services/recommender'
import type { IdParams } from '../schemas/common'
import type { SuggestionsBody } from '../schemas/projects'

// POST /api/projects/:id/suggestions  Body: { scene, roomId?, limit? }
// Furniture suggestions for the scene the 3D editor is showing right now
// (sent in the body, so unsaved edits count), per room, each with a spot to
// place it. Nothing is stored. The body is checked by schemas/projects.ts
// (suggestionsBody): scene is a valid scene-v1, limit is 1–20.
export const suggestFurniture = async (
  req: Request<IdParams, unknown, SuggestionsBody>,
  res: Response,
) => {
  const { scene, roomId, limit } = req.body
  await assertOwnsProject(req.params.id, currentUserId(req))

  const recommender = getRecommender()
  const rooms = recommender.recommend({ scene, catalog: await listCatalog(), roomId, limit })
  res.status(200).json({ recommender: recommender.name, rooms })
}
