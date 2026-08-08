"""
Heuristic floor-plan detector using classical OpenCV (no trained model yet).

Pipeline:
  1. Decode image, convert to grayscale.
  2. Binarize (adaptive threshold) to separate line-work from background.
  3. Detect straight line segments with the probabilistic Hough transform ->
     candidate walls.
  4. Merge near-collinear/overlapping segments so one drawn wall doesn't
     become a dozen tiny fragments.
  5. Find large enclosed contours in the binary mask -> candidate rooms.

This is intentionally simple and will misfire on real-world floor plans
(furniture symbols, dimension lines, and text will all look like "walls"
to a Hough transform). It exists to prove the Node <-> FastAPI wire-up with
a real (if rough) CV pipeline instead of a mock. Swapping this module out
for a trained model later doesn't require touching main.py or the router —
only detect() needs to change shape-compatibly.
"""

import time
import uuid

import cv2
import numpy as np

from app.config import settings
from app.schemas import DetectionResult, DetectionMetadata, Wall, Room


def _merge_lines(lines: np.ndarray, angle_tol_deg: float = 5.0, dist_tol_px: float = 12.0):
    """
    Collapse near-duplicate/near-collinear Hough segments into fewer,
    longer walls. Greedy: sort by length, absorb any remaining segment
    whose endpoints are close to an already-kept line's infinite extension
    and whose angle matches.
    """
    if lines is None or len(lines) == 0:
        return []

    segments = [tuple(l[0]) for l in lines]

    def angle(seg):
        x1, y1, x2, y2 = seg
        return np.degrees(np.arctan2(y2 - y1, x2 - x1)) % 180

    def length(seg):
        x1, y1, x2, y2 = seg
        return np.hypot(x2 - x1, y2 - y1)

    segments.sort(key=length, reverse=True)

    kept = []
    for seg in segments:
        x1, y1, x2, y2 = seg
        a = angle(seg)
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2

        duplicate = False
        for k in kept:
            kx1, ky1, kx2, ky2 = k
            ka = angle(k)
            angle_diff = min(abs(a - ka), 180 - abs(a - ka))
            if angle_diff > angle_tol_deg:
                continue
            kmx, kmy = (kx1 + kx2) / 2, (ky1 + ky2) / 2
            if np.hypot(mx - kmx, my - kmy) < max(dist_tol_px, length(k) / 2):
                duplicate = True
                break

        if not duplicate:
            kept.append(seg)

    return kept


def _detect_walls(gray: np.ndarray) -> list[Wall]:
    edges = cv2.Canny(gray, 50, 150, apertureSize=3)
    lines = cv2.HoughLinesP(
        edges,
        rho=1,
        theta=np.pi / 180,
        threshold=60,
        minLineLength=settings.min_wall_length_px,
        maxLineGap=8,
    )

    merged = _merge_lines(lines) if lines is not None else []

    walls = []
    for x1, y1, x2, y2 in merged:
        length = float(np.hypot(x2 - x1, y2 - y1))
        if length < settings.min_wall_length_px:
            continue
        walls.append(
            Wall(
                id=f"wall_{uuid.uuid4().hex[:8]}",
                startX=float(x1),
                startY=float(y1),
                endX=float(x2),
                endY=float(y2),
            )
        )
    return walls


def _detect_rooms(gray: np.ndarray) -> list[Room]:
    # Adaptive threshold copes better with scanned/photographed plans than
    # a single global threshold.
    binary = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 25, 10
    )

    # Close small gaps in wall lines so rooms form closed contours.
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    closed = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=2)

    contours, hierarchy = cv2.findContours(closed, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)

    rooms = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < settings.min_room_area_px:
            continue

        epsilon = 0.01 * cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, epsilon, True)
        points = [[float(p[0][0]), float(p[0][1])] for p in approx]

        if len(points) < 3:
            continue

        rooms.append(
            Room(
                id=f"room_{uuid.uuid4().hex[:8]}",
                points=points,
                areaPx=float(area),
            )
        )

    return rooms


def detect(image_bytes: bytes) -> tuple[DetectionResult, DetectionMetadata]:
    start = time.monotonic()

    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image — unsupported or corrupt file")

    height, width = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    walls = _detect_walls(gray)
    rooms = _detect_rooms(gray)

    # Doors/windows are not detected yet — distinguishing a door gap or a
    # window symbol from noise needs a trained classifier, not just edges.
    # Returned empty on purpose so the contract shape is stable for the
    # Node/3D-editor side to build against now.
    result = DetectionResult(walls=walls, rooms=rooms, doors=[], windows=[])

    elapsed_ms = int((time.monotonic() - start) * 1000)
    metadata = DetectionMetadata(
        method="opencv-heuristic",
        imageWidth=width,
        imageHeight=height,
        processingTimeMs=elapsed_ms,
        wallCount=len(walls),
        roomCount=len(rooms),
        notes=(
            "Classical CV (Canny + Hough + contours), no trained model. "
            "Doors/windows not detected yet."
        ),
    )

    return result, metadata
