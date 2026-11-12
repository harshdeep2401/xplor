import type { SceneAsset, SceneRoom, SceneV1, SceneWall, Vec2, Vec3 } from '../converter/types'
import { assignAssetRooms } from '../converter/sceneAssets'
import { pointInPolygon, roomTypeFromShape } from '../converter/roomSemantics'
import { type Box, polygonArea } from './geometry'
import { type RoomSpace, place, boxOfPlacement } from './placement'
import { KITS, ROLES, fillsRole, type Role } from './rules'
import type { CatalogItem, Recommender, RecommendInput, RoomSuggestions, Suggestion } from './types'

// Rule-based recommender: each room type has a kit of roles (rules.ts). For
// every role the room is short of, pick the best-fitting catalog item and find
// it a spot (placement.ts). Score = role weight × share still missing, plus a
// bonus when the piece it goes with is already in the room. Pure + deterministic.

const DEFAULT_LIMIT = 8
const ANCHOR_BONUS = 0.15
const DOOR_HEIGHT_M = 2.1
// Kept clear on each side of a doorway so it can be walked through.
const DOOR_CLEARANCE_M = 0.9

// What an existing asset occupies, from its saved size and transform.
function assetBox(asset: SceneAsset): Box | null {
  // Primitives are 1 m shapes; a model with no saved size can't be measured here.
  const size: Vec3 | null =
    asset.baseSize ?? (asset.kind === 'primitive' ? { x: 1, y: 1, z: 1 } : null)
  if (!size) return null
  const s = asset.transform.scale
  const p = asset.transform.position
  return {
    centre: { x: p.x, z: p.z },
    angle: asset.transform.rotation.y,
    hw: Math.abs((size.x * s.x) / 2),
    hd: Math.abs((size.z * s.z) / 2),
    y0: p.y,
    y1: p.y + Math.abs(size.y * s.y),
  }
}

// Doorways: a clear zone across each door (both sides of the wall), plus the
// door's centre and the normal pointing into each room for doormats.
function doorZones(walls: SceneWall[]): { zone: Box; at: Vec2; normal: Vec2 }[] {
  const out: { zone: Box; at: Vec2; normal: Vec2 }[] = []
  for (const w of walls) {
    const dx = w.end.x - w.start.x
    const dz = w.end.z - w.start.z
    const len = Math.hypot(dx, dz)
    if (len < 1e-6) continue
    for (const o of w.openings ?? []) {
      if (o.type !== 'door') continue
      const at = { x: w.start.x + dx * o.center, z: w.start.z + dz * o.center }
      // Box local x along the wall: angle whose "right" is the wall direction.
      const angle = Math.atan2(-dz, dx)
      out.push({
        zone: {
          centre: at,
          angle,
          hw: o.width / 2 + 0.05,
          hd: DOOR_CLEARANCE_M,
          y0: 0,
          y1: DOOR_HEIGHT_M,
        },
        at,
        normal: { x: -dz / len, z: dx / len },
      })
    }
  }
  return out
}

function roomSpace(
  scene: SceneV1,
  room: SceneRoom,
  obstacles: Box[],
  doors: ReturnType<typeof doorZones>,
): RoomSpace {
  const walls = scene.walls
  const maxThickness = walls.reduce((m, w) => Math.max(m, w.thickness), 0.1)
  const ceiling = walls.reduce((m, w) => Math.max(m, w.height), 0) || 2.8
  return {
    polygon: room.floorPolygon,
    wallMargin: maxThickness / 2 + 0.02,
    ceiling,
    obstacles: [...obstacles, ...doors.map((d) => d.zone)],
    // A door counts for this room if a step inside from it lands in the room; the
    // normal is flipped to point inwards.
    doors: doors.flatMap((d) => {
      const probe = (n: Vec2) => ({ x: d.at.x + n.x * 0.3, z: d.at.z + n.z * 0.3 })
      const inside = (p: Vec2) => pointInPolygon(p, room.floorPolygon)
      if (inside(probe(d.normal))) return [{ at: d.at, inward: d.normal }]
      const flipped = { x: -d.normal.x, z: -d.normal.z }
      if (inside(probe(flipped))) return [{ at: d.at, inward: flipped }]
      return []
    }),
  }
}

