"""Mask -> vector conversion, on hand-drawn synthetic masks (no model needed)."""

import cv2
import numpy as np

from app.services.vectorize import DOOR, ROOM, WALL, WINDOW, vectorize

T = 10  # wall thickness in px


def two_room_plan() -> np.ndarray:
    """400x300 plan: outer walls, one dividing wall at x=200 with a door in
    it, one window in the top wall, two rooms."""
    mask = np.zeros((300, 400), np.uint8)
    cv2.rectangle(mask, (50, 50), (350, 250), ROOM, -1)
    cv2.rectangle(mask, (50, 50), (350, 250), WALL, T)
    cv2.line(mask, (200, 50), (200, 250), WALL, T)
    mask[130:170, 195:206] = DOOR  # in the dividing wall, centred at (200, 150)
    mask[45:56, 90:150] = WINDOW  # in the top wall, centred at (120, 50)
    return mask


def endpoints(walls):
    return [(w.startX, w.startY) for w in walls] + [(w.endX, w.endY) for w in walls]


def test_two_room_plan_walls_are_straight_and_connected():
    result = vectorize(two_room_plan())

    assert 5 <= len(result.walls) <= 8
    for w in result.walls:
        assert w.startX == w.endX or w.startY == w.endY, f"{w} is not axis-aligned"
        assert 5 <= w.thickness <= 16

    # Closed network: every endpoint is shared with another wall.
    ends = endpoints(result.walls)
    for p in ends:
        assert ends.count(p) >= 2, f"{p} is a dangling wall end"

    # The outline follows the drawn centre lines (x 50..350, y 50..250).
    xs = sorted({x for x, _ in ends})
    ys = sorted({y for _, y in ends})
    assert abs(xs[0] - 50) <= 3 and abs(xs[-1] - 350) <= 3
    assert abs(ys[0] - 50) <= 3 and abs(ys[-1] - 250) <= 3
    assert any(abs(x - 200) <= 3 for x in xs)


def test_two_room_plan_openings_and_rooms():
    result = vectorize(two_room_plan())

    assert len(result.doors) == 1
    door = result.doors[0]
    assert abs(door.x - 200) <= 2 and abs(door.y - 150) <= 2
    assert 35 <= door.width <= 45

    assert len(result.windows) == 1
    window = result.windows[0]
    assert abs(window.x - 120) <= 2 and abs(window.y - 50) <= 2
    assert 55 <= window.width <= 65

    assert len(result.rooms) == 2
    for room in result.rooms:
        assert len(room.points) >= 4


def test_scale_maps_coordinates_back_to_the_source_image():
    small = vectorize(two_room_plan())
    scaled = vectorize(two_room_plan(), scale=2.0)

    assert len(scaled.walls) == len(small.walls)
    for a, b in zip(small.walls, scaled.walls):
        assert abs(b.startX - 2 * a.startX) <= 0.2 and abs(b.endY - 2 * a.endY) <= 0.2
        assert abs(b.thickness - 2 * a.thickness) <= 0.2
    assert abs(scaled.doors[0].width - 2 * small.doors[0].width) <= 0.2
    assert abs(scaled.rooms[0].areaPx - 4 * small.rooms[0].areaPx) <= 1


def test_specks_are_ignored():
    mask = two_room_plan()
    mask[280:284, 10:14] = WALL  # a stray 4x4 "wall" outside the plan
    mask[10:13, 380:384] = DOOR  # and a stray door speck
    result = vectorize(mask)

    assert all(max(w.startY, w.endY) < 270 for w in result.walls)
    assert len(result.doors) == 1


def test_empty_mask_gives_empty_result():
    result = vectorize(np.zeros((100, 100), np.uint8))
    assert result.walls == [] and result.doors == [] and result.windows == [] and result.rooms == []
