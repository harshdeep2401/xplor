import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import floor_plan
from app.schemas import HealthResponse
from app.services import detector

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load the model once, before the first request. A failed load doesn't
    # stop the service: /health then reports 503 with the reason.
    detector.startup()
    yield


app = FastAPI(
    title="XPLOR AI Service",
    description="Floor plan detection: 2D image -> structured wall/room JSON.",
    version="0.2.0",
    lifespan=lifespan,
)

# Wide open for local dev; tighten once this sits behind a Cloudflare Tunnel
# (restrict to the Node backend's origin/IP or a shared API key — see README).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(floor_plan.router)


@app.get("/", response_model=HealthResponse)
async def root() -> HealthResponse:
    """Liveness: the process is up (says nothing about the model)."""
    return HealthResponse()


@app.get("/health", response_model=HealthResponse)
async def health(response: Response) -> HealthResponse:
    """Readiness: 200 only when detection requests can be served."""
    ready, device, error = detector.status()
    if not ready:
        response.status_code = 503
    return HealthResponse(
        status="ok" if ready else "unavailable",
        detector=settings.detector,
        device=device,
        error=error,
    )
