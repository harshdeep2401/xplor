import type { RoomType, Vec2 } from './types'

// Room names and types (roadmap 6.2). Pure + deterministic.
//
// A room's name is the text of the first 2D label (in canvas order) whose
// position falls inside the room's floor polygon — users name rooms simply by
// dropping a label in them in the 2D editor. The type comes from that name when
// it mentions a known kind ("Master Bedroom" → bedroom), otherwise from the
// room's size and shape.

// Ray-casting point-in-polygon test on the floor plane. Points exactly on an
// edge may land either way, which is fine for labels and furniture positions.
export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) {
      inside = !inside
    }
  }
  return inside
}

// Checked in order; the first kind with a matching word wins, so "Master Bath"
// is a bathroom and "Living / Dining" a living room. Words are matched at their
// start only, so "Bedroom2" and "Hallway" still match.
const NAME_KEYWORDS: [RoomType, RegExp][] = [
  ['bathroom', /\b(bath|wc|toilet|restroom|shower|washroom|lavatory|powder)/],
  ['bedroom', /\b(bed|master|nursery|guest room|kids room)/],
  ['kitchen', /\b(kitchen|cook|pantry)/],
  ['living', /\b(living|lounge|family|sitting|drawing|den\b|tv\b)/],
  ['dining', /\b(dining|dinner)/],
  ['office', /\b(office|study|work|library)/],
  ['hallway', /\b(hall|corridor|entry|entrance|foyer|lobby|passage|vestibule|landing)/],
]

export function roomTypeFromName(name: string): RoomType | null {
  const text = name.toLowerCase()
  for (const [type, re] of NAME_KEYWORDS) {
    if (re.test(text)) return type
  }
  return null
}

// Size/shape guess for an unnamed (or unrecognised) room, in square metres.
// Long thin spaces are corridors; otherwise small → bathroom, medium → bedroom,
// large → living room. Rough, but a sensible starting point for suggestions.
export function roomTypeFromShape(polygon: Vec2[], area: number): RoomType {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const p of polygon) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minZ = Math.min(minZ, p.z)
    maxZ = Math.max(maxZ, p.z)
  }
  const long = Math.max(maxX - minX, maxZ - minZ)
  const short = Math.min(maxX - minX, maxZ - minZ)
  if (short > 0 && long / short >= 3 && short <= 1.8) return 'hallway'
  if (area < 2.5) return 'other'
  if (area <= 6) return 'bathroom'
  if (area <= 16) return 'bedroom'
  return 'living'
}

export interface NamedLabel {
  // Floor position in metres.
  position: Vec2
  text: string
}

// Name + type for one room, given every label in the plan (metres, canvas order).
export function describeRoom(
  polygon: Vec2[],
  area: number,
  labels: NamedLabel[],
): { name?: string; type: RoomType } {
  const label = labels.find((l) => l.text.trim() && pointInPolygon(l.position, polygon))
  const name = label?.text.trim()
  const type = (name && roomTypeFromName(name)) || roomTypeFromShape(polygon, area)
  return name ? { name, type } : { type }
}
