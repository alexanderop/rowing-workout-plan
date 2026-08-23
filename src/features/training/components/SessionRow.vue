<script setup lang="ts">
import { Check, ChevronRight } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { RouteNames } from '@/router'
import { describeSession } from '../session'
import type { SessionTarget } from '../targets'
import type { PlanSession } from '../types'
import { useTargetText } from '../useTargetText'

const { session, position, target, done } = defineProps<{
  session: PlanSession
  position: number
  /** `null` until a 2k exists — the row still lists the session. */
  target: SessionTarget | null
  done: boolean
}>()

const { t } = useI18n()
const { targetText: text } = useTargetText()

const description = computed(() => describeSession(session))

// A band for steady, a number for everything else — the one rule, in the one
// place that owns it.
const targetText = computed(() => text.value(session, target))
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
            duration: description.duration,
            rest: description.rest,
          })
        }}
      </span>
      <span class="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span class="truncate">{{ t(`plans.kind.${session.kind}`) }}</span>
        <!-- A session the plan offers without requiring it. The badge is on
             the kind line rather than the title so the sentence stays the
             whole width it needs on a phone. -->
        <span
          v-if="session.optional === true"
          class="shrink-0 rounded-sm border px-1 py-px text-[0.625rem] leading-tight font-medium tracking-wide uppercase"
        >
          {{ t('plans.optional') }}
        </span>
      </span>
    </span>

    <span v-if="targetText !== ''" class="shrink-0 text-right">
      <span class="block text-sm font-semibold tabular-nums">{{ targetText }}</span>
      <span class="block text-xs text-muted-foreground">{{ t('plans.target.label') }}</span>
    </span>

    <ChevronRight class="size-4 shrink-0 text-muted-foreground" />
  </RouterLink>
</template>
