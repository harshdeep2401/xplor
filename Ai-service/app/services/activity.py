"""
Detection counters for GET /status, kept in memory (they reset when the
service restarts). Only timings and counts are kept, never images or results.
"""

import threading
from datetime import datetime, timezone

_started_at = datetime.now(timezone.utc)
_lock = threading.Lock()
_served = 0
_last_ms: int | None = None
_last_at: datetime | None = None


def record(processing_ms: int) -> None:
    global _served, _last_ms, _last_at
    with _lock:
        _served += 1
        _last_ms = processing_ms
        _last_at = datetime.now(timezone.utc)


def snapshot() -> dict:
    now = datetime.now(timezone.utc)
    with _lock:
        return {
            "startedAt": _started_at.isoformat(),
            "uptimeS": int((now - _started_at).total_seconds()),
            "detectionsServed": _served,
            "lastDetectionMs": _last_ms,
            "lastDetectionAt": _last_at.isoformat() if _last_at else None,
        }
