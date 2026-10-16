// Used by eval/evaluate.py: runs detection-v1 results through the server's real
// bridge (wall welding + opening attachment) and converter, and prints how many
// closed rooms each produces in the 3D scene.
//
//   (from server/) npx tsx ../Ai-service/eval/bridge_rooms.ts <detections.json>
//
// Input: { "<key>": detection-v1, ... }. Output: { "<key>": roomCount, ... }
// (-1 if the detection or the bridged canvas fails validation).

import { readFileSync } from 'node:fs'
import { detectionToCanvas } from '../../server/services/converter/detectionToCanvas'
import { convertToScene, validateCanvasV2, validateDetectionV1 } from '../../server/services/converter'

const detections = JSON.parse(readFileSync(process.argv[2], 'utf8')) as Record<string, unknown>
const rooms: Record<string, number> = {}

for (const [key, detection] of Object.entries(detections)) {
  if (!validateDetectionV1(detection)) {
    rooms[key] = -1
    continue
  }
  const canvas = detectionToCanvas(detection as Parameters<typeof detectionToCanvas>[0], {})
  if (!validateCanvasV2(canvas)) {
    rooms[key] = -1
    continue
  }
  rooms[key] = convertToScene(canvas).rooms.length
}

process.stdout.write(JSON.stringify(rooms))
