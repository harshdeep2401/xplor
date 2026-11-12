import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import * as THREE from 'three'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import Toolbar from './Toolbar'
import SceneList from './SceneList'
import { API, catalogItem, server } from '../../test/server'

beforeEach(() => {
  server.use(
    http.get(`${API}/assets`, () =>
      HttpResponse.json({
        assets: [catalogItem(), catalogItem({ id: 'b', name: 'Bookcase', tags: [] })],
      }),
    ),
  )
})

function renderToolbar(selectedId: string | null = null) {
  const props = {
    addCube: vi.fn(),
    addSphere: vi.fn(),
    addLight: vi.fn(),
    handleFile: vi.fn(async () => {}),
    deleteSelected: vi.fn(),
    exportGLTF: vi.fn(),
    exportGLB: vi.fn(),
    saveToBackend: vi.fn(),
    onImportFromUrl: vi.fn(),
  }
  render(<Toolbar {...props} selectedId={selectedId} />)
  return props
}

describe('Toolbar', () => {
  test('each button runs its action', async () => {
    const props = renderToolbar('obj-1')
    for (const [name, fn] of [
      ['Add Cube', props.addCube],
      ['Add Sphere', props.addSphere],
      ['Add Light', props.addLight],
      ['Delete Selected', props.deleteSelected],
      ['Export as GLB', props.exportGLB],
      ['Save Project', props.saveToBackend],
    ] as const) {
      await userEvent.click(screen.getByRole('button', { name }))
      expect(fn).toHaveBeenCalledOnce()
    }
  })

  test('Delete is disabled with nothing selected', () => {
    renderToolbar(null)
    expect(screen.getByRole('button', { name: 'Delete Selected' })).toBeDisabled()
  })

  test('importing a .glb passes the file on', async () => {
    const props = renderToolbar()
    const file = new File(['glb'], 'chair.glb', { type: 'model/gltf-binary' })
    await userEvent.upload(screen.getByLabelText('Import Model (.glb)'), file)
    expect(props.handleFile).toHaveBeenCalledWith(file)
  })

  test('the search box filters the furniture list', async () => {
    renderToolbar()
    expect(await screen.findByText('Bookcase')).toBeInTheDocument()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search furniture' }), 'sofa')
    expect(screen.getByText('Sofa')).toBeInTheDocument()
    expect(screen.queryByText('Bookcase')).not.toBeInTheDocument()
  })
})

describe('SceneList', () => {
  const objects = ['Sofa', 'Wall n1'].map((name, i) => ({
    id: `o${i}`,
    name,
    object3d: new THREE.Group(),
  }))

  test('lists objects, marks the selected one, and selects on click', async () => {
    const onSelect = vi.fn()
    render(<SceneList objects={objects} selectedId="o1" onSelect={onSelect} />)
    expect(screen.getByRole('button', { name: 'Wall n1' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Sofa' })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(screen.getByRole('button', { name: 'Sofa' }))
    expect(onSelect).toHaveBeenCalledWith('o0')
  })

  test('an empty scene explains how to add things', () => {
    render(<SceneList objects={[]} selectedId={null} onSelect={vi.fn()} />)
    expect(screen.getByText(/Nothing in the scene yet/)).toBeInTheDocument()
  })
})
