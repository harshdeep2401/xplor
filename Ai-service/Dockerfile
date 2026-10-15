# XPLOR AI service (FastAPI floor-plan detection), served by uvicorn.
FROM python:3.12-slim

# opencv-python-headless still links libglib at import time.
RUN apt-get update \
  && apt-get install -y --no-install-recommends libglib2.0-0 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# uv (pinned) installs the exact locked dependency set.
COPY --from=ghcr.io/astral-sh/uv:0.9.21 /uv /usr/local/bin/uv

# Deps first for layer caching. --frozen fails the build if uv.lock is stale.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-cache
ENV PATH="/app/.venv/bin:$PATH"

COPY app ./app

EXPOSE 8000

# app.main:app is the FastAPI instance (see app/main.py).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
