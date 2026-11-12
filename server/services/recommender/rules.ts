import type { RoomType } from '../converter/types'
import type { CatalogItem } from './types'

// The rule-based recommender's knowledge: what a room of each type usually
// holds ("roles"), how many, how important, and where each piece goes.

// How a role's item is placed (see placement.ts).
export type PlaceMode =
  | { kind: 'wall'; faceRole?: string; y0?: number } // back to a wall, facing in (optionally the wall facing faceRole)
  | { kind: 'centre' } // middle of the free floor
  | { kind: 'front'; gap: number; faceAnchor: boolean } // in front of the anchor
  | { kind: 'beside' } // next to the anchor's back corners (nightstands by the bed's head)
  | { kind: 'around' } // round the anchor's edges, facing it (chairs at a table)
  | { kind: 'on' } // standing on top of the anchor
  | { kind: 'above'; y0: (anchorTop: number) => number } // on the wall above the anchor
  | { kind: 'ceiling' }
  | { kind: 'door' } // just inside a doorway

export interface Role {
  id: string
  // Singular name used in reasons ("a bed").
  label: string
  // A catalog item fills the role if it has any of these tags...
  tags: string[]
  // ...and none of these.
  without?: string[]
  // ...and (if set) this placement kind.
  placement?: CatalogItem['placement']
  mode: PlaceMode
  // Role this one is placed against (front/beside/around/on/above). Wall and
  // ceiling modes don't need one; the others fall back as noted in placement.ts.
  anchor?: string
}

export const ROLES: Record<string, Role> = {
  bed: { id: 'bed', label: 'bed', tags: ['bed'], mode: { kind: 'wall' } },
  nightstand: {
    id: 'nightstand',
    label: 'nightstand',
    tags: ['nightstand'],
    mode: { kind: 'beside' },
    anchor: 'bed',
  },
  wardrobe: { id: 'wardrobe', label: 'wardrobe', tags: ['wardrobe'], mode: { kind: 'wall' } },
  tableLamp: {
    id: 'tableLamp',
    label: 'table lamp',
    tags: ['table lamp'],
    mode: { kind: 'on' },
    anchor: 'nightstand',
  },
  deskLamp: {
    id: 'deskLamp',
    label: 'desk lamp',
    tags: ['table lamp'],
    mode: { kind: 'on' },
    anchor: 'desk',
  },
  desk: { id: 'desk', label: 'desk', tags: ['desk'], mode: { kind: 'wall' } },
  officeChair: {
    id: 'officeChair',
    label: 'desk chair',
    tags: ['office chair'],
    mode: { kind: 'front', gap: 0.06, faceAnchor: true },
    anchor: 'desk',
  },
  monitor: {
    id: 'monitor',
    label: 'monitor',
    tags: ['monitor'],
    mode: { kind: 'on' },
    anchor: 'desk',
  },
  keyboard: {
    id: 'keyboard',
    label: 'keyboard',
    tags: ['keyboard'],
    mode: { kind: 'on' },
    anchor: 'desk',
  },
  sofa: { id: 'sofa', label: 'sofa', tags: ['sofa'], mode: { kind: 'wall' } },
  coffeeTable: {
    id: 'coffeeTable',
    label: 'coffee table',
    tags: ['coffee table'],
    mode: { kind: 'front', gap: 0.4, faceAnchor: false },
    anchor: 'sofa',
  },
  tvStand: {
    id: 'tvStand',
    label: 'TV stand',
    tags: ['tv stand'],
    mode: { kind: 'wall', faceRole: 'sofa' },
  },
  tv: { id: 'tv', label: 'TV', tags: ['tv'], mode: { kind: 'on' }, anchor: 'tvStand' },
  armchair: { id: 'armchair', label: 'armchair', tags: ['armchair'], mode: { kind: 'wall' } },
  floorLamp: {
    id: 'floorLamp',
    label: 'floor lamp',
    tags: ['floor lamp'],
    mode: { kind: 'beside' },
    anchor: 'sofa',
  },
  rug: { id: 'rug', label: 'rug', tags: ['rug'], mode: { kind: 'centre' } },
  bookcase: {
    id: 'bookcase',
    label: 'bookcase',
    tags: ['bookcase', 'shelves'],
    without: ['wardrobe'],
    mode: { kind: 'wall' },
  },
  plant: {
    id: 'plant',
    label: 'plant',
    tags: ['plant'],
    placement: 'floor',
    mode: { kind: 'wall' },
  },
  pendant: { id: 'pendant', label: 'ceiling light', tags: ['pendant'], mode: { kind: 'ceiling' } },
  fridge: { id: 'fridge', label: 'fridge', tags: ['fridge'], mode: { kind: 'wall' } },
  stove: { id: 'stove', label: 'stove', tags: ['stove'], mode: { kind: 'wall' } },
  kitchenSink: { id: 'kitchenSink', label: 'sink', tags: ['sink'], mode: { kind: 'wall' } },
  baseCabinet: {
    id: 'baseCabinet',
    label: 'counter cabinet',
    tags: ['base cabinet'],
    mode: { kind: 'wall' },
  },
  wallCabinet: {
    id: 'wallCabinet',
    label: 'wall cabinet',
    tags: ['wall cabinet'],
    mode: { kind: 'above', y0: () => 1.45 },
    anchor: 'baseCabinet',
  },
  hood: {
    id: 'hood',
    label: 'cooker hood',
    tags: ['extractor'],
    mode: { kind: 'above', y0: (top) => top + 0.65 },
    anchor: 'stove',
  },
  microwave: {
    id: 'microwave',
    label: 'microwave',
    tags: ['microwave'],
    mode: { kind: 'on' },
    anchor: 'baseCabinet',
  },
  bin: { id: 'bin', label: 'bin', tags: ['bin'], mode: { kind: 'wall' } },
  diningTable: {
    id: 'diningTable',
    label: 'dining table',
    tags: ['dining table'],
    mode: { kind: 'centre' },
  },
  diningChair: {
    id: 'diningChair',
    label: 'chair',
    tags: ['chair'],
    without: ['office chair'],
    mode: { kind: 'around' },
    anchor: 'diningTable',
  },
  sideboard: { id: 'sideboard', label: 'sideboard', tags: ['console'], mode: { kind: 'wall' } },
  toilet: { id: 'toilet', label: 'toilet', tags: ['toilet'], mode: { kind: 'wall' } },
  basin: { id: 'basin', label: 'basin', tags: ['sink'], mode: { kind: 'wall' } },
  shower: { id: 'shower', label: 'shower', tags: ['shower'], mode: { kind: 'wall' } },
  bathtub: { id: 'bathtub', label: 'bathtub', tags: ['bath'], mode: { kind: 'wall' } },
  mirror: {
    id: 'mirror',
    label: 'mirror',
    tags: ['mirror'],
    mode: { kind: 'above', y0: (top) => top + 0.25 },
    anchor: 'basin',
  },
  washer: {
    id: 'washer',
    label: 'washing machine',
    tags: ['washing machine'],
    mode: { kind: 'wall' },
  },
  console: { id: 'console', label: 'console table', tags: ['console'], mode: { kind: 'wall' } },
  coatStand: {
    id: 'coatStand',
    label: 'coat stand',
    tags: ['coat'],
    placement: 'floor',
    mode: { kind: 'wall' },
  },
  doormat: { id: 'doormat', label: 'doormat', tags: ['doormat'], mode: { kind: 'door' } },
}

