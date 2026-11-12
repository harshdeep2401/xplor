import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import PropertiesSidebar from './PropertiesSidebar'
import Topbar2D from './Topbar2D'
import ToolPalette from './ToolPalette'
import ImportBanner from './ImportBanner'
import type { EditorElement } from '../../editor/canvas/elements'
import type { MeasureTools } from '../../pages/editor2d/useMeasureTools'

const measure = (overrides: Partial<MeasureTools> = {}): MeasureTools => ({
  measureLine: null,
  setMeasureLine: vi.fn(),
  measurePx: 0,
  calibration: null,
  setCalibration: vi.fn(),
  calibrationPx: 0,
  calibrationMetres: '',
  setCalibrationMetres: vi.fn(),
  proposedScale: null,
  canApplyCalibration: false,
  clearCalibration: vi.fn(),
  applyCalibration: vi.fn(() => false),
  ...overrides,
})

function renderSidebar(props: Partial<Parameters<typeof PropertiesSidebar>[0]> = {}) {
  const handlers = {
    onApplyCalibration: vi.fn(),
    onPatch: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
  }
  render(
    <PropertiesSidebar
      activeTool="select"
      pixelsPerMetre={100}
      measure={measure()}
      selectedCount={0}
      selectedElement={undefined}
      {...handlers}
      {...props}
    />,
  )
  return handlers
}

const wall: EditorElement = {
  id: 'w1',
  type: 'wall',
  startX: 0,
  startY: 0,
  endX: 300,
  endY: 400,
  thickness: 20,
}

