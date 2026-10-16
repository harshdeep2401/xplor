"""
Segmentation mask -> detection-v1 vectors.

The segmenter labels pixels; the Node bridge needs wall centre lines, opening
centres and room polygons. This module does that conversion:

Walls
  1. Wall + door + window pixels form one "structure" mask. Doors and windows
     sit inside walls, so leaving them out would cut every wall at every
     opening; the 3D converter carves the openings back out of the walls.
  2. Skeletonize the structure to 1-px centre lines and trace the skeleton
     into a graph: nodes at junctions and free ends, edges as pixel paths.
  3. Simplify each path into straight segments (Douglas-Peucker). Segments
     share node objects, so connected walls keep meeting exactly.
  4. Clean up: prune the short spurs skeletonization leaves at thick corners
     and wall ends, merge collinear pieces, snap near-horizontal/vertical
     segments to exactly horizontal/vertical, extend free ends to the wall's
     end, and measure each wall's thickness from the distance transform.
  (Corners the model left open are closed later by the bridge's weldWalls.)

Doors / windows
  Each connected blob of door (window) pixels becomes one opening: centre of
  its minimum-area rectangle, width = the rectangle's long side.

Rooms
  Each connected region of room pixels becomes a simplified polygon.

All size thresholds are relative to the median wall thickness, so the same
code works for small scans and large photos.
"""

import math

import cv2
import numpy as np
from skimage.morphology import skeletonize

from app.schemas import DetectionResult, Door, Room, Wall, Window

BACKGROUND, WALL, DOOR, WINDOW, ROOM = range(5)

# Segments within this angle of horizontal/vertical are made exactly so.
AXIS_SNAP_DEG = 8.0
# Adjacent segments whose directions differ by less than this are merged.
COLLINEAR_DEG = 5.0

_NEIGHBOURS = ((-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1))


