import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import floor_plan
from app.schemas import HealthResponse

logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title="XPLOR AI Service",
    description="Floor plan detection: 2D image -> structured wall/room JSON.",
    version="0.1.0",
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
    return HealthResponse()


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse()
