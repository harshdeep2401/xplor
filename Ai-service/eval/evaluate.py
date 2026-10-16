"""
Score detectors on CubiCasa5K plans with ground truth (docs/06, Phase 3b.1).

    uv run python eval/evaluate.py --data C:/TrainXPLOR/data/processed/test [--limit 50]

Each plan directory needs `img_c.png` (the plan) and `mask_c.png` (ground-truth
class ids 0-4 as a palette PNG, same size). Three detectors are scored:

  opencv  the classical heuristic
  unet    the trained model + vectorization (needs Model/best.pt)
  oracle  vectorization applied to the GROUND-TRUTH mask: the best the
          vectorizer can do with a perfect model, i.e. what it loses itself

Metrics, all on the detection-v1 output (what the server actually receives):

  walls     pixel F1 with a 3 px tolerance: detected walls are drawn at their
            thickness and compared with the true wall+door+window pixels
  doors     F1 of door centres matched to true door blobs (hit = centre within
            half the true door's length, at least 10 px)
  windows   same for windows
  rooms     the detection is run through the server's own bridge and
            converter (eval/bridge_rooms.ts) and the closed rooms in the 3D
            scene are counted, against the true room count

Writes a per-plan CSV and a Markdown summary to --out (default eval/results/).
"""

import argparse
import csv
import json
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

SERVICE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_ROOT))

from app.services import opencv_detecter, segmenter, vectorize  # noqa: E402
from app.services.detector import _detect_unet  # noqa: E402
from app.services.vectorize import DOOR, ROOM, WALL, WINDOW  # noqa: E402

DETECTORS = ("opencv", "unet", "oracle")
TOLERANCE_PX = 3


def wall_scores(walls, truth: np.ndarray) -> tuple[float, float]:
    """(precision, recall) of drawn walls vs true structure pixels, with tolerance."""
    drawn = np.zeros(truth.shape, np.uint8)
    for w in walls:
        cv2.line(
            drawn,
            (int(round(w.startX)), int(round(w.startY))),
            (int(round(w.endX)), int(round(w.endY))),
            1,
            max(1, int(round(w.thickness))),
        )
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * TOLERANCE_PX + 1,) * 2)
    truth_near = cv2.dilate(truth, kernel)
    drawn_near = cv2.dilate(drawn, kernel)
    precision = (drawn & truth_near).sum() / max(1, drawn.sum())
    recall = (truth & drawn_near).sum() / max(1, truth.sum())
    return float(precision), float(recall)


def true_openings(gt: np.ndarray, cls: int):
    """[(cx, cy, length)] per ground-truth blob of class `cls`."""
    n, labels, stats, centroids = cv2.connectedComponentsWithStats((gt == cls).astype(np.uint8), connectivity=8)
    out = []
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] < 4:
            continue
        length = max(stats[i, cv2.CC_STAT_WIDTH], stats[i, cv2.CC_STAT_HEIGHT])
        out.append((float(centroids[i][0]), float(centroids[i][1]), float(length)))
    return out


def opening_matches(detected, truth) -> int:
    """Greedy one-to-one matching of detected centres to true blobs."""
    used = set()
    hits = 0
    for d in detected:
        best, best_dist = None, None
        for j, (tx, ty, length) in enumerate(truth):
            if j in used:
                continue
            dist = float(np.hypot(d.x - tx, d.y - ty))
            if dist <= max(10.0, length / 2) and (best_dist is None or dist < best_dist):
                best, best_dist = j, dist
        if best is not None:
            used.add(best)
            hits += 1
    return hits


def f1(precision: float, recall: float) -> float:
    return 0.0 if precision + recall == 0 else 2 * precision * recall / (precision + recall)


def prf(hits: int, n_detected: int, n_true: int) -> tuple[float, float, float]:
    p = hits / n_detected if n_detected else (1.0 if n_true == 0 else 0.0)
    r = hits / n_true if n_true else 1.0
    return p, r, f1(p, r)


