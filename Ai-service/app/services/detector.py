"""
Detector entry point: image bytes -> (detection-v1 result, metadata).

DETECTOR picks the implementation (app/config.py):
  - "unet": the trained segmenter (segmenter.py) + mask vectorization
    (vectorize.py). The default.
  - "opencv": the classical heuristic (opencv_detector.py), for comparison.

Callers (the router) check ready() first and turn ModelUnavailable into
HTTP 503; there is deliberately no automatic fallback between detectors.
"""

import time

import cv2
import numpy as np

from app.config import settings
from app.schemas import DetectionMetadata, DetectionResult
from app.services import opencv_detector
from app.services.errors import ModelUnavailable  # noqa: F401  (re-exported for the router)

if settings.detector == "unet":
    # Only imported when used, so DETECTOR=opencv starts without loading torch.
    from app.services import segmenter, vectorize


def startup() -> None:
    if settings.detector == "unet":
        segmenter.load()


def status() -> tuple[bool, str | None, str | None]:
    """(ready, device, error)"""
    if settings.detector == "opencv":
        return True, "cpu", None
    return segmenter.status()


def decode_image(image_bytes: bytes) -> np.ndarray:
    """Bytes -> BGR uint8 image, or ValueError for anything unusable."""
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    raw = cv2.imdecode(arr, cv2.IMREAD_UNCHANGED)
    if raw is None:
        raise ValueError("Could not decode image — unsupported or corrupt file")
    if raw.shape[0] * raw.shape[1] > settings.max_image_pixels:
        raise ValueError(
            f"Image is {raw.shape[1]}x{raw.shape[0]} pixels; the limit is "
            f"{settings.max_image_pixels:,} pixels"
        )

    if raw.ndim == 3 and raw.shape[2] == 4:
        # Transparent PNG: put it on white. IMREAD_COLOR would drop the alpha
        # channel and leave transparent areas black, which the model (trained
        # on white paper) reads as something other than background.
        rgb = raw[..., :3].astype(np.float32)
        alpha = raw[..., 3:4].astype(np.float32) / 255.0
        return (rgb * alpha + 255.0 * (1.0 - alpha)).astype(np.uint8)

    # IMREAD_COLOR also applies EXIF orientation, so phone photos come out
    # the same way up as the browser shows them in the editor's trace layer.
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image — unsupported or corrupt file")
    return img


def detect(image_bytes: bytes) -> tuple[DetectionResult, DetectionMetadata]:
    img = decode_image(image_bytes)
    if settings.detector == "opencv":
        return opencv_detector.detect(img)
    return _detect_unet(img)


def _detect_unet(img: np.ndarray) -> tuple[DetectionResult, DetectionMetadata]:
    start = time.monotonic()
    model = segmenter.get()  # raises ModelUnavailable

    height, width = img.shape[:2]
    # Vectorize at the image's own size, capped for very large images.
    factor = min(1.0, settings.max_vectorize_side / max(height, width))
    out_size = (max(1, round(height * factor)), max(1, round(width * factor)))

    mask = model.predict(img, out_size)
    inference_ms = int((time.monotonic() - start) * 1000)
    result = vectorize.vectorize(mask, scale=1.0 / factor)

    elapsed_ms = int((time.monotonic() - start) * 1000)
    metadata = DetectionMetadata(
        method=segmenter.METHOD,
        imageWidth=width,
        imageHeight=height,
        processingTimeMs=elapsed_ms,
        wallCount=len(result.walls),
        roomCount=len(result.rooms),
        notes=(
            f"MiT-B3 U-Net segmentation on {model.device.type} ({inference_ms} ms) + "
            f"mask vectorization; {len(result.doors)} doors, {len(result.windows)} windows."
        ),
    )
    return result, metadata
