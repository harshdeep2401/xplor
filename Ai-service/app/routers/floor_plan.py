import logging

from fastapi import APIRouter, HTTPException
from starlette.concurrency import run_in_threadpool

from app.schemas import FloorPlanRequest, FloorPlanResponse
from app.services.image_fetcher import fetch_image_bytes, ImageFetchError
from app.services import detector

logger = logging.getLogger("xplor.ai_service")

router = APIRouter()


@router.post("/process-floor-plan", response_model=FloorPlanResponse)
async def process_floor_plan(payload: FloorPlanRequest) -> FloorPlanResponse:
    """
    Sync contract: Node sends {jobId, floorPlanUrl, projectId?} and awaits
    this response directly (no queue/webhook yet — see README for why).

    On success: status="completed", detection populated.
    On failure: status="failed", error populated, detection=None.
    If the model isn't loaded: HTTP 503 (the service is down, not the image
    bad). Node records any of these on the Job; this endpoint never touches
    Node's database itself.
    """
    ready, _, error = detector.status()
    if not ready:
        raise HTTPException(status_code=503, detail=f"Floor-plan detection is unavailable: {error}")

    try:
        image_bytes = await fetch_image_bytes(payload.floorPlanUrl)
    except ImageFetchError as exc:
        logger.warning("Job %s: image fetch failed: %s", payload.jobId, exc)
        return FloorPlanResponse(jobId=payload.jobId, status="failed", error=str(exc))

    try:
        # Model inference and vectorization are CPU/GPU-bound; run them off
        # the event loop so /health stays responsive during a detection.
        result, metadata = await run_in_threadpool(detector.detect, image_bytes)
    except detector.ModelUnavailable as exc:
        raise HTTPException(status_code=503, detail=f"Floor-plan detection is unavailable: {exc}")
    except ValueError as exc:
        logger.warning("Job %s: detection failed: %s", payload.jobId, exc)
        return FloorPlanResponse(jobId=payload.jobId, status="failed", error=str(exc))

    logger.info(
        "Job %s: detected %d walls, %d rooms in %dms",
        payload.jobId, metadata.wallCount, metadata.roomCount, metadata.processingTimeMs,
    )

    return FloorPlanResponse(
        jobId=payload.jobId,
        status="completed",
        detection=result,
        metadata=metadata,
    )
