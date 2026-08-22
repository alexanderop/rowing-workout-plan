<script setup lang="ts">
import { X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import AtomButton from '@/components/atoms/AtomButton.vue'
import { usePwaUpdate } from '@/composables/usePwaUpdate'

/**
 * "Update available" banner for the prompt-style service worker flow.
 * Sits above the bottom navigation so it never covers the tabs.
 */
const { t } = useI18n()
const { needRefresh, reload, dismiss } = usePwaUpdate()
</script>

<template>
  <!-- The live region stays mounted so screen readers are already observing it
       when the banner appears; a region created together with its content is
       not announced. Same pattern as ToastViewport.vue. -->
  <div role="status" aria-live="polite" aria-atomic="true">
    <div
      v-if="needRefresh"
      class="fixed inset-x-4 bottom-24 z-50 flex items-center gap-2 rounded-lg border bg-card p-3 shadow-lg sm:right-6 sm:left-auto sm:max-w-sm"
    >
      <p class="flex-1 text-sm">{{ t('pwa.updateAvailable') }}</p>
      <AtomButton size="sm" @click="reload">{{ t('pwa.reload') }}</AtomButton>
      <AtomButton variant="ghost" size="icon" :aria-label="t('pwa.dismiss')" @click="dismiss">
        <X />
      </AtomButton>
    </div>
  </div>
</template>
