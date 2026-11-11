// Pure editing operations on the 2D editor's elements (no React, no Konva), so
// they can be unit-tested: moving and duplicating a selection, and showing
// pixel lengths in metres. Used by pages/Editor2D.tsx.
import type { EditorElement } from './elements'

// Move the elements whose ids are in `ids` by (dx, dy) canvas pixels.
export function translateElements(
  elements: EditorElement[],
  ids: ReadonlySet<string>,
  dx: number,
  dy: number,
): EditorElement[] {
  if (dx === 0 && dy === 0) return elements
  return elements.map((el) => {
    if (!ids.has(el.id)) return el
    switch (el.type) {
      case 'wall':
        return { ...el, startX: el.startX + dx, startY: el.startY + dy, endX: el.endX + dx, endY: el.endY + dy }
      case 'window':
        return { ...el, x: el.x + dx, y: el.y + dy, startX: el.startX + dx, startY: el.startY + dy }
      default:
        return { ...el, x: el.x + dx, y: el.y + dy }
    }
  })
}

// Copies of `source` with fresh ids, shifted by (offset, offset) pixels. A
// window copied together with its wall is attached to the copy of that wall.
export function duplicateElements(
  source: EditorElement[],
  offset: number,
  makeId: () => string = () => crypto.randomUUID(),
): EditorElement[] {
  const newIds = new Map(source.map((el) => [el.id, `${el.type}_${makeId()}`]))
  const moved = translateElements(source, new Set(newIds.keys()), offset, offset)
  return moved.map((el) => {
    const copy = { ...el, id: newIds.get(el.id)! }
    if (copy.type === 'window' && copy.attachedWallId) {
      copy.attachedWallId = newIds.get(copy.attachedWallId) ?? copy.attachedWallId
    }
    return copy
  })
}

// Canvas pixels -> metres, using the project scale (pixels per metre).
export function pxToMetres(px: number, pixelsPerMetre: number): number {
  return px / pixelsPerMetre
}

// "3.25 m" for a length in canvas pixels.
export function formatMetres(px: number, pixelsPerMetre: number, decimals = 2): string {
  return `${pxToMetres(px, pixelsPerMetre).toFixed(decimals)} m`
}
