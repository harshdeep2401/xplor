from typing import Optional
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Request (Node -> FastAPI)
# ---------------------------------------------------------------------------

class FloorPlanRequest(BaseModel):
    jobId: str
    projectId: Optional[str] = None
    # Either a relative path ("/uploads/floor-plans/...") or a full URL
    # (once R2/S3 is introduced). See app/config.py for how relative paths
    # are resolved.
    floorPlanUrl: str


# ---------------------------------------------------------------------------
# Response (FastAPI -> Node)
# ---------------------------------------------------------------------------

class Wall(BaseModel):
    id: str
    startX: float
    startY: float
    endX: float
    endY: float
    thickness: float = 8.0


class Room(BaseModel):
    id: str
    # Polygon boundary as a flat list of [x, y] points, in image pixel space
    points: list[list[float]]
    areaPx: float


class Door(BaseModel):
    id: str
    x: float
    y: float
    width: float = 36.0


class Window(BaseModel):
    id: str
    x: float
    y: float
    width: float = 48.0


class DetectionResult(BaseModel):
    walls: list[Wall] = Field(default_factory=list)
    rooms: list[Room] = Field(default_factory=list)
    doors: list[Door] = Field(default_factory=list)
    windows: list[Window] = Field(default_factory=list)


class DetectionMetadata(BaseModel):
    method: str  # "opencv-heuristic" | "mock"
    imageWidth: int
    imageHeight: int
    processingTimeMs: int
    wallCount: int
    roomCount: int
    notes: Optional[str] = None


class FloorPlanResponse(BaseModel):
    jobId: str
    status: str  # "completed" | "failed"
    detection: Optional[DetectionResult] = None
    metadata: Optional[DetectionMetadata] = None
    error: Optional[str] = None


class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "xplor-ai-service"
