"""
Shared-secret authentication.

Once the service is reachable through the tunnel, anyone who learns the URL
could otherwise use the GPU. Every request except the health checks (and the
API docs, when enabled) must carry

    Authorization: Bearer <FASTAPI_SECRET>

The check runs as middleware, *before* the request body is read, so an
unauthenticated client can't make the service receive a large upload.
Oversized uploads are refused from their Content-Length the same way.
"""

import hmac

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from app.config import MIN_SECRET_LENGTH, settings

PUBLIC_PATHS = {"/", "/health"}
DOCS_PATHS = {"/docs", "/docs/oauth2-redirect", "/redoc", "/openapi.json"}
# Multipart framing around the image (field names, boundaries, jobId...).
FORM_OVERHEAD_BYTES = 64 * 1024


def config_error() -> str | None:
    """Why the secret makes the service unusable, or None if it's fine."""
    if not settings.fastapi_secret:
        return "FASTAPI_SECRET is not set (see Ai-service/.env.example)"
    if len(settings.fastapi_secret) < MIN_SECRET_LENGTH:
        return f"FASTAPI_SECRET is shorter than {MIN_SECRET_LENGTH} characters"
    return None


def _authorized(header_value: bytes | None) -> bool:
    expected = f"Bearer {settings.fastapi_secret}".encode()
    # Constant-time comparison: response timing doesn't leak the secret.
    return header_value is not None and hmac.compare_digest(header_value, expected)


class ApiKeyMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope["path"]
        if path in PUBLIC_PATHS or (settings.enable_docs and path in DOCS_PATHS):
            await self.app(scope, receive, send)
            return

        headers = dict(scope["headers"])
        problem = config_error()
        if problem:
            response = JSONResponse({"detail": f"AI service is not configured: {problem}"}, status_code=503)
        elif not _authorized(headers.get(b"authorization")):
            response = JSONResponse(
                {"detail": "Missing or wrong API key"},
                status_code=401,
                headers={"WWW-Authenticate": "Bearer"},
            )
        elif _too_large(headers.get(b"content-length")):
            response = JSONResponse(
                {"detail": f"Upload is larger than {settings.max_image_bytes:,} bytes"},
                status_code=413,
            )
        else:
            await self.app(scope, receive, send)
            return
        await response(scope, receive, send)


def _too_large(content_length: bytes | None) -> bool:
    try:
        return content_length is not None and int(content_length) > settings.max_image_bytes + FORM_OVERHEAD_BYTES
    except ValueError:
        return True
