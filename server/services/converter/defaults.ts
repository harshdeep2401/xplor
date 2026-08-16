// Bridging assumptions used ONLY when migrating the legacy canvas-v1 payload up
// to canvas-v2. canvas-v1 has no scale, no wall height, and free-xy openings, so
// we fill those in with defaults. These are placeholders until the 2D editor
// captures real values (roadmap 2.2 UI work); once it emits canvas-v2 directly,
// normalizeCanvas passes it through and none of these apply.

// px -> metre factor assumed for legacy drawings with no recorded scale.
// Matches the DB canonical default (Project.scalePixelsPerMeter). Callers should
// pass the project's real value as an override where available.
export const DEFAULT_PIXELS_PER_METRE = 40

// Vertical dimensions (metres) — canvas-v1 has no z axis at all.
// Matches the DB canonical default (Project.defaultWallHeightM).
export const DEFAULT_WALL_HEIGHT_M = 1.0
export const DOOR_HEIGHT_M = 2.1
export const WINDOW_HEIGHT_M = 1.2
export const WINDOW_SILL_HEIGHT_M = 0.9

// A legacy door carries no wall attachment; it is snapped to the nearest wall
// whose distance is within this many pixels. Beyond it, the door can't be placed
// meaningfully and is dropped. (Legacy windows usually carry attachedWallId, but
// fall back to the same snap when they don't.)
export const OPENING_SNAP_THRESHOLD_PX = 60

// Deterministic defaults so a converted scene is immediately renderable. The 3D
// editor overrides/enriches these later; the converter itself only builds structure.
export const DEFAULT_WALL_MATERIAL_ID = 'wall-default'
