import type { ComputedRef } from 'vue'
import { computed } from 'vue'
import { Result } from 'effect'
import { useI18n } from 'vue-i18n'
import { formatSplit } from './pace'
import { steadyBandText } from './targets'
import type { SessionTarget } from './targets'
import type { PlanSession, SessionKind } from './types'

/**
 * How a session's target reads: a **band** for steady work, a **number** for
 * everything else. A `timedSteady` row is steady work — the clock bounding it
 * instead of the monitor changes nothing about the zone it sits in.
 *
 * Aerobic work is a zone to sit in and an interval is a pace to hit, and
 * printing one as the other is how a steady row turns into a race. That rule
 * lived in `SessionRow` alone, which meant the same steady session showed as
 * `2:04.0–2:08.0` in the week list and as `2:06.0` on the card directly above
 * it — one screen, two answers, and only one of them right. A code review
 * caught it; this composable is so there is one copy to catch.
 *
 * A composable rather than a core function because the band needs two
 * formatted splits joined by a message, and messages are the shell's.
 */
interface UseTargetTextReturn {
  /** Empty string when there is no target yet — a blank is not a claim. */
  targetText: ComputedRef<(session: PlanSession, target: SessionTarget | null) => string>
}

/**
 * The kinds quoted as a zone rather than a number.
 *
 * A set, not a second `===`: the list has grown once already and the next
 * kind to join it should be one entry, not one more branch to keep in step
 * with `targets.ts`.
 */
const BAND_KINDS: ReadonlySet<SessionKind> = new Set(['steady', 'timedSteady'])

export function useTargetText(): UseTargetTextReturn {
  const { t } = useI18n()

  const band = (splitMs: number): string =>
    Result.getOrElse(
      Result.map(steadyBandText(splitMs), ({ lower, upper }) =>
        t('plans.target.band', { lower, upper }),
      ),
      () => '',
    )

  return {
    targetText: computed(() => (session, target) => {
      if (target === null) return ''
      if (BAND_KINDS.has(session.kind)) return band(target.splitMs)

      return Result.getOrElse(formatSplit(target.splitMs), () => '')
    }),
  }
}
