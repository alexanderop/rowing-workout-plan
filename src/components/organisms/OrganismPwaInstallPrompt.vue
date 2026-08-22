<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AtomButton from '@/components/atoms/AtomButton.vue'
import { useInstallPrompt } from '@/composables/useInstallPrompt'
import { usePwaUpdate } from '@/composables/usePwaUpdate'

/**
 * "Install this app" banner, shown once per browser until it is acted on.
 *
 * A banner rather than a toast: MoleculeToastViewport is for ephemeral confirmations
 * — a string, three seconds, no actions — and this needs to wait for a
 * decision and offer two. It borrows the shape of MoleculePwaUpdatePrompt.vue
 * instead, which is already the worked example of a persistent, actionable
 * strip sitting above the tab bar.
 *
 * Which is also why it yields to that one: both occupy `bottom-24`, and an
 * update the user is running out of date on is the more urgent of the two.
 * They rarely coincide — needRefresh implies a return visit after a deploy,
 * the install hint mostly fires on a first one — but "rarely" is not "never",
 * and two stacked banners is a worse bug than a hint that waits a reload.
 */
const OrganismPwaInstallDialog = defineAsyncComponent(
  () => import('./OrganismPwaInstallDialog.vue'),
)

const { t } = useI18n()
const { hintVisible, dismissHint } = useInstallPrompt()
const { needRefresh } = usePwaUpdate()

const dialogOpen = ref(false)
// Keeps the dialog machinery off the startup path: nothing loads the dialog
// until someone asks for the instructions.
const dialogRequested = ref(false)

const bannerVisible = computed(() => hintVisible.value && !needRefresh.value)

function openDialog(): void {
  dialogRequested.value = true
  dialogOpen.value = true
}
</script>

<template>
  <!-- The live region stays mounted so screen readers are already observing it
       when the banner appears; a region created together with its content is
       not announced. Same pattern as MoleculePwaUpdatePrompt.vue. -->
  <div role="status" aria-live="polite" aria-atomic="true">
    <div
      v-if="bannerVisible"
      class="fixed inset-x-4 bottom-24 z-50 flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-lg sm:right-6 sm:left-auto sm:max-w-sm"
    >
      <div class="flex flex-col gap-1">
        <p class="text-sm font-medium">{{ t('pwa.install.banner.title') }}</p>
        <p class="text-sm text-muted-foreground">{{ t('pwa.install.banner.body') }}</p>
      </div>
      <div class="flex justify-end gap-2">
        <AtomButton variant="ghost" size="sm" @click="dismissHint">
          {{ t('pwa.install.banner.later') }}
        </AtomButton>
        <AtomButton size="sm" @click="openDialog">
          {{ t('pwa.install.banner.action') }}
        </AtomButton>
      </div>
    </div>
  </div>

  <OrganismPwaInstallDialog v-if="dialogRequested" v-model:open="dialogOpen" />
</template>
