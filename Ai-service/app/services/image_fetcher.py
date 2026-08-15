import httpx

from app.config import settings


class ImageFetchError(Exception):
    pass


def resolve_url(floor_plan_url: str) -> str:
    """
    Node currently stores relative paths on Project.floorPlanUrl
    (e.g. "/uploads/floor-plans/<userId>/<file>"), served statically by
    the Express server. Turn that into an absolute URL this service can
    fetch. Already-absolute URLs (future R2/S3 links) pass through untouched.
    """
    if floor_plan_url.startswith("http://") or floor_plan_url.startswith("https://"):
        return floor_plan_url

    base = settings.node_uploads_base_url.rstrip("/")
    path = floor_plan_url if floor_plan_url.startswith("/") else f"/{floor_plan_url}"
    return f"{base}{path}"


async def fetch_image_bytes(floor_plan_url: str) -> bytes:
    url = resolve_url(floor_plan_url)

    try:
        async with httpx.AsyncClient(timeout=settings.request_timeout_seconds) as client:
            resp = await client.get(url)
    except httpx.RequestError as exc:
        raise ImageFetchError(f"Could not reach {url}: {exc}") from exc

    if resp.status_code != 200:
        raise ImageFetchError(f"Fetching {url} returned HTTP {resp.status_code}")

    content_length = len(resp.content)
    if content_length == 0:
        raise ImageFetchError(f"Fetched empty file from {url}")
    if content_length > settings.max_image_fetch_bytes:
        raise ImageFetchError(
            f"File at {url} is {content_length} bytes, exceeds "
            f"{settings.max_image_fetch_bytes} byte limit"
        )

    return resp.content
