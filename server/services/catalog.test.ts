import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterAll, beforeEach, describe, expect, test, vi } from 'vitest'

// The catalog reads the Asset table; a fake prisma stands in for it.
const findMany = vi.fn()
const upsert = vi.fn()
const deleteMany = vi.fn()
vi.mock('../config/db', () => ({ prisma: { asset: { findMany, upsert, deleteMany } } }))

const { listCatalog } = await import('./catalog')
const { readCatalog, catalogProblems, seedCatalog, CATALOG_FILE } = await import('./catalogSeed')

beforeEach(() => {
  vi.clearAllMocks()
})

const row = (id: string, metadata: unknown) => ({
  id,
  name: id,
  category: 'living',
  fileUrl: `/static/${id}.glb`,
  thumbnailUrl: null,
  metadata,
})

describe('listCatalog', () => {
  test('maps rows to catalog items, fills defaults, skips broken rows, and caches', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    findMany.mockResolvedValueOnce([
      row('a', { dimensions: { x: 1, y: 1, z: 1 }, roomTypes: ['living'], placement: 'wall' }),
      row('b', null),
      row('c', { roomTypes: ['garage'] }),
    ])
    const items = await listCatalog()
    expect(items.map((i) => i.id)).toEqual(['a', 'b'])
    expect(items[0]).toMatchObject({ placement: 'wall', roomTypes: ['living'], tags: [] })
    expect(items[1]).toMatchObject({ dimensions: null, placement: 'floor', roomTypes: [] })
    expect(console.warn).toHaveBeenCalledWith(expect.stringMatching(/Skipping catalog item c/))

    // Served from the cache for the next minute.
    expect(await listCatalog()).toBe(items)
    expect(findMany).toHaveBeenCalledTimes(1)
  })
})

describe('the catalog file', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-'))
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

  test('the real catalog is valid and its files exist', () => {
    const catalog = readCatalog()
    expect(catalog.items.length).toBeGreaterThanOrEqual(100)
    expect(catalogProblems(catalog)).toEqual([])
  })

  test('schema problems are listed; duplicate slugs and missing files are caught', () => {
    const bad = path.join(tmp, 'bad.json')
    fs.writeFileSync(
      bad,
      JSON.stringify({
        source: 'x',
        license: 'CC0',
        items: [
          {
            slug: 'a',
            name: 'A',
            category: 'c',
            model: 'm',
            dimensions: { x: 9, y: 1, z: 1 },
            roomTypes: ['den'],
          },
        ],
      }),
    )
    expect(() => readCatalog(bad)).toThrow(/bad\.json is invalid/)

    const real = readCatalog(CATALOG_FILE)
    const twice = { ...real, items: [real.items[0], { ...real.items[0], model: 'nope.glb' }] }
    expect(catalogProblems(twice)).toEqual([
      `"${real.items[0].slug}": duplicate slug`,
      `"${real.items[0].slug}": missing model file models/nope.glb`,
    ])
  })

  test('seeding upserts every item under a stable id and removes stale ones', async () => {
    deleteMany.mockResolvedValueOnce({ count: 3 })
    const catalog = readCatalog()
    const result = await seedCatalog({ asset: { upsert, deleteMany } } as never, catalog)
    expect(result).toEqual({ seeded: catalog.items.length, removed: 3 })
    const first = upsert.mock.calls[0][0]
    expect(first.where.id).toBe(`${catalog.source}-${catalog.items[0].slug}`)
    expect(first.create.metadata).toMatchObject({
      source: catalog.source,
      license: catalog.license,
    })
    expect(deleteMany.mock.calls[0][0].where.id.startsWith).toBe(`${catalog.source}-`)
  })
})