def count_scene_rooms(detections: dict[str, dict]) -> dict[str, int]:
    """Run detections through the server's bridge + converter (Node)."""
    server = SERVICE_ROOT.parent / "server"
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "detections.json"
        src.write_text(json.dumps(detections))
        proc = subprocess.run(
            ["npx", "tsx", str(SERVICE_ROOT / "eval" / "bridge_rooms.ts"), str(src)],
            cwd=server, capture_output=True, text=True, shell=sys.platform == "win32",
        )
    if proc.returncode != 0:
        raise RuntimeError(f"bridge_rooms.ts failed:\n{proc.stderr}")
    return json.loads(proc.stdout)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data", required=True, type=Path, help="directory of plan folders (img_c.png + mask_c.png)")
    parser.add_argument("--limit", type=int, default=0, help="score only the first N plans")
    parser.add_argument("--detectors", default=",".join(DETECTORS), help="comma-separated subset of " + ",".join(DETECTORS))
    parser.add_argument("--out", type=Path, default=SERVICE_ROOT / "eval" / "results")
    args = parser.parse_args()

    detectors = [d.strip() for d in args.detectors.split(",") if d.strip()]
    plans = sorted(p for p in args.data.iterdir() if (p / "img_c.png").is_file() and (p / "mask_c.png").is_file())
    if args.limit:
        plans = plans[: args.limit]
    if not plans:
        sys.exit(f"No plans with img_c.png + mask_c.png under {args.data}")

    if "unet" in detectors:
        segmenter.load()
        ready, device, error = segmenter.status()
        if not ready:
            sys.exit(f"Model not available: {error}")
        print(f"Model on {device}")

    rows: list[dict] = []
    detections: dict[str, dict] = {}
    started = time.monotonic()
    for i, plan in enumerate(plans, 1):
        img = cv2.imread(str(plan / "img_c.png"), cv2.IMREAD_COLOR)
        gt = np.array(Image.open(plan / "mask_c.png"))  # palette PNG: values are class ids
        structure = np.isin(gt, (WALL, DOOR, WINDOW)).astype(np.uint8)
        true_doors, true_windows = true_openings(gt, DOOR), true_openings(gt, WINDOW)
        true_rooms = len(vectorize.vectorize(gt).rooms)

        for name in detectors:
            t0 = time.monotonic()
            if name == "opencv":
                result, _ = opencv_detecter.detect(img)
            elif name == "unet":
                result, _ = _detect_unet(img)
            else:
                result = vectorize.vectorize(gt)
            ms = (time.monotonic() - t0) * 1000

            wp, wr = wall_scores(result.walls, structure)
            dp, dr, df = prf(opening_matches(result.doors, true_doors), len(result.doors), len(true_doors))
            xp, xr, xf = prf(opening_matches(result.windows, true_windows), len(result.windows), len(true_windows))
            key = f"{plan.name}/{name}"
            detections[key] = result.model_dump()
            rows.append({
                "plan": plan.name, "detector": name, "ms": round(ms),
                "walls": len(result.walls), "wall_p": wp, "wall_r": wr, "wall_f1": f1(wp, wr),
                "doors": len(result.doors), "true_doors": len(true_doors), "door_p": dp, "door_r": dr, "door_f1": df,
                "windows": len(result.windows), "true_windows": len(true_windows), "win_p": xp, "win_r": xr, "win_f1": xf,
                "true_rooms": true_rooms,
            })
        if i % 25 == 0 or i == len(plans):
            print(f"  {i}/{len(plans)} plans ({time.monotonic() - started:.0f} s)")

    print("Counting closed rooms through the server bridge...")
    scene_rooms = count_scene_rooms(detections)
    for row in rows:
        row["scene_rooms"] = scene_rooms[f"{row['plan']}/{row['detector']}"]
        row["room_recall"] = min(row["scene_rooms"], row["true_rooms"]) / row["true_rooms"] if row["true_rooms"] else 1.0

    args.out.mkdir(parents=True, exist_ok=True)
    with open(args.out / "per_plan.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)

    summary = summarize(rows, detectors, args.data, len(plans))
    (args.out / "summary.md").write_text(summary, encoding="utf-8")
    print(summary)


def summarize(rows, detectors, data: Path, n_plans: int) -> str:
    def mean(name, key):
        values = [r[key] for r in rows if r["detector"] == name]
        return sum(values) / len(values)

    lines = [
        f"# Detector evaluation — {n_plans} plans from `{data}`",
        "",
        "Means over plans. Walls: pixel F1 with a 3 px tolerance. Doors/windows: centre-matching F1.",
        "Rooms closed: closed rooms in the 3D scene after the server bridge, as a share of true rooms (capped at 100%).",
        "",
        "| Detector | Wall P | Wall R | **Wall F1** | **Door F1** | **Window F1** | **Rooms closed** | ms / plan |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for name in detectors:
        lines.append(
            f"| {name} | {mean(name, 'wall_p'):.3f} | {mean(name, 'wall_r'):.3f} | **{mean(name, 'wall_f1'):.3f}** "
            f"| **{mean(name, 'door_f1'):.3f}** | **{mean(name, 'win_f1'):.3f}** "
            f"| **{mean(name, 'room_recall'):.1%}** | {mean(name, 'ms'):.0f} |"
        )
    lines += ["", "`oracle` = vectorization of the ground-truth mask (upper bound for the current vectorizer).", ""]
    return "\n".join(lines)


if __name__ == "__main__":
    main()
