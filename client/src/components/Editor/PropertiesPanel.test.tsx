import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as THREE from 'three'
import { describe, expect, test, vi } from 'vitest'
import PropertiesPanel from './PropertiesPanel'
import { setMeta } from '../../editor/scene/objectMeta'
import type { SceneObject } from '../../types/scene'

function box(name = 'Cube', colour = 0x336699): SceneObject {
  const group = new THREE.Group()
  group.add(
    new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: colour })),
  )
  group.position.set(1.5, 0, -2)
  group.scale.setScalar(2)
  return { id: 'obj-1', name, object3d: group }
}

function renderPanel(objects: SceneObject[], selectedId: string | null) {
  const props = {
    updateTransform: vi.fn(),
    updateObjectName: vi.fn(),
    updateObjectColor: vi.fn(),
    updateLightIntensity: vi.fn(),
    updateLightColor: vi.fn(),
    updateObjectTexture: vi.fn(),
  }
  render(<PropertiesPanel objects={objects} selectedId={selectedId} {...props} />)
  return props
}

describe('PropertiesPanel', () => {
  test('asks for a selection when nothing is selected', () => {
    renderPanel([box()], null)
    expect(screen.getByText('Select an object to see its properties.')).toBeInTheDocument()
  })

  test('walls and floors are explained, not editable', () => {
    const wall = box('Wall n1')
    setMeta(wall.object3d, { kind: 'wall', refId: 'n1' })
    renderPanel([wall], wall.id)
    expect(screen.getByText(/Walls and floors come from the 2D plan/)).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  test('shows the object’s name, colour, position and scale', () => {
    renderPanel([box()], 'obj-1')
    expect(screen.getByRole('textbox')).toHaveValue('Cube')
    expect(document.querySelector('input[type="color"]')).toHaveValue('#336699')
    const numbers = screen.getAllByRole('spinbutton')
    expect(numbers.slice(0, 3).map((n) => (n as HTMLInputElement).value)).toEqual([
      '1.50',
      '0.00',
      '-2.00',
    ])
    expect(numbers[3]).toHaveValue(2)
  })

  test('edits go to the editor with the object id', async () => {
    const props = renderPanel([box()], 'obj-1')

    await userEvent.type(screen.getByRole('textbox'), '!')
    expect(props.updateObjectName).toHaveBeenLastCalledWith('obj-1', 'Cube!')

    fireEvent.change(screen.getAllByRole('spinbutton')[2], { target: { value: '3.25' } })
    expect(props.updateTransform).toHaveBeenCalledWith('obj-1', 'position', 'z', 3.25)

    // One scale box resizes evenly on all three axes.
    fireEvent.change(screen.getAllByRole('spinbutton')[3], { target: { value: '0.5' } })
    expect(props.updateTransform.mock.calls.filter((c) => c[1] === 'scale')).toEqual([
      ['obj-1', 'scale', 'x', 0.5],
      ['obj-1', 'scale', 'y', 0.5],
      ['obj-1', 'scale', 'z', 0.5],
    ])

    fireEvent.change(document.querySelector('input[type="color"]')!, {
      target: { value: '#ff0000' },
    })
    expect(props.updateObjectColor).toHaveBeenCalledWith('obj-1', '#ff0000')
  })

  test('textures: picking a file, and removing it', async () => {
    const props = renderPanel([box()], 'obj-1')
    const file = new File(['png'], 'wood.png', { type: 'image/png' })
    await userEvent.upload(document.querySelector('#texture-upload') as HTMLInputElement, file)
    expect(props.updateObjectTexture).toHaveBeenCalledWith('obj-1', file)
    await userEvent.click(screen.getByRole('button', { name: 'Remove Texture' }))
    expect(props.updateObjectTexture).toHaveBeenLastCalledWith('obj-1', null)
  })

  test('lights get intensity and light colour instead of material settings', () => {
    const light = box('Light')
    Object.assign(light.object3d.userData, { isLight: true, intensity: 2.5, lightColor: 0x00ff00 })
    const props = renderPanel([light], 'obj-1')

    expect(screen.queryByText('Texture (Diffuse)')).not.toBeInTheDocument()
    expect(screen.getByText('Light Settings')).toBeInTheDocument()
    expect(document.querySelector('input[type="color"]')).toHaveValue('#00ff00')

    fireEvent.change(screen.getAllByRole('slider')[1], { target: { value: '4' } })
    expect(props.updateLightIntensity).toHaveBeenCalledWith('obj-1', 4)
    fireEvent.change(document.querySelector('input[type="color"]')!, {
      target: { value: '#0000ff' },
    })
    expect(props.updateLightColor).toHaveBeenCalledWith('obj-1', 0x0000ff)
  })
})
