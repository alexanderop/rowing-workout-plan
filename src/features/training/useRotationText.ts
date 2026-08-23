import type { ComputedRef } from 'vue'
import { computed } from 'vue'
import { Result } from 'effect'
import { useI18n } from 'vue-i18n'
import { rotationNote } from './schedule'
import type { RotationNote } from './schedule'
import type { Plan } from './types'

/**
 * The two ways a week's place in the three-week cycle is said out loud.
 *
 * `schedule.rotationNote` decides *which* of the four things is true about a
 * week — first of its rotation, middle, last, or the end of the plan — and
 * says none of them: it returns a variant and two numbers, because a sentence
 * is the shell's. Two screens then said it, and both wrote out the same
 * `Result.map`/`getOrElse` around the same call, with only the message
 * namespace differing.
 *
 * They differ for a reason worth keeping. The week screen is *describing* a
 * week you are looking at (`plans.rotation.*`); the session screen is
 * *coaching* someone about to row one (`plans.coach.*`) — "next rotation, go a
 * tenth faster" is advice, not a fact about week 3. Same note, two registers.
 * What they must not differ on is which note it is, or what happens when the
 * week is outside the plan, and that is what this file makes one copy of.
 *
 * A composable rather than a core function, for `useTargetText`'s reason: the
 * decision is already made in `schedule.ts` and all that is left is a message,
 * which needs `t`.
 *
 * Both keys stay literal templates over `note.variant` rather than being built
 * from a namespace argument. `i18nKeys.test.ts` can enumerate the first shape
 * and declare it in `INTERPOLATED`; it cannot enumerate a key whose prefix is
 * a parameter, and the typed-key guarantee would lapse exactly where it is
 * easiest to get wrong.
 */
interface UseRotationTextReturn {
  /** Where the week sits in the cycle, as the week screen states it. */
  rotationText: ComputedRef<(plan: Plan, weekIndex: number) => string>
  /** The same note as advice, for someone about to row the session. */
  coachText: ComputedRef<(plan: Plan, weekIndex: number) => string>
}

export function useRotationText(): UseRotationTextReturn {
  const { t } = useI18n()

  /**
   * Empty string for a week the plan does not have — a blank is not a claim,
   * and the screen renders nothing rather than a sentence about a week that
   * does not exist.
   */
  const say = (plan: Plan, weekIndex: number, message: (note: RotationNote) => string): string =>
    Result.getOrElse(Result.map(rotationNote(plan, weekIndex), message), () => '')

  return {
    rotationText: computed(
      () => (plan, weekIndex) =>
        say(plan, weekIndex, (note) =>
          t(`plans.rotation.${note.variant}`, { rotation: note.rotation, nextWeek: note.nextWeek }),
        ),
    ),

    coachText: computed(
      () => (plan, weekIndex) =>
        say(plan, weekIndex, (note) =>
          t(`plans.coach.${note.variant}`, { rotation: note.rotation, nextWeek: note.nextWeek }),
        ),
    ),
  }
}
