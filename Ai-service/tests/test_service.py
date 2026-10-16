"""Service behaviour that doesn't depend on the trained weights."""

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.services import detector, segmenter


@pytest.fixture
def client_without_model(monkeypatch, tmp_path):
    """The service started with no weights file present."""
    monkeypatch.setattr(settings, "model_path", tmp_path / "missing.pt")
    with TestClient(app) as client:  # runs the startup (model load)
        yield client
    segmenter._segmenter = None  # don't leak into other tests


def test_health_reports_unavailable_without_weights(client_without_model):
    resp = client_without_model.get("/health")
    assert resp.status_code == 503
    body = resp.json()
    assert body["status"] == "unavailable"
    assert "best.pt" in body["error"]
    assert "missing.pt" not in body["error"]  # no local paths in public errors


def test_detection_is_refused_not_faked_without_weights(client_without_model):
    resp = client_without_model.post(
        "/process-floor-plan", json={"jobId": "j1", "floorPlanUrl": "/uploads/x.png"}
    )
    assert resp.status_code == 503
    assert "unavailable" in resp.json()["detail"]


def test_liveness_stays_up_without_weights(client_without_model):
    assert client_without_model.get("/").status_code == 200


def test_decode_puts_transparent_png_on_white():
    rgba = np.zeros((20, 20, 4), np.uint8)  # fully transparent black
    rgba[5:15, 5:15] = (0, 0, 0, 255)  # opaque black square
    ok, png = cv2.imencode(".png", rgba)
    assert ok

    img = detector.decode_image(png.tobytes())
    assert img.shape == (20, 20, 3)
    assert img[0, 0].tolist() == [255, 255, 255]
    assert img[10, 10].tolist() == [0, 0, 0]


def test_decode_rejects_garbage():
    with pytest.raises(ValueError):
        detector.decode_image(b"not an image")


def test_decode_rejects_oversized_images(monkeypatch):
    monkeypatch.setattr(settings, "max_image_pixels", 100)
    ok, png = cv2.imencode(".png", np.zeros((20, 20, 3), np.uint8))
    with pytest.raises(ValueError, match="limit"):
        detector.decode_image(png.tobytes())
