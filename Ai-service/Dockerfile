# XPLOR AI service (FastAPI floor-plan detection), served by uvicorn.
#
# Includes PyTorch with CUDA 12.6 (from uv.lock): uses an NVIDIA GPU when the
# container is given one (compose.host.yml / docker-compose.gpu.yml), the CPU
# otherwise. The model weights are NOT in the image: mount them at
# /app/Model (compose does this from Ai-service/Model).
FROM python:3.12-slim

# opencv-python-headless still links libglib at import time.
RUN apt-get update \
  && apt-get install -y --no-install-recommends libglib2.0-0 \
  && rm -rf /var/lib/apt/lists/*

# Run as an unprivileged user, not root.
RUN useradd --create-home --uid 10001 app
WORKDIR /app

# uv (pinned) installs the exact locked dependency set.
COPY --from=ghcr.io/astral-sh/uv:0.12.24 /uv /usr/local/bin/uv

# Deps first for layer caching. --frozen fails the build if uv.lock is stale;
# --no-dev leaves out test tools.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-cache
ENV PATH="/app/.venv/bin:$PATH"

COPY app ./app
RUN mkdir -p /app/Model && chown -R app:app /app/Model
USER app

EXPOSE 8000

# app.main:app is the FastAPI instance (see app/main.py).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
