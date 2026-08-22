<script setup lang="ts">
import { ChevronRight } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AtomButton from '@/components/atoms/AtomButton.vue'
import { planSummary } from '../progress'
import type { Plan } from '../types'

const { plan } = defineProps<{ plan: Plan }>()

const emit = defineEmits<{
  enrol: []
}>()

const { t } = useI18n()

// The badges are counted off the plan itself rather than stored beside it, so
// a rotation that changes length cannot leave a card claiming the old one.
const summary = computed(() => planSummary(plan))
</script>

<template>
  <!-- The whole card is the control, which is what a thumb expects — so it is
       an AtomButton with its geometry overridden rather than a div with a
       button in the corner. Everything the primitive carries (the press
       transform, touch-manipulation, select-none, the focus ring) comes with
       it; only the fixed height and the nowrap have to go, and tailwind-merge
       resolves those because `class` is applied last.

       The plan name is a <p>, not a heading: the card is a button, and a
       heading inside one is announced twice and outlines a document section
       that does not exist. The section's own h2 is the heading here. -->
  <AtomButton
    variant="outline"
    class="h-auto w-full flex-col items-stretch gap-2 p-4 text-left whitespace-normal pointer-fine:h-auto"
    :aria-label="t('plans.browse.start', { name: plan.name })"
    @click="emit('enrol')"
  >
    <span class="flex items-center gap-2">
      <span class="min-w-0 flex-1 truncate font-semibold">{{ plan.name }}</span>
      <ChevronRight class="text-muted-foreground" />
    </span>

    <span class="flex flex-wrap gap-1.5">
      <span class="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
        {{ t('plans.weeks', { count: summary.weekCount }) }}
      </span>
      <span class="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
        {{ t('plans.perWeek', { count: summary.sessionsPerWeek }) }}
      </span>
    </span>

    <span class="text-sm font-normal text-muted-foreground">{{ t(plan.descriptionKey) }}</span>
  </AtomButton>
</template>
