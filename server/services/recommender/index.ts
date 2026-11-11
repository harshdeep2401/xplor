import { env } from '../../config/env'
import type { Recommender } from './types'
import { ruleBasedRecommender } from './ruleBased'

export * from './types'

// The active recommender. Rules today; a learned model plugs in here by
// implementing Recommender (the API and the editor don't change).
const RECOMMENDERS: Record<string, Recommender> = {
  [ruleBasedRecommender.name]: ruleBasedRecommender,
}

export function getRecommender(): Recommender {
  return RECOMMENDERS[env.RECOMMENDER ?? ''] ?? ruleBasedRecommender
}
