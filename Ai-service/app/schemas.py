from typing import Optional
from pydantic import BaseModel, Field


# Request (Node -> FastAPI): multipart/form-data {jobId, projectId?, image},
# declared as form fields on the route in app/routers/floor_plan.py.


# ---------------------------------------------------------------------------
# Response (FastAPI -> Node)
# DetectionResult + DetectionMetadata are the detection-v1 contract
# (contracts/detection-v1.schema.json) — change both together.
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
    method: str  # "unet-mitb3" | "opencv-heuristic"
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


class GpuInfo(BaseModel):
    name: str
    memoryUsedMb: int  # whole GPU, all processes
    memoryTotalMb: int
    modelMemoryMb: int  # held by this service


class ModelInfo(BaseModel):
    method: str
    file: str
    sizeMb: float
    sha256: str  # first 12 hex characters; identifies the weights


class StatusResponse(BaseModel):
    """GET /status (needs the secret): what's running and where, for the
    server's System Status page."""
    service: str = "xplor-ai-service"
    ready: bool
    error: Optional[str] = None
    host: str
    runningIn: str  # "docker" | "local"
    startedAt: str  # ISO 8601, UTC
    uptimeS: int
    detector: str
    device: Optional[str] = None
    gpu: Optional[GpuInfo] = None
    model: Optional[ModelInfo] = None
    detectionsServed: int
    lastDetectionMs: Optional[int] = None
    lastDetectionAt: Optional[str] = None


class HealthResponse(BaseModel):
    status: str = "ok"  # "ok" | "unavailable" (then HTTP 503)
    service: str = "xplor-ai-service"
    detector: Optional[str] = None  # "unet" | "opencv"
    device: Optional[str] = None  # "cuda" | "cpu" once the model is loaded
    error: Optional[str] = None  # why the service is unavailable
