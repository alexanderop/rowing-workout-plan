<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { RouteNames } from '@/router'
import type { Plan } from '../types'

const { plan, currentWeek } = defineProps<{
  plan: Plan
  currentWeek: number
}>()

const { t } = useI18n()
</script>

<template>
  <!-- A labelled list rather than a second <nav>: the shell already owns the
       page's navigation landmark, and a second one would make "the navigation"
       ambiguous to anyone moving between landmarks. The links are still links.

       The negative margin lets the strip scroll edge to edge inside a padded
       column, so the twelfth chip is not clipped by the page gutter. -->
  <ul
    :aria-label="t('plans.week.strip', { name: plan.name })"
    class="-mx-4 flex list-none gap-2 overflow-x-auto px-4 pb-1"
  >
    <li v-for="week in plan.weeks" :key="week.index">
      <RouterLink
        :to="{ name: RouteNames.planWeek, params: { planId: plan.id, week: week.index } }"
        :aria-label="t('plans.week.open', { week: week.index })"
        :aria-current="week.index === currentWeek ? 'page' : undefined"
        class="flex min-h-touch-target min-w-touch-target items-center justify-center rounded-md border text-sm font-medium select-none touch-manipulation transition-[color,background-color,scale] duration-100 active:scale-90"
        :class="
          week.index === currentWeek
            ? 'border-primary bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground'
        "
      >
        {{ week.index }}
      </RouterLink>
    </li>
  </ul>
</template>
