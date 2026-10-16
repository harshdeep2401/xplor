import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Response

from app.config import settings
from app.routers import floor_plan
from app.schemas import HealthResponse
from app.security import ApiKeyMiddleware, config_error
from app.services import detector

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("xplor.ai_service")


@asynccontextmanager
async def lifespan(app: FastAPI):
    problem = config_error()
    if problem:
        logger.error("Detection requests will be refused: %s", problem)
    # Load the model once, before the first request. A failed load doesn't
    # stop the service: /health then reports 503 with the reason.
    detector.startup()
    yield


docs_kwargs = {} if settings.enable_docs else {"docs_url": None, "redoc_url": None, "openapi_url": None}

app = FastAPI(
    title="XPLOR AI Service",
    description="Floor plan detection: 2D image -> structured wall/room JSON.",
    version="0.3.0",
    lifespan=lifespan,
    **docs_kwargs,
)

# No CORS middleware on purpose: only the Node server calls this service
# (server to server), never a browser.
app.add_middleware(ApiKeyMiddleware)

app.include_router(floor_plan.router)


@app.get("/", response_model=HealthResponse)
async def root() -> HealthResponse:
    """Liveness: the process is up (says nothing about the model)."""
    return HealthResponse()


@app.get("/health", response_model=HealthResponse)
async def health(response: Response) -> HealthResponse:
    """Readiness: 200 only when detection requests can be served."""
    ready, device, error = detector.status()
    problem = config_error()
    if problem:
        ready, error = False, problem
    if not ready:
        response.status_code = 503
    return HealthResponse(
        status="ok" if ready else "unavailable",
        detector=settings.detector,
        device=device,
        error=error,
    )
