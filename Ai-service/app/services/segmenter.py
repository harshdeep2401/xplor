"""
The trained floor-plan segmenter: MiT-B3 encoder + U-Net decoder
(segmentation-models-pytorch), weights in Model/best.pt.

It labels every pixel of a plan as background / wall / door / window / room.
Preprocessing mirrors Model/predict.py exactly (the training pipeline):
RGB, letterbox the long side to 512 on a white canvas, scale to [0, 1];
ImageNet normalisation happens inside the model (the `Norm` wrapper).
See Model/ModelInfo.md for the full model card.

The model is loaded once at startup (`load()`). If that fails — weights
missing, wrong package versions, a GPU torch can't use — the error is kept
and every request is refused with it, rather than falling back to the
heuristic detector.
"""

import logging
import threading

import cv2
import numpy as np
import segmentation_models_pytorch as smp
import torch
import torch.nn.functional as F

from app.config import settings
from app.services.errors import ModelUnavailable

logger = logging.getLogger("xplor.ai_service")

CLASSES = ("background", "wall", "door", "window", "room")
INPUT_SIZE = 512
METHOD = "unet-mitb3"


class Norm(torch.nn.Module):
    """Same wrapper as training: input is RGB float in [0, 1]; ImageNet
    normalisation happens inside. Its attribute names ('m', 's', 'net') are
    part of the weight keys in best.pt, so they must not change."""

    def __init__(self, net: torch.nn.Module):
        super().__init__()
        self.net = net
        self.register_buffer("m", torch.tensor([0.485, 0.456, 0.406]).view(1, 3, 1, 1))
        self.register_buffer("s", torch.tensor([0.229, 0.224, 0.225]).view(1, 3, 1, 1))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net((x - self.m) / self.s)


class Segmenter:
    def __init__(self, model: torch.nn.Module, device: torch.device):
        self.model = model
        self.device = device
        # One forward pass at a time: requests run in a thread pool, and
        # parallel passes on one GPU only compete for memory.
        self._lock = threading.Lock()

    @torch.no_grad()
    def predict(self, bgr: np.ndarray, out_size: tuple[int, int]) -> np.ndarray:
        """
        bgr: HxWx3 uint8 image. Returns class ids (uint8, 0-4) at
        out_size=(height, width), which should have the image's aspect ratio.

        Unlike predict.py, the logits (not the class ids) are resized to the
        output size, bilinearly, before argmax: masks come out with smooth
        edges instead of 512-px staircase blocks, which makes walls easier to
        vectorize.
        """
        h, w = bgr.shape[:2]
        s = INPUT_SIZE / max(h, w)
        nh, nw = max(1, int(round(h * s))), max(1, int(round(w * s)))
        y0, x0 = (INPUT_SIZE - nh) // 2, (INPUT_SIZE - nw) // 2

        canvas = np.full((INPUT_SIZE, INPUT_SIZE, 3), 255, np.uint8)  # white letterbox, like training
        canvas[y0:y0 + nh, x0:x0 + nw] = cv2.resize(bgr, (nw, nh), interpolation=cv2.INTER_AREA)
        x = torch.from_numpy(canvas[..., ::-1].copy()).permute(2, 0, 1).float()[None] / 255  # RGB, [0,1]

        with self._lock:
            x = x.to(self.device)
            with torch.autocast(self.device.type, dtype=torch.float16, enabled=self.device.type == "cuda"):
                logits = self.model(x)  # 1x5x512x512
            logits = logits[:, :, y0:y0 + nh, x0:x0 + nw].float()  # drop the padding
            logits = F.interpolate(logits, size=out_size, mode="bilinear", align_corners=False)
            return logits.argmax(1)[0].to(torch.uint8).cpu().numpy()


_segmenter: Segmenter | None = None
_load_error: str | None = "Model not loaded yet"


def _pick_device() -> torch.device:
    wanted = settings.model_device
    if wanted == "cuda" and not torch.cuda.is_available():
        raise ModelUnavailable("MODEL_DEVICE=cuda, but PyTorch cannot see an NVIDIA GPU")
    if wanted == "auto":
        wanted = "cuda" if torch.cuda.is_available() else "cpu"
    return torch.device(wanted)


def load() -> None:
    """Load the weights and run one warm-up pass. Never raises: on failure
    the reason is kept for status() / get()."""
    global _segmenter, _load_error
    path = settings.model_file
    try:
        if not path.is_file():
            logger.error("Model weights not found at %s", path)
            raise ModelUnavailable(
                "Model weights are missing. Get best.pt from the project lead and "
                "put it in Ai-service/Model/ (see README)."
            )
        device = _pick_device()
        model = Norm(smp.Unet("mit_b3", encoder_weights=None, classes=len(CLASSES)))
        model.load_state_dict(torch.load(path, map_location="cpu", weights_only=True))
        segmenter = Segmenter(model.to(device).eval(), device)
        # Warm-up: surfaces GPU/driver problems ("no kernel image is
        # available...") at startup instead of on the first user's upload.
        segmenter.predict(np.full((64, 64, 3), 255, np.uint8), (64, 64))
    except ModelUnavailable as exc:
        _segmenter, _load_error = None, str(exc)
        return
    except Exception as exc:  # bad weights, package mismatch, CUDA failure...
        logger.exception("Loading the floor-plan model failed")
        # The details (paths, stack trace) stay in the log; this message is
        # returned to callers, possibly over the public tunnel.
        _segmenter, _load_error = None, f"Model failed to load ({type(exc).__name__}); see the AI service log"
        return

    _segmenter, _load_error = segmenter, None
    name = torch.cuda.get_device_name(device) if device.type == "cuda" else "CPU"
    logger.info("Floor-plan model loaded from %s on %s", path.name, name)


def get() -> Segmenter:
    if _segmenter is None:
        raise ModelUnavailable(_load_error or "Model not loaded")
    return _segmenter


def status() -> tuple[bool, str | None, str | None]:
    """(ready, device, error)"""
    if _segmenter is None:
        return False, None, _load_error
    return True, _segmenter.device.type, None
