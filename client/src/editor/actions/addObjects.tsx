import type { SceneObject } from '../../types/scene'
import { createLight } from '../lights'
import { createPrimitiveObject } from '../scene/models'

// Drop new shapes at a random spot near the middle so repeated adds don't stack.
function scatter(obj: SceneObject): SceneObject {
  obj.object3d.position.set(Math.random() * 2 - 1, 0, Math.random() * 2 - 1)
  return obj
}

/** A 1 m cube standing on the floor. */
export function createCube(): SceneObject {
  return scatter(createPrimitiveObject('cube'))
}

/** A 1 m-diameter sphere resting on the floor. */
export function createSphere(): SceneObject {
  return scatter(createPrimitiveObject('sphere'))
}

/**
 * Create a light object (delegated to lights domain)
 */
export function createSceneLight(): SceneObject {
  return createLight()
}
