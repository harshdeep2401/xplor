from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """
    Runtime config, loaded from environment / .env.

    NODE_UPLOADS_BASE_URL: the Node server's public origin, used to resolve
    relative floor plan paths (e.g. "/uploads/floor-plans/<userId>/<file>")
    into a fetchable absolute URL. Node currently stores relative paths on
    Project.floorPlanUrl, so this service needs to know where "home" is.

    Example: NODE_UPLOADS_BASE_URL=http://localhost:5000
    -> "/uploads/floor-plans/u1/plan.png" becomes
       "http://localhost:5000/uploads/floor-plans/u1/plan.png"

    If floorPlanUrl is already absolute (http:// or https://, e.g. once R2
    is introduced), it's used as-is and this setting is ignored.
    """

    node_uploads_base_url: str = "http://localhost:5000"
    max_image_fetch_bytes: int = 20 * 1024 * 1024  # 20MB safety cap
    request_timeout_seconds: float = 15.0

    # Detection tuning (see app/services/detector.py for how these are used)
    min_wall_length_px: int = 40
    min_room_area_px: int = 4000

    class Config:
        env_file = ".env"


settings = Settings()
