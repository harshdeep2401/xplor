import { expect } from '@playwright/test'
import { test } from './fixtures'
import { drag, openEditor, tool, waitForSave } from './plan2d'

// The 2D tools beyond plain drawing: windows, measuring, calibrating the
// scale, and editing a selection (move, box select, copy/paste, nudge).

const length = (w: { start: { x: number; y: number }; end: { x: number; y: number } }) =>
  Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y)

test('a window on a wall, a measurement, and calibrating the scale', async ({
  page,
  api,
  user: _user,
  consoleErrors,
}) => {
  const { projectId, x0, x1, y0, y1 } = await openEditor(page, api)
  const w = x1 - x0

  await tool(page, 'Wall')
  await drag(page, [x0, y0], [x1, y0])
  await waitForSave(page)

  // A window dragged along the wall is stored as an opening in it.
  await tool(page, 'Window')
  await drag(page, [x0 + w * 0.25, y0 + 2], [x0 + w * 0.6, y0 + 2])
  await waitForSave(page)
  await expect
    .poll(async () => (await api.canvas(projectId)).openings)
    .toEqual([expect.objectContaining({ type: 'window' })])

  // Measuring shows a distance in metres and saves nothing.
  await tool(page, 'Measure')
  await expect(page.getByRole('heading', { name: 'Measure' })).toBeVisible()
  await drag(page, [x0, y1], [x1, y1])
  await expect(page.locator('.prop-row', { hasText: 'Distance' })).toContainText(/\d+\.\d\d m/)

  // Calibrate: drag along the wall, say it's 4 m, apply.
  await tool(page, 'Calibrate')
  await drag(page, [x0 + 3, y0], [x1 - 3, y0])
  await page.getByLabel('Real length (m)').fill('4')
  await page.getByRole('button', { name: 'Apply scale' }).click()
  await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await waitForSave(page)

  await expect
    .poll(async () => {
      const c = await api.canvas(projectId)
      return Math.abs((c.scale?.pixelsPerMetre ?? 0) - length(c.walls![0]) / 4) < 0.02
    })
    .toBe(true)
  expect(consoleErrors).toEqual([])
})

test('move a wall, box-select, copy and paste, select all and nudge', async ({
  page,
  api,
  user: _user,
}) => {
  const { projectId, x0, x1, y0, y1, cx } = await openEditor(page, api)
  const walls = async () => (await api.canvas(projectId)).walls ?? []

  await tool(page, 'Wall')
  await drag(page, [x0, y0], [x1, y0])
  await drag(page, [x1, y0], [x1, y1])
  await waitForSave(page)
  await expect.poll(async () => (await walls()).length).toBe(2)
  const [top, side] = await walls()

  // Pressing on a wall with Select and dragging moves it, unchanged in shape.
  await tool(page, 'Select')
  await drag(page, [cx, y0], [cx, y0 + 40])
  await waitForSave(page)
  await expect
    .poll(async () => {
      const moved = (await walls()).find((w) => w.id === top.id)!
      return moved.start.y > top.start.y && moved.start.y === moved.end.y
    })
    .toBe(true)
  expect((await walls()).find((w) => w.id === side.id)).toEqual(side)

  // A box around both selects both.
  await page.keyboard.press('Escape')
  await drag(page, [x0 - 40, y0 - 60], [x1 + 40, y1 + 40])
  await expect(page.getByRole('heading', { name: 'Selection' })).toBeVisible()
  await expect(page.locator('.prop-row', { hasText: 'Selected' })).toContainText('2 items')

  // Copy + paste: two more walls.
  await page.keyboard.press('Control+c')
  await page.keyboard.press('Control+v')
  await waitForSave(page)
  await expect.poll(async () => (await walls()).length).toBe(4)

  // Select all, nudge right: every wall moves 5 cm (in px at the project's scale).
  const before = await walls()
  const nudgePx = 0.05 * (await api.canvas(projectId)).scale!.pixelsPerMetre
  await page.keyboard.press('Control+a')
  await expect(page.locator('.prop-row', { hasText: 'Selected' })).toContainText('4 items')
  await page.keyboard.press('ArrowRight')
  await waitForSave(page)
  await expect
    .poll(async () => {
      const after = await walls()
      return before.every((b) => {
        const a = after.find((w) => w.id === b.id)
        return a !== undefined && Math.abs(a.start.x - b.start.x - nudgePx) < 0.01
      })
    })
    .toBe(true)
})
