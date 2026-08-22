<script setup lang="ts">
import { Check, ChevronRight } from '@lucide/vue'
import { Result } from 'effect'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { RouteNames } from '@/router'
import { formatSplit } from '../pace'
import { describeSession } from '../session'
import { steadyBandText } from '../targets'
import type { SessionTarget } from '../targets'
import type { PlanSession } from '../types'

const { session, position, target, done } = defineProps<{
  session: PlanSession
  position: number
  /** `null` until a 2k exists — the row still lists the session. */
  target: SessionTarget | null
  done: boolean
}>()

const { t } = useI18n()

const description = computed(() => describeSession(session))

/**
 * Steady is quoted as a window and everything else as a number, which is the
 * one place this row reads the kind rather than the description: aerobic work
 * is a zone to sit in, an interval is a pace to hit, and printing one as the
 * other is how a steady row turns into a race.
 */
const targetText = computed(() => {
  if (target === null) return ''
  if (session.kind === 'steady') return bandText(target.splitMs)

  return Result.getOrElse(formatSplit(target.splitMs), () => '')
})

function bandText(splitMs: number): string {
  return Result.getOrElse(
    Result.map(steadyBandText(splitMs), ({ lower, upper }) =>
      t('plans.target.band', { lower, upper }),
    ),
    () => '',
  )
}
</script>

<template>
  <RouterLink
    :to="{ name: RouteNames.session, params: { sessionId: session.id } }"
    class="flex min-h-touch-target items-center gap-3 rounded-lg border bg-card p-3 select-none touch-manipulation transition-[background-color,scale] duration-100 active:scale-[0.99]"
  >
    <span
      class="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium"
      :class="done ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'"
    >
      <Check v-if="done" class="size-4" :aria-label="t('plans.target.done')" />
      <template v-else>{{ position }}</template>
    </span>

    <span class="min-w-0 flex-1">
      <span class="block truncate font-medium">
        {{
          t(`plans.session.${description.style}`, {
            reps: description.reps,
            distance: description.distance,
            rest: description.rest,
          })
        }}
      </span>
      <span class="block truncate text-xs text-muted-foreground">
        {{ t(`plans.kind.${session.kind}`) }}
      </span>
    </span>

    <span v-if="targetText !== ''" class="shrink-0 text-right">
      <span class="block text-sm font-semibold tabular-nums">{{ targetText }}</span>
      <span class="block text-xs text-muted-foreground">{{ t('plans.target.label') }}</span>
    </span>

    <ChevronRight class="size-4 shrink-0 text-muted-foreground" />
  </RouterLink>
</template>
