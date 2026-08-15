# XPLOR AI service (FastAPI floor-plan detection), served by uvicorn.
FROM python:3.12-slim

# opencv-python-headless still links libglib at import time.
RUN apt-get update \
  && apt-get install -y --no-install-recommends libglib2.0-0 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Deps first for layer caching.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

EXPOSE 8000

# app.main:app is the FastAPI instance (see app/main.py).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
