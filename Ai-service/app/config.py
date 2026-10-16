from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

# Ai-service/ (the directory holding pyproject.toml), so relative paths in
# settings work no matter which directory uvicorn is started from.
SERVICE_ROOT = Path(__file__).resolve().parents[1]

# Shorter shared secrets are refused (see app/security.py).
MIN_SECRET_LENGTH = 32


class Settings(BaseSettings):
    """Runtime config, loaded from environment / Ai-service/.env."""

    model_config = SettingsConfigDict(
        env_file=SERVICE_ROOT / ".env",
        # Old .env files may still carry removed settings (e.g. the former
        # NODE_UPLOADS_BASE_URL); ignore them instead of refusing to start.
        extra="ignore",
    )

    # Shared secret: Node sends "Authorization: Bearer <FASTAPI_SECRET>" and
    # it must match exactly. Same value as FASTAPI_SECRET in server/.env, at
    # least MIN_SECRET_LENGTH characters. Without it, detection is refused.
    fastapi_secret: str = ""

    # Interactive API docs (/docs, /redoc, /openapi.json). Handy locally;
    # turned off when the service is exposed through the tunnel.
    enable_docs: bool = True

    # Largest accepted upload, and the decoded-size cap (a small compressed
    # file can still expand to a huge bitmap).
    max_image_bytes: int = 20 * 1024 * 1024
    max_image_pixels: int = 50_000_000

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

    # Opencv heuristic tuning (see app/services/opencv_detecter.py)
    min_wall_length_px: int = 40
    min_room_area_px: int = 4000

    @property
    def model_file(self) -> Path:
        return self.model_path if self.model_path.is_absolute() else SERVICE_ROOT / self.model_path


settings = Settings()