function article(word: string): string {
  return /^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`
}

const ROOM_WORDS: Record<string, string> = {
  living: 'living room',
  bedroom: 'bedroom',
  kitchen: 'kitchen',
  dining: 'dining room',
  bathroom: 'bathroom',
  office: 'office',
  hallway: 'hallway',
  other: 'room',
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function reasonFor(
  role: Role,
  roomWord: string,
  need: number,
  have: number,
  anchorHere: string | null,
): string {
  if (anchorHere) {
    const verb =
      role.mode.kind === 'on'
        ? 'For the'
        : role.mode.kind === 'above'
          ? 'Above the'
          : 'Goes with the'
    return `${verb} ${anchorHere}.`
  }
  if (need > 1)
    return `${capitalise(article(roomWord))} this size suits ${need} ${role.label}s — ${have} so far.`
  return `${capitalise(article(roomWord))} usually has ${article(role.label)}.`
}

function recommendRoom(
  scene: SceneV1,
  room: SceneRoom,
  catalog: CatalogItem[],
  byId: Map<string, CatalogItem>,
  allBoxes: Box[],
  doors: ReturnType<typeof doorZones>,
  limit: number,
): RoomSuggestions {
  const area = room.area ?? Math.abs(polygonArea(room.floorPolygon))
  const type = room.type ?? roomTypeFromShape(room.floorPolygon, area)
  const space = roomSpace(scene, room, allBoxes, doors)
  const roomWord = ROOM_WORDS[type] ?? 'room'

  // What this room already has, per role, with their boxes (for anchoring).
  const present = (scene.assets ?? []).filter((a) => a.roomId === room.id)
  const anchors = new Map<string, Box[]>()
  const counts = new Map<string, number>()
  for (const entry of KITS[type]) {
    const role = ROLES[entry.role]
    for (const a of present) {
      const item = a.catalogId ? byId.get(a.catalogId) : undefined
      if (!item || !fillsRole(item, role)) continue
      counts.set(role.id, (counts.get(role.id) ?? 0) + 1)
      const box = assetBox(a)
      if (box) anchors.set(role.id, [...(anchors.get(role.id) ?? []), box])
    }
  }

  const suggestions: Suggestion[] = []
  for (const entry of KITS[type]) {
    const role = ROLES[entry.role]
    const need = entry.count(area)
    const have = counts.get(role.id) ?? 0
    if (need <= have) continue

    const variants = catalog
      .filter((item) => item.dimensions && fillsRole(item, role, type))
      .map((item, i) => ({ item, i, pref: entry.prefer?.(item, area) ?? 0 }))
      .filter((v) => v.pref >= 0)
      .sort((a, b) => b.pref - a.pref || a.i - b.i)
      .map((v) => v.item)
    if (!variants.length) continue

    const anchorBoxes = role.anchor ? (anchors.get(role.anchor) ?? []) : []
    const faceTargets =
      role.mode.kind === 'wall' && role.mode.faceRole
        ? (anchors.get(role.mode.faceRole) ?? []).map((b) => b.centre)
        : []
    // Needs something to stand on / face, and nothing's there: not yet.
    if (
      (role.mode.kind === 'on' || role.mode.kind === 'around' || role.mode.kind === 'front') &&
      !anchorBoxes.length
    ) {
      continue
    }

    // First variant that fits somewhere wins; the rest are alternatives.
    for (const item of variants) {
      const placement = place(role.mode, item.dimensions!, space, anchorBoxes, faceTargets)
      if (!placement) continue
      const anchorRole = role.anchor && anchorBoxes.length ? ROLES[role.anchor] : null
      const anchorIsExisting = !!role.anchor && (counts.get(role.anchor) ?? 0) > 0
      const anchorLabel = anchorRole
        ? `${anchorIsExisting ? '' : 'suggested '}${anchorRole.label}`
        : null
      suggestions.push({
        item,
        score:
          Math.round(
            (entry.weight * ((need - have) / need) + (anchorIsExisting ? ANCHOR_BONUS : 0)) * 1000,
          ) / 1000,
        role: role.id,
        reason: reasonFor(role, roomWord, need, have, anchorLabel),
        placement,
        alternatives: variants
          .filter((v) => v !== item)
          .slice(0, 3)
          .map((v) => v.id),
      })
      // Later roles can anchor on this suggestion (the TV on the suggested stand).
      anchors.set(role.id, [
        ...(anchors.get(role.id) ?? []),
        boxOfPlacement(placement, item.dimensions!),
      ])
      break
    }
  }

  suggestions.sort((a, b) => b.score - a.score)
  const out: RoomSuggestions = {
    roomId: room.id,
    type,
    area: Math.round(area * 100) / 100,
    suggestions: suggestions.slice(0, limit),
  }
  if (room.name) out.name = room.name
  return out
}

export const ruleBasedRecommender: Recommender = {
  name: 'rules-v1',
  recommend({ scene, catalog, roomId, limit = DEFAULT_LIMIT }: RecommendInput): RoomSuggestions[] {
    const withRooms = assignAssetRooms(scene)
    const byId = new Map(catalog.map((c) => [c.id, c]))
    const boxes = (withRooms.assets ?? []).map(assetBox).filter((b): b is Box => b !== null)
    const doors = doorZones(withRooms.walls)
    return (withRooms.rooms ?? [])
      .filter((r) => !roomId || r.id === roomId)
      .map((room) => recommendRoom(withRooms, room, catalog, byId, boxes, doors, limit))
  },
}
