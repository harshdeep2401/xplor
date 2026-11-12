// The 3D editor's world unit is 1 metre. Primitives (a 1 m cube, a 0.5 m-radius
// sphere), the room dimensions collected at creation, and placed library assets
// all share this unit. This is the project's "scale".
export const WORLD_UNIT = 'metre'

// Real-world size (metres) a model of unknown size is scaled to when it's out of
// range, and the range within which it's assumed already in metres
// (see guessBaseSize in editor/scene/models.ts).
export const DEFAULT_ASSET_SIZE_M = 1.2
export const MIN_PLAUSIBLE_SIZE_M = 0.2
export const MAX_PLAUSIBLE_SIZE_M = 4.0
