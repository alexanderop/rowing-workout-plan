<script setup lang="ts">
import MoleculePageHeader from '@/components/molecules/MoleculePageHeader.vue'

const {
  title,
  subtitle,
  backTo,
  showBack = true,
  scrollable = true,
  preventNavigation = false,
} = defineProps<{
  title: string
  subtitle?: string
  backTo?: string
  showBack?: boolean
  scrollable?: boolean
  preventNavigation?: boolean
}>()

const emit = defineEmits<{
  back: []
}>()

defineSlots<{
  'header-actions'?: () => unknown
  default: () => unknown
  footer?: () => unknown
}>()
</script>

<template>
  <div class="flex h-full flex-col">
    <MoleculePageHeader
      :title="title"
      :subtitle="subtitle"
      :back-to="backTo"
      :show-back="showBack"
      :prevent-navigation="preventNavigation"
      @back="emit('back')"
    >
      <template #actions>
        <slot name="header-actions" />
      </template>
    </MoleculePageHeader>

    <!-- `overscroll-contain` for the same reason <main> has it: this is a real
         scroller nested inside another one, so without it reaching the end of
         a settings list chains the gesture out to the shell. -->
    <div
      class="flex-1"
      :class="scrollable ? 'overflow-y-auto overscroll-contain' : 'overflow-hidden'"
    >
      <slot />
    </div>

    <footer v-if="$slots.footer" class="sticky bottom-0 border-t bg-background">
      <slot name="footer" />
    </footer>
  </div>
</template>
