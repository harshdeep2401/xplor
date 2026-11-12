import { expect, type Page } from '@playwright/test'
import { test, twoRoomCanvas, type Api } from './fixtures'

// The 3D editor's keyboard and export: nudging, copy/paste, delete, the
// gizmo's W/E/R modes, and downloading a GLB.

interface SavedAsset {
  name?: string
  transform: { position: { x: number; y: number; z: number } }
}

async function savedAssets(api: Api, projectId: string) {
  return ((await api.scene(projectId))?.assets ?? []) as unknown as SavedAsset[]
}

async function save(page: Page) {
  const nav = page.getByRole('navigation')
  await nav.getByRole('button', { name: 'Save' }).click()
  await expect(nav.getByText('Saved')).toBeVisible({ timeout: 20_000 })
}

test('nudge with the arrow keys (it stays on the floor), copy, paste, delete', async ({
  page,
  api,
  user: _user,
  consoleErrors,
}) => {
  const projectId = await api.createProject({ name: 'Keys' })
  await api.saveCanvas(projectId, twoRoomCanvas)
  await api.convert(projectId)
  await page.goto(`/editor/3d/${projectId}`)
  const objects = page.getByRole('heading', { name: 'Objects' }).locator('..')
  await expect(objects.getByRole('button', { name: 'Floor: Living room' })).toBeVisible()

  // Add the first living-room suggestion; it's selected once added.
  const suggestions = page.getByRole('region', { name: 'Suggestions' })
  const room = suggestions.getByRole('combobox', { name: 'Room' })
  await room.selectOption(
    (await room.locator('option', { hasText: 'Living room' }).getAttribute('value'))!,
  )
  const add = suggestions.getByRole('button', { name: /^Add / }).first()
  const name = ((await add.getAttribute('aria-label')) ?? '').replace(/^Add /, '')
  await add.click()
  await expect(objects.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true')
  await save(page)
  const [placed] = await savedAssets(api, projectId)

  // Three nudges right: 15 cm along x, still standing on the floor.
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')
  await save(page)
  const [nudged] = await savedAssets(api, projectId)
  expect(nudged.transform.position.x).toBeCloseTo(placed.transform.position.x + 0.15, 3)
  expect(nudged.transform.position.y).toBeCloseTo(0, 5)
  expect(nudged.transform.position.z).toBeCloseTo(placed.transform.position.z, 5)

  // Copy, paste (selects the copy), delete the copy.
  await page.keyboard.press('Control+c')
  await page.keyboard.press('Control+v')
  await expect(objects.getByRole('button', { name })).toHaveCount(2)
  await page.keyboard.press('Delete')
  await expect(objects.getByRole('button', { name })).toHaveCount(1)

  // W / E / R switch what the handles do.
  const modes = page.getByRole('toolbar', { name: 'Transform mode' })
  await page.keyboard.press('e')
  await expect(modes.getByRole('button', { name: /Rotate/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.keyboard.press('r')
  await expect(modes.getByRole('button', { name: /Resize/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await modes.getByRole('button', { name: /Move/ }).click()
  await expect(modes.getByRole('button', { name: /Move/ })).toHaveAttribute('aria-pressed', 'true')

  expect(consoleErrors).toEqual([])
})

test('export the scene as a named GLB file', async ({ page, api, user: _user }) => {
  const projectId = await api.createProject({ name: 'Export' })
  await api.saveCanvas(projectId, twoRoomCanvas)
  await api.convert(projectId)
  await page.goto(`/editor/3d/${projectId}`)
  await expect(
    page.getByRole('heading', { name: 'Objects' }).locator('..').getByRole('button', {
      name: 'Floor: Bedroom',
    }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Export as GLB' }).click()
  const dialog = page.getByRole('dialog', { name: 'Export Scene as GLB' })
  await dialog.getByLabel(/File name/).fill('my-flat')
  const download = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Export' }).click()
  expect((await download).suggestedFilename()).toBe('my-flat.glb')
  await expect(dialog).toBeHidden()
})
