// Helpers for driving the 2D editor. It draws on a Konva canvas, so the tests
// act with the mouse in screen space and check the result through the API
// (what was saved), not pixels. A rectangle in the middle of the canvas is a room.
import { expect, type Page } from '@playwright/test'
import type { Api } from './fixtures'

export async function openEditor(page: Page, api: Api) {
  const projectId = await api.createProject({ name: 'Drawn by e2e' })
  await page.goto(`/editor/2d/${projectId}`)
  await expect(page.locator('.save-status')).toHaveText('Saved')
  const box = (await page.locator('.editor-canvas-wrapper canvas').first().boundingBox())!
  // Corners of a room a little smaller than the visible canvas.
  const x0 = box.x + box.width * 0.3
  const x1 = box.x + box.width * 0.7
  const y0 = box.y + box.height * 0.3
  const y1 = box.y + box.height * 0.7
  return { projectId, x0, x1, y0, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 }
}

export async function tool(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).click()
}

export async function drag(page: Page, from: [number, number], to: [number, number]) {
  await page.mouse.move(...from)
  await page.mouse.down()
  await page.mouse.move(...to, { steps: 8 })
  await page.mouse.up()
}

// Autosave runs 1.5 s after the last edit.
export async function waitForSave(page: Page) {
  await expect(page.locator('.save-status')).toHaveText('Saved', { timeout: 15_000 })
}