def vectorize(mask: np.ndarray, scale: float = 1.0) -> DetectionResult:
    """
    mask: HxW uint8 class ids (see segmenter.CLASSES).
    scale: factor from mask pixels to source-image pixels (the mask may have
    been produced at a reduced size); all output coordinates are multiplied
    by it.
    """
    structure = np.isin(mask, (WALL, DOOR, WINDOW)).astype(np.uint8)
    structure = cv2.morphologyEx(structure, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    skeleton = skeletonize(structure.astype(bool))
    if not skeleton.any():
        return DetectionResult()

    dist = cv2.distanceTransform(structure, cv2.DIST_L2, 5)
    # Distance at the centre line is ~half the wall width.
    thickness = max(1.0, 2.0 * float(np.median(dist[skeleton])) - 1.0)

    # Specks (text, symbols the model half-labelled as wall) and their skeletons.
    structure = _drop_small_components(structure, min_area=6 * thickness * thickness)
    skeleton &= structure.astype(bool)

    walls = _walls(skeleton, dist, thickness, scale)
    doors = [
        Door(id=f"door_{i + 1}", x=x, y=y, width=width)
        for i, (x, y, width) in enumerate(_openings(mask, DOOR, thickness, scale))
    ]
    windows = [
        Window(id=f"window_{i + 1}", x=x, y=y, width=width)
        for i, (x, y, width) in enumerate(_openings(mask, WINDOW, thickness, scale))
    ]
    rooms = _rooms(mask, thickness, scale)
    return DetectionResult(walls=walls, rooms=rooms, doors=doors, windows=windows)


# ---------------------------------------------------------------------------
# Walls
# ---------------------------------------------------------------------------

def _walls(skeleton: np.ndarray, dist: np.ndarray, thickness: float, scale: float) -> list[Wall]:
    nodes, edges = _skeleton_graph(skeleton)
    eps = max(2.0, thickness / 2)
    pos: list[list[float]] = [list(p) for p in nodes]
    segs: list[tuple[int, int]] = []

    for a, b, path in edges:
        if len(path) < 2:
            continue
        if a == b:
            # A closed loop (e.g. a free-standing room outline). Split it at
            # its farthest point so each half has two distinct ends.
            if len(path) < 4:
                continue
            p = np.array(path, np.float32)
            k = int(np.argmax(np.hypot(*(p - p[0]).T)))
            pos.append([float(p[k][0]), float(p[k][1])])
            mid = len(pos) - 1
            pieces = [(a, mid, path[: k + 1]), (mid, b, path[k:])]
        else:
            pieces = [(a, b, path)]

        for na, nb, piece in pieces:
            pts = np.array(piece, np.float32).reshape(-1, 1, 2)
            approx = cv2.approxPolyDP(pts, eps, closed=False).reshape(-1, 2)
            chain = [na]
            for x, y in approx[1:-1]:
                pos.append([float(x), float(y)])
                chain.append(len(pos) - 1)
            chain.append(nb)
            segs.extend((u, v) for u, v in zip(chain, chain[1:]) if u != v)

    segs = _prune(pos, segs, spur_len=1.5 * thickness, min_isolated_len=3 * thickness)
    segs = _merge_collinear(pos, segs)
    _snap_to_axes(pos, segs)
    _extend_free_ends(pos, segs, thickness / 2)

    walls = []
    for a, b in segs:
        (x1, y1), (x2, y2) = pos[a], pos[b]
        if math.hypot(x2 - x1, y2 - y1) < 1.0:
            continue
        t = _segment_thickness(dist, (x1, y1), (x2, y2), fallback=thickness)
        walls.append(
            Wall(
                id=f"wall_{len(walls) + 1}",
                startX=round(x1 * scale, 1),
                startY=round(y1 * scale, 1),
                endX=round(x2 * scale, 1),
                endY=round(y2 * scale, 1),
                thickness=round(t * scale, 1),
            )
        )
    return walls


def _skeleton_graph(skeleton: np.ndarray):
    """
    Trace a 1-px skeleton into a graph.

    Nodes are skeleton pixels whose neighbour count isn't 2 (free ends and
    junctions), with touching node pixels merged into one node at their
    centroid. Edges are the pixel paths between nodes, as (node_a, node_b,
    [(x, y), ...]). Rings with no node get a node at an arbitrary pixel and
    come back as a == b edges.
    """
    sk = skeleton.astype(np.uint8)
    h, w = sk.shape
    counts = cv2.filter2D(sk, cv2.CV_16S, np.ones((3, 3), np.float32), borderType=cv2.BORDER_CONSTANT) - sk
    special = ((sk == 1) & (counts != 2)).astype(np.uint8)
    n_nodes, node_of, _, centroids = cv2.connectedComponentsWithStats(special, connectivity=8)
    node_of = node_of.astype(np.int32)  # 0 = not a node pixel
    nodes = [(float(cx), float(cy)) for cx, cy in centroids]  # [0] is unused
    visited = np.zeros((h, w), bool)
    edges = []

    def neighbours(y, x):
        for dy, dx in _NEIGHBOURS:
            yy, xx = y + dy, x + dx
            if 0 <= yy < h and 0 <= xx < w and sk[yy, xx]:
                yield yy, xx

    def walk(start, y, x):
        """Follow a path that leaves node pixel `start` through (y, x)."""
        prev = start
        path = [(start[1], start[0]), (x, y)]
        while True:
            label = node_of[y, x]
            if label:
                return label, path
            # Not a node, so exactly two neighbours: where we came from, and next.
            nxt = next((p for p in neighbours(y, x) if p != prev), None)
            if nxt is None:
                return None, path
            if not node_of[nxt]:
                if visited[nxt]:
                    return None, path
                visited[nxt] = True
            prev, (y, x) = (y, x), nxt
            path.append((x, y))

    def trace_from(y, x):
        start_label = node_of[y, x]
        for ny, nx in neighbours(y, x):
            if node_of[ny, nx] or visited[ny, nx]:
                continue
            visited[ny, nx] = True
            end_label, path = walk((y, x), ny, nx)
            if end_label:
                edges.append((start_label, end_label, path))

    for y, x in np.argwhere(special):
        trace_from(y, x)

    # Rings: skeleton loops with no junction or free end anywhere on them.
    for y, x in np.argwhere(sk.astype(bool) & ~special.astype(bool)):
        if visited[y, x] or node_of[y, x]:
            continue
        nodes.append((float(x), float(y)))
        node_of[y, x] = len(nodes) - 1
        visited[y, x] = True
        trace_from(y, x)

    return nodes, edges


def _length(pos, seg) -> float:
    (x1, y1), (x2, y2) = pos[seg[0]], pos[seg[1]]
    return math.hypot(x2 - x1, y2 - y1)


def _direction(pos, seg) -> float:
    """Undirected angle in degrees, [0, 180)."""
    (x1, y1), (x2, y2) = pos[seg[0]], pos[seg[1]]
    return math.degrees(math.atan2(y2 - y1, x2 - x1)) % 180.0


def _degrees(segs) -> dict[int, int]:
    deg: dict[int, int] = {}
    for a, b in segs:
        deg[a] = deg.get(a, 0) + 1
        deg[b] = deg.get(b, 0) + 1
    return deg


def _prune(pos, segs, spur_len: float, min_isolated_len: float):
    """Drop short spurs off junctions, then short isolated fragments."""
    for _ in range(2):
        deg = _degrees(segs)
        kept = []
        for seg in segs:
            da, db = deg[seg[0]], deg[seg[1]]
            length = _length(pos, seg)
            is_spur = min(da, db) == 1 and max(da, db) >= 3 and length < spur_len
            is_fragment = da == 1 and db == 1 and length < min_isolated_len
            if not (is_spur or is_fragment):
                kept.append(seg)
        if len(kept) == len(segs):
            break
        segs = kept
    return segs


def _merge_collinear(pos, segs):
    """Join two segments that meet end to end (at a node with nothing else
    attached) and point the same way."""
    segs = list(segs)
    changed = True
    while changed:
        changed = False
        incident: dict[int, list[int]] = {}
        for i, (a, b) in enumerate(segs):
            incident.setdefault(a, []).append(i)
            incident.setdefault(b, []).append(i)
        for node, idx in incident.items():
            if len(idx) != 2:
                continue
            i, j = idx
            if i == j:
                continue
            diff = abs(_direction(pos, segs[i]) - _direction(pos, segs[j]))
            if min(diff, 180.0 - diff) >= COLLINEAR_DEG:
                continue
            far_i = segs[i][0] if segs[i][1] == node else segs[i][1]
            far_j = segs[j][0] if segs[j][1] == node else segs[j][1]
            if far_i == far_j:
                continue
            segs = [s for k, s in enumerate(segs) if k not in (i, j)] + [(far_i, far_j)]
            changed = True
            break
    return segs


def _axis(pos, seg) -> str | None:
    angle = _direction(pos, seg)
    if min(angle, 180.0 - angle) <= AXIS_SNAP_DEG:
        return "h"
    if abs(angle - 90.0) <= AXIS_SNAP_DEG:
        return "v"
    return None


def _snap_to_axes(pos, segs) -> None:
    """Make near-horizontal/vertical segments exact by moving the nodes, so
    walls that share a node still share it afterwards.

    Horizontal segments joined through shared nodes form one wall line (e.g.
    the two halves of a wall split by a T-junction); every node on that line
    gets the line's mean y. Same for vertical lines and x."""
    for kind, coord in (("h", 1), ("v", 0)):
        parent: dict[int, int] = {}

        def find(n: int) -> int:
            while parent.setdefault(n, n) != n:
                parent[n] = parent[parent[n]]
                n = parent[n]
            return n

        for a, b in segs:
            if _axis(pos, (a, b)) == kind:
                parent[find(a)] = find(b)

        lines: dict[int, list[int]] = {}
        for n in parent:
            lines.setdefault(find(n), []).append(n)
        for members in lines.values():
            value = sum(pos[n][coord] for n in members) / len(members)
            for n in members:
                pos[n][coord] = value


def _extend_free_ends(pos, segs, amount: float) -> None:
    """The skeleton stops about half a wall thickness short of a wall's free
    end; push free ends out by that much."""
    deg = _degrees(segs)
    for a, b in segs:
        for end, other in ((a, b), (b, a)):
            if deg[end] != 1:
                continue
            dx, dy = pos[end][0] - pos[other][0], pos[end][1] - pos[other][1]
            length = math.hypot(dx, dy)
            if length > 0:
                pos[end][0] += dx / length * amount
                pos[end][1] += dy / length * amount


def _segment_thickness(dist: np.ndarray, p1, p2, fallback: float) -> float:
    """2 x the distance-to-edge along the middle of the segment."""
    h, w = dist.shape
    samples = []
    for t in np.linspace(0.2, 0.8, 9):
        x = int(round(p1[0] + (p2[0] - p1[0]) * t))
        y = int(round(p1[1] + (p2[1] - p1[1]) * t))
        if 0 <= x < w and 0 <= y < h and dist[y, x] > 0:
            samples.append(float(dist[y, x]))
    if not samples:
        return fallback
    return max(1.0, 2.0 * float(np.median(samples)) - 1.0)


def _drop_small_components(binary: np.ndarray, min_area: float) -> np.ndarray:
    n, labels, stats, _ = cv2.connectedComponentsWithStats(binary, connectivity=8)
    keep = np.zeros(n, bool)
    keep[1:] = stats[1:, cv2.CC_STAT_AREA] >= min_area
    return keep[labels].astype(np.uint8)


# ---------------------------------------------------------------------------
# Openings and rooms
# ---------------------------------------------------------------------------

def _openings(mask: np.ndarray, cls: int, thickness: float, scale: float):
    """(x, y, width) per connected blob of class `cls`."""
    binary = (mask == cls).astype(np.uint8)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(binary, connectivity=8)
    out = []
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] < max(4.0, 0.5 * thickness * thickness):
            continue
        ys, xs = np.nonzero(labels[
            stats[i, cv2.CC_STAT_TOP]: stats[i, cv2.CC_STAT_TOP] + stats[i, cv2.CC_STAT_HEIGHT],
            stats[i, cv2.CC_STAT_LEFT]: stats[i, cv2.CC_STAT_LEFT] + stats[i, cv2.CC_STAT_WIDTH],
        ] == i)
        pts = np.column_stack((xs + stats[i, cv2.CC_STAT_LEFT], ys + stats[i, cv2.CC_STAT_TOP])).astype(np.float32)
        (cx, cy), (rw, rh), _ = cv2.minAreaRect(pts)
        width = max(rw, rh)
        if width < max(4.0, thickness):
            continue
        out.append((round(cx * scale, 1), round(cy * scale, 1), round(width * scale, 1)))
    # Stable order (top-to-bottom, left-to-right) so ids are deterministic.
    out.sort(key=lambda o: (o[1], o[0]))
    return out


def _rooms(mask: np.ndarray, thickness: float, scale: float) -> list[Room]:
    binary = (mask == ROOM).astype(np.uint8)
    binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    min_area = max(16 * thickness * thickness, 0.0005 * mask.shape[0] * mask.shape[1])
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    rooms = []
    for contour in sorted(contours, key=lambda c: tuple(cv2.boundingRect(c)[1::-1])):
        area = cv2.contourArea(contour)
        if area < min_area:
            continue
        approx = cv2.approxPolyDP(contour, max(1.5, thickness / 2), closed=True).reshape(-1, 2)
        if len(approx) < 3:
            continue
        rooms.append(
            Room(
                id=f"room_{len(rooms) + 1}",
                points=[[round(float(x) * scale, 1), round(float(y) * scale, 1)] for x, y in approx],
                areaPx=round(float(area) * scale * scale, 1),
            )
        )
    return rooms
