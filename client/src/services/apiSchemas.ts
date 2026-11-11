import { z } from 'zod'

// Shapes of the API responses the editors depend on, checked when they arrive.
// A server that sends something else (an old build, a proxy error page) then
// fails with a clear message here instead of somewhere deep in the 3D editor.
// Each mirrors a server type; keep them in step.

// One item of the furniture catalog. Mirrors server/services/recommender/types.ts
// (CatalogItem), as listed by GET /api/assets.
export const catalogAssetSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  fileUrl: z.string(),
  thumbnailUrl: z.string().nullable(),
  // Real-world size in metres (x = width, y = height, z = depth).
  dimensions: z.object({ x: z.number(), y: z.number(), z: z.number() }).nullable(),
  roomTypes: z.array(z.string()),
  tags: z.array(z.string()),
  placement: z.enum(['floor', 'wall', 'surface', 'ceiling']),
})
export type CatalogAsset = z.infer<typeof catalogAssetSchema>

export const assetsResponse = z.object({ assets: z.array(catalogAssetSchema) })

// POST /api/projects/:id/suggestions. Mirrors server/services/recommender/types.ts.
const vec3 = z.object({ x: z.number(), y: z.number(), z: z.number() })

export const furnitureSuggestionSchema = z.object({
  item: catalogAssetSchema,
  score: z.number(),
  role: z.string(),
  reason: z.string(),
  // Absolute scene-v1 position of the item's bottom-centre (metres).
  placement: z.object({ position: vec3, rotationY: z.number() }),
  alternatives: z.array(z.string()),
})
export type FurnitureSuggestion = z.infer<typeof furnitureSuggestionSchema>

export const roomSuggestionsSchema = z.object({
  roomId: z.string(),
  name: z.string().optional(),
  type: z.string(),
  area: z.number(),
  suggestions: z.array(furnitureSuggestionSchema),
})
export type RoomSuggestions = z.infer<typeof roomSuggestionsSchema>

export const suggestionsResponse = z.object({
  recommender: z.string(),
  rooms: z.array(roomSuggestionsSchema),
})

// GET /api/projects/:id/scene. sceneData is checked separately (isSceneV1),
// because an old-format scene is a case the editor handles, not an error.
export const activeSceneResponse = z.object({
  scene: z.object({
    version: z.number().int(),
    sceneData: z.unknown(),
    metadata: z
      .object({
        // The grid of a plan-less 3D project, in metres.
        grid: z
          .object({
            width: z.number().positive(),
            length: z.number().positive(),
            height: z.number().positive(),
          })
          .partial()
          .optional(),
      })
      .nullish(),
  }),
})
export type SavedScene = z.infer<typeof activeSceneResponse>['scene']

// Thrown when a response doesn't have the expected shape.
export class UnexpectedResponseError extends Error {
  constructor(what: string, error: z.ZodError) {
    super(`The server sent an unexpected ${what}. Try reloading the page.`)
    this.name = 'UnexpectedResponseError'
    this.cause = error
  }
}

// Check a response body; `what` names it in the error ("furniture list").
export function parseResponse<S extends z.ZodType>(
  schema: S,
  data: unknown,
  what: string,
): z.infer<S> {
  const result = schema.safeParse(data)
  if (!result.success) {
    // Details for whoever opens the browser console; the user gets the message.
    // eslint-disable-next-line no-console
    console.error(`Unexpected ${what}:`, z.prettifyError(result.error))
    throw new UnexpectedResponseError(what, result.error)
  }
  return result.data
}
