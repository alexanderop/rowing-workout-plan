import type { Plan } from '../types'

import { pete5k } from './pete5k'
import { pete5kLite } from './pete5kLite'

/**
 * The catalogue: every plan the app ships, and nothing about any one of them.
 *
 * A plan is immutable data, not a row. Nothing here is persisted — an
 * enrolment stores a `planId` and a workout stores a `planSessionId`, so the
 * plan is always looked up from the bundle and the database never holds a
 * second, drifting copy of what a session prescribes. Session ids are
 * positional and therefore stable across a rebuild, which is what makes that
 * lookup work at all; `build.ts` says what that costs.
 *
 * Adding a plan is one file beside this one and one line below. What a plan
 * may decide, what it may not, and where its numbers go in the tests:
 * docs/adding-a-plan.md.
 *
 * Pure by construction: no clock, no storage, no ambient reads.
 * docs/functional-core.md.
 */

export { pete5k } from './pete5k'
export { pete5kLite } from './pete5kLite'

/** Everything the Plans screen lists, in the order it lists it. */
export const PLANS: readonly Plan[] = [pete5k, pete5kLite]
