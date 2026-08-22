<script setup lang="ts">
import { useToastStore } from '@/stores/toast'

/**
 * Global toast viewport. Mount once in App.vue.
 *
 * Renders confirmation messages pushed via `useToastStore().showToast()`.
 * Deliberately minimal and self-contained — no toast library.
 */
const toastStore = useToastStore()
</script>

<template>
  <Teleport to="body">
    <div
      class="pointer-events-none fixed inset-x-0 bottom-24 z-[100] flex flex-col items-center gap-2 px-4 safe-area-bottom sm:bottom-6"
      role="status"
      aria-live="polite"
      aria-atomic="false"
    >
      <TransitionGroup
        enter-active-class="transition-all duration-200 ease-out"
        enter-from-class="opacity-0 translate-y-2"
        leave-active-class="transition-all duration-150 ease-in"
        leave-to-class="opacity-0 translate-y-2"
      >
        <div
          v-for="toast in toastStore.toasts"
          :key="toast.id"
          class="pointer-events-auto max-w-[calc(100vw-2rem)] truncate rounded-full bg-foreground px-4 py-2.5 text-sm font-medium text-background shadow-lg"
        >
          {{ toast.message }}
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