export interface KitEntry {
  role: string
  // How much the room wants this piece (0–1).
  weight: number
  // How many the room should have, given its floor area (m²). 0 = not suggested.
  count: (area: number) => number
  // Order variants (best first) — e.g. a double bed in a big bedroom.
  prefer?: (item: CatalogItem, area: number) => number
}

const one = () => 1
const atLeast =
  (min: number, n = 1) =>
  (area: number) =>
    area >= min ? n : 0
const hasTag = (item: CatalogItem, tag: string) => item.tags.includes(tag)

// Listed anchors-first: a role's anchor comes before it, so suggestions in one
// list can build on each other (the coffee table goes in front of the suggested sofa).
export const KITS: Record<RoomType, KitEntry[]> = {
  bedroom: [
    {
      role: 'bed',
      weight: 1,
      count: one,
      // Double/queen in rooms of 11 m² and up, single below; bunks last.
      prefer: (item, area) =>
        hasTag(item, 'double')
          ? area >= 11
            ? 2
            : 0
          : hasTag(item, 'single')
            ? area >= 11
              ? 1
              : 2
            : -1,
    },
    { role: 'nightstand', weight: 0.7, count: (a) => (a >= 11 ? 2 : 1) },
    { role: 'wardrobe', weight: 0.6, count: one },
    { role: 'tableLamp', weight: 0.35, count: one },
    { role: 'desk', weight: 0.3, count: atLeast(12), prefer: (i) => (hasTag(i, 'corner') ? 0 : 1) },
    { role: 'officeChair', weight: 0.25, count: atLeast(12) },
    { role: 'rug', weight: 0.2, count: atLeast(9) },
    { role: 'plant', weight: 0.15, count: atLeast(10) },
  ],
  living: [
    {
      role: 'sofa',
      weight: 1,
      count: one,
      // Corner sofas only in big rooms.
      prefer: (item, area) => (hasTag(item, 'corner') ? (area >= 25 ? 1 : -1) : 0.5),
    },
    { role: 'coffeeTable', weight: 0.75, count: one },
    { role: 'tvStand', weight: 0.7, count: one },
    { role: 'tv', weight: 0.55, count: one, prefer: (i) => (hasTag(i, 'retro') ? 0 : 1) },
    { role: 'armchair', weight: 0.45, count: (a) => (a >= 22 ? 2 : a >= 14 ? 1 : 0) },
    { role: 'rug', weight: 0.35, count: one },
    { role: 'floorLamp', weight: 0.3, count: one },
    { role: 'bookcase', weight: 0.3, count: atLeast(16) },
    { role: 'plant', weight: 0.25, count: one },
    { role: 'pendant', weight: 0.2, count: one },
  ],
  kitchen: [
    {
      role: 'fridge',
      weight: 1,
      count: one,
      prefer: (i, a) => (hasTag(i, 'small') ? (a < 6 ? 1 : -1) : 0),
    },
    { role: 'stove', weight: 0.95, count: one },
    { role: 'kitchenSink', weight: 0.95, count: one },
    { role: 'baseCabinet', weight: 0.6, count: (a) => Math.max(1, Math.min(4, Math.floor(a / 4))) },
    { role: 'hood', weight: 0.4, count: one },
    {
      role: 'wallCabinet',
      weight: 0.35,
      count: (a) => Math.max(1, Math.min(3, Math.floor(a / 5))),
    },
    { role: 'microwave', weight: 0.25, count: one },
    { role: 'bin', weight: 0.3, count: one },
    {
      role: 'diningTable',
      weight: 0.3,
      count: atLeast(12),
      prefer: (i) => (hasTag(i, 'round') ? 1 : 0),
    },
    { role: 'diningChair', weight: 0.25, count: atLeast(12, 2) },
    { role: 'pendant', weight: 0.15, count: one },
  ],
  dining: [
    {
      role: 'diningTable',
      weight: 1,
      count: one,
      prefer: (i, a) => (hasTag(i, 'round') ? (a < 10 ? 1 : 0) : 0.5),
    },
    { role: 'diningChair', weight: 0.85, count: (a) => (a >= 14 ? 6 : 4) },
    { role: 'pendant', weight: 0.3, count: one },
    { role: 'sideboard', weight: 0.25, count: atLeast(10) },
    { role: 'rug', weight: 0.2, count: atLeast(12) },
    { role: 'plant', weight: 0.2, count: one },
  ],
  bathroom: [
    { role: 'toilet', weight: 1, count: one },
    { role: 'basin', weight: 0.9, count: one },
    // A bathtub in bathrooms of 5 m² and up, a shower below.
    { role: 'bathtub', weight: 0.8, count: atLeast(5) },
    { role: 'shower', weight: 0.8, count: (a) => (a < 5 ? 1 : 0) },
    { role: 'mirror', weight: 0.55, count: one },
    { role: 'washer', weight: 0.2, count: atLeast(6) },
    { role: 'bin', weight: 0.15, count: one },
  ],
  office: [
    {
      role: 'desk',
      weight: 1,
      count: one,
      prefer: (i, a) => (hasTag(i, 'corner') ? (a >= 9 ? 1 : -1) : 0.5),
    },
    { role: 'officeChair', weight: 0.9, count: one },
    { role: 'monitor', weight: 0.6, count: one },
    { role: 'keyboard', weight: 0.4, count: one },
    { role: 'bookcase', weight: 0.5, count: one },
    { role: 'deskLamp', weight: 0.3, count: one },
    { role: 'plant', weight: 0.2, count: one },
  ],
  hallway: [
    { role: 'console', weight: 0.6, count: one },
    { role: 'coatStand', weight: 0.55, count: one },
    { role: 'doormat', weight: 0.4, count: one },
    { role: 'plant', weight: 0.2, count: atLeast(4) },
    { role: 'pendant', weight: 0.2, count: one },
  ],
  other: [
    { role: 'bookcase', weight: 0.3, count: atLeast(3) },
    { role: 'pendant', weight: 0.15, count: one },
  ],
}

// Does a catalog item fill the role (in a room of this type)?
export function fillsRole(item: CatalogItem, role: Role, roomType?: RoomType): boolean {
  if (roomType && !item.roomTypes.includes(roomType)) return false
  if (role.placement && item.placement !== role.placement) return false
  if (role.without?.some((t) => item.tags.includes(t))) return false
  return role.tags.some((t) => item.tags.includes(t))
}
