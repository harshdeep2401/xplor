"""Service behaviour that doesn't depend on the trained weights."""

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.services import detector, segmenter

SECRET = "s" * 40
AUTH = {"Authorization": f"Bearer {SECRET}"}


def png_bytes(img: np.ndarray) -> bytes:
    ok, buf = cv2.imencode(".png", img)
    assert ok
    return buf.tobytes()


def upload(client, headers=AUTH, data=None):
    return client.post(
        "/process-floor-plan",
        headers=headers,
        data={"jobId": "j1"},
        files={"image": ("plan.png", data if data is not None else png_bytes(np.full((64, 64, 3), 255, np.uint8)), "image/png")},
    )


@pytest.fixture
def client_without_model(monkeypatch, tmp_path):
    """The service started with a valid secret but no weights file."""
    monkeypatch.setattr(settings, "fastapi_secret", SECRET)
    monkeypatch.setattr(settings, "model_path", tmp_path / "missing.pt")
    with TestClient(app) as client:  # runs the startup (model load)
        yield client
    segmenter._segmenter = None  # don't leak into other tests


@pytest.fixture
def client_opencv(monkeypatch):
    """The service running the heuristic detector (no weights needed)."""
    monkeypatch.setattr(settings, "fastapi_secret", SECRET)
    monkeypatch.setattr(settings, "detector", "opencv")
    with TestClient(app) as client:
        yield client


# --- availability ----------------------------------------------------------

def test_health_reports_unavailable_without_weights(client_without_model):
    resp = client_without_model.get("/health")
    assert resp.status_code == 503
    body = resp.json()
    assert body["status"] == "unavailable"
    assert "best.pt" in body["error"]
    assert "missing.pt" not in body["error"]  # no local paths in public errors


def test_detection_is_refused_not_faked_without_weights(client_without_model):
    resp = upload(client_without_model)
    assert resp.status_code == 503
    assert "unavailable" in resp.json()["detail"]


def test_liveness_stays_up_without_weights(client_without_model):
    assert client_without_model.get("/").status_code == 200


# --- authentication --------------------------------------------------------

@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer wrong"}, {"Authorization": SECRET}])
def test_detection_requires_the_secret(client_opencv, headers):
    resp = upload(client_opencv, headers=headers)
    assert resp.status_code == 401


def test_detection_works_with_the_secret(client_opencv):
    resp = upload(client_opencv)
    assert resp.status_code == 200
    body = resp.json()
    assert body["jobId"] == "j1" and body["status"] == "completed"
    assert body["metadata"]["method"] == "opencv-heuristic"


@pytest.mark.parametrize("secret", ["", "too-short"])
def test_missing_or_weak_secret_disables_detection(monkeypatch, secret):
    monkeypatch.setattr(settings, "fastapi_secret", secret)
    monkeypatch.setattr(settings, "detector", "opencv")
    with TestClient(app) as client:
        assert client.get("/health").status_code == 503
        resp = upload(client, headers={"Authorization": f"Bearer {secret}"})
        assert resp.status_code == 503
        assert "FASTAPI_SECRET" in resp.json()["detail"]


def test_health_is_public(client_opencv):
    assert client_opencv.get("/health").status_code == 200


def test_oversized_upload_is_refused_before_reading(client_opencv, monkeypatch):
    monkeypatch.setattr(settings, "max_image_bytes", 1000)
    resp = upload(client_opencv, data=b"x" * 200_000)
    assert resp.status_code == 413


def test_bad_image_is_a_failed_detection_not_an_error(client_opencv):
    resp = upload(client_opencv, data=b"not an image")
    assert resp.status_code == 200
    assert resp.json()["status"] == "failed"


# --- image decoding --------------------------------------------------------

def test_decode_puts_transparent_png_on_white():
    rgba = np.zeros((20, 20, 4), np.uint8)  # fully transparent black
    rgba[5:15, 5:15] = (0, 0, 0, 255)  # opaque black square

    img = detector.decode_image(png_bytes(rgba))
    assert img.shape == (20, 20, 3)
    assert img[0, 0].tolist() == [255, 255, 255]
    assert img[10, 10].tolist() == [0, 0, 0]


def test_decode_rejects_garbage():
    with pytest.raises(ValueError):
        detector.decode_image(b"not an image")


def test_decode_rejects_oversized_images(monkeypatch):
    monkeypatch.setattr(settings, "max_image_pixels", 100)
    with pytest.raises(ValueError, match="limit"):
        detector.decode_image(png_bytes(np.zeros((20, 20, 3), np.uint8)))
