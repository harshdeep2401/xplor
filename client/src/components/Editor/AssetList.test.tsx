import { fireEvent, render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, test } from 'vitest'
import AssetList, { ASSET_DRAG_TYPE } from './AssetList'
import { API, catalogItem, server } from '../../test/server'

const sofa = catalogItem()
const lamp = catalogItem({
  id: 'kenney-lampRoundFloor',
  name: 'Round floor lamp',
  category: 'lighting',
  thumbnailUrl: null,
  dimensions: null,
  roomTypes: ['living', 'bedroom'],
  tags: ['lamp'],
})

const serveAssets = (assets: unknown[]) =>
  server.use(http.get(`${API}/assets`, () => HttpResponse.json({ assets })))

describe('AssetList', () => {
  test('lists the catalog with real-world sizes (width × depth × height, in cm)', async () => {
    serveAssets([sofa, lamp])
    render(<AssetList />)
    expect(screen.getByText('Loading furniture…')).toBeInTheDocument()

    expect(await screen.findByText('Sofa')).toBeInTheDocument()
    expect(screen.getByText('210 × 90 × 85 cm')).toBeInTheDocument()
    expect(screen.getByText('Round floor lamp')).toBeInTheDocument()
    // Thumbnails come from the API's origin, not the page's.
    expect(document.querySelector('img')).toHaveAttribute(
      'src',
      'http://api.test/static/furniture/previews/loungeSofa.png',
    )
  })

  test('the search matches every word against name, category, tags and rooms', async () => {
    serveAssets([sofa, lamp])
    const { rerender } = render(<AssetList query="bedroom lamp" />)
    expect(await screen.findByText('Round floor lamp')).toBeInTheDocument()
    expect(screen.queryByText('Sofa')).not.toBeInTheDocument()

    rerender(<AssetList query="  couch " />)
    expect(screen.getByText('Sofa')).toBeInTheDocument()

    rerender(<AssetList query="piano" />)
    expect(screen.getByText('Nothing matches “piano”.')).toBeInTheDocument()
  })

  test('dragging an item carries it as JSON for the 3D editor', async () => {
    serveAssets([sofa])
    render(<AssetList />)
    const row = (await screen.findByText('Sofa')).closest('[draggable="true"]')!
    const data = new Map<string, string>()
    const dataTransfer = { setData: (k: string, v: string) => data.set(k, v), effectAllowed: '' }
    fireEvent.dragStart(row, { dataTransfer })
    expect(JSON.parse(data.get(ASSET_DRAG_TYPE)!)).toEqual(sofa)
    expect(dataTransfer.effectAllowed).toBe('copy')
  })

  test('an empty catalog says so', async () => {
    serveAssets([])
    render(<AssetList />)
    expect(await screen.findByText('The furniture library is empty.')).toBeInTheDocument()
  })

  test('a server error shows the server’s message', async () => {
    server.use(
      http.get(`${API}/assets`, () =>
        HttpResponse.json(
          { message: 'Please sign in to continue.', code: 'NO_TOKEN' },
          { status: 403 },
        ),
      ),
    )
    render(<AssetList />)
    expect(await screen.findByText('Please sign in to continue.')).toBeInTheDocument()
  })

  test('a malformed response is reported, not rendered', async () => {
    server.use(http.get(`${API}/assets`, () => HttpResponse.text('<html>Bad gateway</html>')))
    render(<AssetList />)
    expect(
      await screen.findByText(
        'The server sent an unexpected furniture list. Try reloading the page.',
      ),
    ).toBeInTheDocument()
  })
})
