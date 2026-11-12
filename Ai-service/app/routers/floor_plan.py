import logging
from typing import Annotated, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from app.config import settings
from app.schemas import FloorPlanResponse
from app.services import detector

logger = logging.getLogger("xplor.ai_service")

router = APIRouter()


@router.post("/process-floor-plan", response_model=FloorPlanResponse)
async def process_floor_plan(
    jobId: Annotated[str, Form()],
    image: Annotated[UploadFile, File(description="The floor-plan image (PNG/JPG/WEBP)")],
    projectId: Annotated[Optional[str], Form()] = None,
) -> FloorPlanResponse:
    """
    Sync contract: Node sends multipart/form-data {jobId, projectId?, image}
    with "Authorization: Bearer <FASTAPI_SECRET>" (checked by
    app.security before this runs) and awaits this response directly.

    The image travels in the request, so this service never needs to reach
    the Node server (it can sit behind a tunnel on another machine).

    On success: status="completed", detection populated.
    On failure: status="failed", error populated, detection=None.
    If the model isn't loaded: HTTP 503 (the service is down, not the image
    bad). Node records any of these on the Job; this endpoint never touches
    Node's database itself.
    """
    ready, _, error = detector.status()
    if not ready:
        raise HTTPException(status_code=503, detail=f"Floor-plan detection is unavailable: {error}")

    image_bytes = await image.read(settings.max_image_bytes + 1)
    if not image_bytes:
        return FloorPlanResponse(jobId=jobId, status="failed", error="Uploaded image is empty")
    if len(image_bytes) > settings.max_image_bytes:
        return FloorPlanResponse(
            jobId=jobId, status="failed",
            error=f"Image is larger than {settings.max_image_bytes:,} bytes",
        )

    try:
        # Model inference and vectorization are CPU/GPU-bound; run them off
        # the event loop so /health stays responsive during a detection.
        result, metadata = await run_in_threadpool(detector.detect, image_bytes)
    except detector.ModelUnavailable as exc:
        raise HTTPException(status_code=503, detail=f"Floor-plan detection is unavailable: {exc}")
    except ValueError as exc:
        logger.warning("Job %s: detection failed: %s", jobId, exc)
        return FloorPlanResponse(jobId=jobId, status="failed", error=str(exc))

    logger.info(
        "Job %s: detected %d walls, %d rooms in %dms",
        jobId, metadata.wallCount, metadata.roomCount, metadata.processingTimeMs,
    )

    return FloorPlanResponse(
        jobId=jobId,
        status="completed",
        detection=result,
        metadata=metadata,
    )
