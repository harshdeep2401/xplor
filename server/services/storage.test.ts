import fs from 'fs'
import path from 'path'
import { afterAll, expect, test } from 'vitest'
import {
  STORAGE_ROOT,
  deleteObject,
  floorPlanKey,
  glbKey,
  keyFromPublicUrl,
  projectFileKey,
  putObject,
} from './storage'

// UPLOAD_DIR points at a temporary folder in tests (vitest.config.mts).
afterAll(() => fs.rmSync(STORAGE_ROOT, { recursive: true, force: true }))

test('stores under UPLOAD_DIR, returns the public URL, and deletes', async () => {
  expect(STORAGE_ROOT).toBe(process.env.UPLOAD_DIR)
  const url = await putObject({ key: 'a/b/c.txt', body: Buffer.from('hi') })
  expect(url).toBe('/uploads/a/b/c.txt')
  expect(fs.readFileSync(path.join(STORAGE_ROOT, 'a/b/c.txt'), 'utf8')).toBe('hi')

  expect(keyFromPublicUrl(url)).toBe('a/b/c.txt')
  expect(keyFromPublicUrl('https://cdn.example/x.glb')).toBeNull()
  await deleteObject('a/b/c.txt')
  expect(fs.existsSync(path.join(STORAGE_ROOT, 'a/b/c.txt'))).toBe(false)
  await expect(deleteObject('a/b/c.txt')).resolves.toBeUndefined()
})

test('keys are namespaced, timestamped and safe to use as paths', () => {
  expect(floorPlanKey('u1', '../../my plan (1).png')).toMatch(
    /^floor-plans\/u1\/\d+-\.\._\.\._my_plan__1_\.png$/,
  )
  expect(glbKey('p1')).toMatch(/^glb\/p1\/\d+\.glb$/)
  expect(projectFileKey('p1', 'wood grain.jpg')).toMatch(/^project-files\/p1\/\d+-wood_grain\.jpg$/)
})

test('keys can never escape the storage folder', async () => {
  await expect(putObject({ key: '../outside.txt', body: Buffer.from('x') })).rejects.toThrow(
    'Invalid storage key',
  )
  await expect(deleteObject('a/../../outside.txt')).rejects.toThrow('Invalid storage key')
})
