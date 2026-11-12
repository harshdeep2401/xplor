import { expect } from '@playwright/test'
import { test as xplor } from './fixtures'
import { drag, openEditor, tool, waitForSave } from './plan2d'

xplor(
  'draw a room with a door and a label; it saves and converts to a typed room',
  async ({ page, api, user: _user, consoleErrors }) => {
    const { projectId, x0, x1, y0, y1, cx, cy } = await openEditor(page, api)

    await tool(page, 'Wall')
    await drag(page, [x0, y0], [x1, y0])
    await drag(page, [x1, y0], [x1, y1])
    await drag(page, [x1, y1], [x0, y1])
    await drag(page, [x0, y1], [x0, y0])

    await tool(page, 'Door')
    await page.mouse.click(cx, y1)

    await tool(page, 'Label')
    await page.mouse.click(cx - 40, cy)

    // Rename the label from the properties panel. The label's text starts at the
    // click point; at the fitted zoom it's only a few pixels tall.
    await tool(page, 'Select')
    await page.mouse.click(cx - 32, cy + 3)
    const name = page.locator('.prop-row', { hasText: 'Room Name' }).locator('input')
    await expect(name).toHaveValue('Room Name')
    await name.fill('Kitchen')
    await waitForSave(page)

    await expect
      .poll(async () => {
        const c = await api.canvas(projectId)
        return {
          walls: c.walls?.length,
          doors: c.openings?.filter((o) => o.type === 'door').length,
          labels: c.labels?.map((l) => l.text),
        }
      })
      .toEqual({ walls: 4, doors: 1, labels: ['Kitchen'] })

    // The four walls close: the converter finds one room, typed by its label.
    await page.getByRole('button', { name: 'Convert to 3D' }).click()
    await expect(page).toHaveURL(new RegExp(`/editor/3d/${projectId}$`))
    const scene = await api.scene(projectId)
    expect(scene?.rooms?.map((r) => [r.name, r.type])).toEqual([['Kitchen', 'kitchen']])

    expect(consoleErrors).toEqual([])
  },
)

xplor('undo, redo and delete are saved too', async ({ page, api, user: _user }) => {
  const { projectId, x0, x1, y0, cx } = await openEditor(page, api)
  const wallCount = async () => (await api.canvas(projectId)).walls?.length ?? 0

  await tool(page, 'Wall')
  await drag(page, [x0, y0], [x1, y0])
  await waitForSave(page)
  await expect.poll(wallCount).toBe(1)

  await page.getByRole('button', { name: 'Undo' }).click()
  await waitForSave(page)
  await expect.poll(wallCount).toBe(0)

  await page.getByRole('button', { name: 'Redo' }).click()
  await waitForSave(page)
  await expect.poll(wallCount).toBe(1)

  // Select the wall and delete it from the keyboard.
  await tool(page, 'Select')
  await page.mouse.click(cx, y0)
  await page.keyboard.press('Delete')
  await waitForSave(page)
  await expect.poll(wallCount).toBe(0)
})

xplor(
  'a project that does not exist (or isn’t yours) shows an error with a way back',
  async ({ page, user: _user }) => {
    await page.goto('/editor/2d/doesnotexist123')
    await expect(page.locator('.editor-loading')).toContainText('Project not found.')
    await page.getByRole('button', { name: 'Back to Dashboard' }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
  },
)
