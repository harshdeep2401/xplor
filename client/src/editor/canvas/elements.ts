// The 2D editor's internal working model. These are the shapes the Konva editor
// draws and mutates directly (pixel coordinates, free placement) — natural for
// interactive editing. They are transformed to/from the canvas-v2 CONTRACT only
// at the persistence boundary (see canvasV2.ts); the contract, not this file, is
// what the backend converter consumes.

export interface WallElement {
  id: string
  type: 'wall'
  startX: number
  startY: number
  endX: number
  endY: number
  thickness: number
  curvature?: number
}
export interface DoorElement {
  id: string
  type: 'door'
  x: number
  y: number
  width: number
  height: number
  rotation: number
}
export interface WindowElement {
  id: string
  type: 'window'
  x: number
  y: number
  startX: number
  startY: number
  width: number
  height: number
  rotation: number
  curvature: number
  attachedWallId: string | null
}
export interface LabelElement {
  id: string
  type: 'label'
  x: number
  y: number
  text: string
  fontSize: number
}
export type EditorElement = WallElement | DoorElement | WindowElement | LabelElement