describe('PropertiesSidebar', () => {
  test('with nothing selected it lists the keyboard shortcuts', () => {
    renderSidebar()
    expect(screen.getByRole('heading', { name: 'Properties' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Keyboard shortcuts' })).toBeInTheDocument()
  })

  test('a wall: length and thickness in metres; editing the length keeps its direction', async () => {
    const { onPatch } = renderSidebar({ selectedCount: 1, selectedElement: wall })
    const lengthBox = screen.getByLabelText('Length (m)')
    expect(lengthBox).toHaveValue(5) // 500 px at 100 px/m
    expect(screen.getByLabelText('Thickness (m)')).toHaveValue(0.2)

    await userEvent.clear(lengthBox)
    await userEvent.type(lengthBox, '10')
    expect(onPatch).toHaveBeenLastCalledWith('w1', { endX: 600, endY: 800 })

    fireEvent.change(screen.getByLabelText('Thickness (m)'), { target: { value: '0.3' } })
    expect(onPatch).toHaveBeenLastCalledWith('w1', { thickness: 30 })

    fireEvent.change(screen.getByLabelText('Curvature'), { target: { value: '50' } })
    expect(onPatch).toHaveBeenLastCalledWith('w1', { curvature: 50 })
  })

  test('a door: width and rotation; a window also has its drawn thickness', () => {
    const door: EditorElement = {
      id: 'd1',
      type: 'door',
      x: 0,
      y: 0,
      width: 90,
      height: 4,
      rotation: 0,
    }
    const { onPatch } = renderSidebar({ selectedCount: 1, selectedElement: door })
    expect(screen.getByLabelText('Width (m)')).toHaveValue(0.9)
    expect(screen.queryByLabelText('Drawn thickness (m)')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Rotation'), { target: { value: '90' } })
    expect(onPatch).toHaveBeenCalledWith('d1', { rotation: 90 })
    fireEvent.change(screen.getByLabelText('Width (m)'), { target: { value: '1.2' } })
    expect(onPatch).toHaveBeenLastCalledWith('d1', { width: 120 })
  })

  test('a window also has its drawn thickness', () => {
    const win: EditorElement = {
      id: 'win',
      type: 'window',
      x: 0,
      y: 0,
      startX: 0,
      startY: 0,
      width: 120,
      height: 30,
      rotation: 0,
      curvature: 0,
      attachedWallId: null,
    }
    const { onPatch } = renderSidebar({ selectedCount: 1, selectedElement: win })
    expect(screen.getByLabelText('Drawn thickness (m)')).toHaveValue(0.3)
    fireEvent.change(screen.getByLabelText('Drawn thickness (m)'), { target: { value: '0.1' } })
    expect(onPatch).toHaveBeenLastCalledWith('win', { height: 10 })
  })

  test('a label: renaming it', async () => {
    const label: EditorElement = { id: 'l1', type: 'label', x: 0, y: 0, text: 'Room', fontSize: 24 }
    const { onPatch } = renderSidebar({ selectedCount: 1, selectedElement: label })
    await userEvent.type(screen.getByLabelText('Room Name'), 's')
    expect(onPatch).toHaveBeenLastCalledWith('l1', { text: 'Rooms' })
    fireEvent.change(screen.getByLabelText('Font Size'), { target: { value: '30' } })
    expect(onPatch).toHaveBeenLastCalledWith('l1', { fontSize: 30 })
  })

  test('several selected: count, duplicate and delete', async () => {
    const h = renderSidebar({ selectedCount: 3 })
    expect(screen.getByRole('heading', { name: 'Selection' })).toBeInTheDocument()
    expect(screen.getByText('3 items')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Duplicate/ }))
    await userEvent.click(screen.getByRole('button', { name: /Delete/ }))
    expect(h.onDuplicate).toHaveBeenCalledOnce()
    expect(h.onDelete).toHaveBeenCalledOnce()
  })

  test('calibrate: Apply is enabled once there is a line and a length', async () => {
    const setCalibrationMetres = vi.fn()
    const { onApplyCalibration } = renderSidebar({
      activeTool: 'calibrate',
      measure: measure({
        calibrationPx: 412,
        calibrationMetres: '4',
        setCalibrationMetres,
        proposedScale: 103,
        canApplyCalibration: true,
      }),
    })
    expect(screen.getByRole('heading', { name: 'Calibrate Scale' })).toBeInTheDocument()
    expect(screen.getByText('412 px')).toBeInTheDocument()
    expect(screen.getByText('103.00 px/m')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Real length (m)'), '{Enter}')
    await userEvent.click(screen.getByRole('button', { name: 'Apply scale' }))
    expect(onApplyCalibration).toHaveBeenCalledTimes(2)
  })

  test('calibrate without a line: the length box and Apply are disabled', () => {
    renderSidebar({ activeTool: 'calibrate' })
    expect(screen.getByLabelText('Real length (m)')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Apply scale' })).toBeDisabled()
  })

  test('measure: the distance in metres', () => {
    renderSidebar({ activeTool: 'measure', measure: measure({ measurePx: 250 }) })
    expect(screen.getByText('2.50 m')).toBeInTheDocument()
  })
})

describe('Topbar2D, tools and import banner', () => {
  const topbar = (props: Partial<Parameters<typeof Topbar2D>[0]> = {}) => {
    const h = {
      onBack: vi.fn(),
      onPixelsPerMetreChange: vi.fn(),
      onWallHeightChange: vi.fn(),
      onShowTraceChange: vi.fn(),
      onTraceOpacityChange: vi.fn(),
      onUndo: vi.fn(),
      onRedo: vi.fn(),
      onZoomIn: vi.fn(),
      onZoomOut: vi.fn(),
      onFit: vi.fn(),
      onExport: vi.fn(),
      onConvert: vi.fn(),
    }
    render(
      <Topbar2D
        projectName="Flat"
        saveStatus="Saved"
        pixelsPerMetre={100}
        wallHeight={2.8}
        hasTrace={false}
        showTrace
        traceOpacity={0.5}
        canUndo
        canRedo={false}
        zoomPercent={30}
        {...h}
        {...props}
      />,
    )
    return h
  }

  test('top bar: status, zoom, actions, and scale values never below their minimum', async () => {
    const h = topbar()
    expect(screen.getByRole('status')).toHaveTextContent('Saved')
    expect(screen.getByText('30%')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled()
    for (const [name, fn] of [
      ['Back to dashboard', h.onBack],
      ['Undo', h.onUndo],
      ['Zoom In', h.onZoomIn],
      ['Zoom Out', h.onZoomOut],
      ['Fit', h.onFit],
      ['Export', h.onExport],
      ['Convert to 3D', h.onConvert],
    ] as const) {
      await userEvent.click(screen.getByRole('button', { name }))
      expect(fn).toHaveBeenCalledOnce()
    }
    fireEvent.change(screen.getByLabelText(/px\/m/), { target: { value: '0' } })
    expect(h.onPixelsPerMetreChange).toHaveBeenCalledWith(1)
    fireEvent.change(screen.getByLabelText(/wall h/), { target: { value: '-3' } })
    expect(h.onWallHeightChange).toHaveBeenCalledWith(0.1)
    expect(screen.queryByLabelText('Trace image opacity')).not.toBeInTheDocument()
  })

  test('trace controls appear for an uploaded plan; opacity is off while hidden', async () => {
    const h = topbar({ hasTrace: true, showTrace: false })
    expect(screen.getByLabelText('Trace image opacity')).toBeDisabled()
    await userEvent.click(screen.getByLabelText('Trace'))
    expect(h.onShowTraceChange).toHaveBeenCalledWith(true)
    fireEvent.change(screen.getByLabelText('Trace image opacity'), { target: { value: '0.8' } })
    expect(h.onTraceOpacityChange).toHaveBeenCalledWith(0.8)
  })

  test('tool palette: the active tool is pressed; clicking picks another', async () => {
    const onSelect = vi.fn()
    render(<ToolPalette activeTool="wall" onSelect={onSelect} />)
    expect(screen.getByRole('button', { name: 'Wall' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Door' }))
    expect(onSelect).toHaveBeenCalledWith('door')
  })

  test('import banner: success and failure wording, and dismiss', async () => {
    const onDismiss = vi.fn()
    const { rerender } = render(
      <ImportBanner result={{ status: 'completed', wallCount: 1 }} onDismiss={onDismiss} />,
    )
    expect(screen.getByText(/Detected 1 wall from your floor plan/)).toBeInTheDocument()
    rerender(<ImportBanner result={{ status: 'failed', error: 'timeout' }} onDismiss={onDismiss} />)
    expect(screen.getByText(/Wall detection failed \(timeout\)/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onDismiss).toHaveBeenCalledOnce()
  })
})
