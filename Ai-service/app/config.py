from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings

# Ai-service/ (the directory holding pyproject.toml), so relative paths in
# settings work no matter which directory uvicorn is started from.
SERVICE_ROOT = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    """
    Runtime config, loaded from environment / .env.

    NODE_UPLOADS_BASE_URL: the Node server's public origin, used to resolve
    relative floor plan paths (e.g. "/uploads/floor-plans/<userId>/<file>")
    into a fetchable absolute URL. Node currently stores relative paths on
    Project.floorPlanUrl, so this service needs to know where "home" is.

    Example: NODE_UPLOADS_BASE_URL=http://localhost:5001
    -> "/uploads/floor-plans/u1/plan.png" becomes
       "http://localhost:5001/uploads/floor-plans/u1/plan.png"

    If floorPlanUrl is already absolute (http:// or https://, e.g. once R2
    is introduced), it's used as-is and this setting is ignored.
    """

    node_uploads_base_url: str = "http://localhost:5001"
    max_image_fetch_bytes: int = 20 * 1024 * 1024  # 20MB safety cap
    # Decoded-size cap: a small compressed file can still expand to a huge
    # bitmap, so refuse anything above this many pixels.
    max_image_pixels: int = 50_000_000
    request_timeout_seconds: float = 15.0

    # Which detector serves /process-floor-plan:
    #   "unet"   - the trained segmenter (Model/ModelInfo.md). If it can't load,
    #              the service reports itself unavailable (HTTP 503); it never
    #              silently falls back to the heuristic.
    #   "opencv" - the classical heuristic, kept only for comparison runs.
    detector: Literal["unet", "opencv"] = "unet"
    # Weights file; relative paths are resolved against Ai-service/.
    model_path: Path = Path("Model/best.pt")
    # "auto" uses the NVIDIA GPU when torch can see one, else the CPU.
    model_device: Literal["auto", "cuda", "cpu"] = "auto"
    # The mask is vectorized at the image's own size, capped at this many
    # pixels on the long side (coordinates are scaled back afterwards).
    max_vectorize_side: int = 2048

    # Opencv heuristic tuning (see app/services/opencv_detector.py)
    min_wall_length_px: int = 40
    min_room_area_px: int = 4000

    class Config:
        env_file = SERVICE_ROOT / ".env"

    @property
    def model_file(self) -> Path:
        return self.model_path if self.model_path.is_absolute() else SERVICE_ROOT / self.model_path


settings = Settings()
