import { expect, type Page } from '@playwright/test'
import { test, twoRoomCanvas, type Api } from './fixtures'

// The 3D editor renders with WebGL, so the tests act through the panels around
// it (scene list, suggestions, library) and check what was saved.

async function openConvertedPlan(page: Page, api: Api) {
  const projectId = await api.createProject({ name: 'Two rooms' })
  await api.saveCanvas(projectId, twoRoomCanvas)
  await api.convert(projectId)
  await page.goto(`/editor/3d/${projectId}`)
  // Walls and floors from the plan are listed once the scene has loaded.
  const objects = page.getByRole('heading', { name: 'Objects' }).locator('..')
  await expect(objects.getByRole('button', { name: 'Floor: Living room' })).toBeVisible()
  await expect(page.locator('canvas')).toBeVisible()
  return { projectId, objects }
}

async function save(page: Page) {
  await page.getByRole('navigation').getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('navigation').getByText('Saved')).toBeVisible({ timeout: 20_000 })
}

test('add a suggested piece, save, and find it again after a reload', async ({
  page,
  api,
  user: _user,
  consoleErrors,
}) => {
  const { projectId, objects } = await openConvertedPlan(page, api)

  // The living room's first suggestion is a sofa.
  const suggestions = page.getByRole('region', { name: 'Suggestions' })
  const room = suggestions.getByRole('combobox', { name: 'Room' })
  const living = room.locator('option', { hasText: 'Living room' })
  await room.selectOption((await living.getAttribute('value'))!)
  const add = suggestions.getByRole('button', { name: /^Add .*sofa/i }).first()
  const sofaName = ((await add.getAttribute('aria-label')) ?? '').replace(/^Add /, '')
  await add.click()

  await expect(objects.getByRole('button', { name: sofaName })).toBeVisible()
  await save(page)

  const scene = await api.scene(projectId)
  const livingRoom = scene?.rooms?.find((r) => r.type === 'living')
  expect(scene?.assets).toEqual([
    expect.objectContaining({
      name: sofaName,
      catalogId: expect.stringMatching(/^kenney-/),
      roomId: livingRoom?.id,
    }),
  ])

  await page.reload()
  await expect(objects.getByRole('button', { name: sofaName })).toBeVisible()
  // Once added, the sofa is no longer suggested for that room.
  await expect(suggestions.getByRole('button', { name: `Add ${sofaName}` })).toHaveCount(0)

  expect(consoleErrors).toEqual([])
})

test('drag furniture from the library into the scene', async ({ page, api, user: _user }) => {
  const { projectId, objects } = await openConvertedPlan(page, api)

  await page.getByRole('searchbox', { name: 'Search furniture' }).fill('bookcase')
  const item = page.locator('[draggable="true"]', { hasText: /^Bookcase/ }).first()
  await expect(item).toBeVisible()
  await item.dragTo(page.locator('canvas'))

  await expect(objects.getByRole('button', { name: 'Bookcase' })).toBeVisible()
  await save(page)
  const scene = await api.scene(projectId)
  expect(scene?.assets?.map((a) => a.name)).toEqual(['Bookcase'])
})
