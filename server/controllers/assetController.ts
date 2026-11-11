import type { Request, Response } from 'express'
import { listCatalog } from '../services/catalog'

// GET /api/assets → every furniture catalog item (sorted by category, name).
export const listAssets = async (_req: Request, res: Response) => {
  try {
    return res.status(200).json({ assets: await listCatalog() })
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message })
  }
}
