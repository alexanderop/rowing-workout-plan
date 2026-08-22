<script setup lang="ts">
import { Share, SquarePlus } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import AtomButton from '@/components/atoms/AtomButton.vue'
import {
  MoleculeDialog,
  MoleculeDialogClose,
  MoleculeDialogContent,
  MoleculeDialogDescription,
  MoleculeDialogFooter,
  MoleculeDialogHeader,
  MoleculeDialogTitle,
} from '@/components/molecules/dialog'
import { useInstallPrompt } from '@/composables/useInstallPrompt'

/**
 * How to install, for the browser actually in front of the user.
 *
 * Four bodies, and only one of them is a button. That asymmetry is the whole
 * point: Chromium hands us a prompt to trigger, Safari hands us nothing and
 * expects the user to find the Share sheet, and the residual case can only
 * be pointed at the address bar. Showing everyone the same "Install" button
 * would be a dead end on two of the three.
 *
 * A flat component rather than a set of primitives — the branching is app
 * content, not a dialog variant. See docs/ui-components.md.
 */
const open = defineModel<boolean>('open', { required: true })

const { t } = useI18n()
const { canPromptDirectly, platform, promptInstall } = useInstallPrompt()

async function handleInstall(): Promise<void> {
  const outcome = await promptInstall()
  // Dismissing the browser's dialog is not dismissing ours: the user may want
  // to read the steps again. Only a completed install closes this.
  if (outcome === 'accepted') open.value = false
}
</script>

<template>
  <MoleculeDialog v-model:open="open">
    <MoleculeDialogContent>
      <MoleculeDialogHeader>
        <MoleculeDialogTitle>{{ t('pwa.install.dialog.title') }}</MoleculeDialogTitle>
        <MoleculeDialogDescription>{{
          t('pwa.install.dialog.description')
        }}</MoleculeDialogDescription>
      </MoleculeDialogHeader>

      <div v-if="canPromptDirectly" class="flex flex-col gap-3">
        <p class="text-sm text-muted-foreground">{{ t('pwa.install.dialog.prompt') }}</p>
        <AtomButton @click="handleInstall">{{ t('pwa.install.dialog.action') }}</AtomButton>
      </div>

      <div v-else-if="platform === 'ios'" class="flex flex-col gap-3">
        <p class="text-sm text-muted-foreground">{{ t('pwa.install.dialog.ios.intro') }}</p>
        <ol class="flex list-decimal flex-col gap-2 pl-5 text-sm">
          <li class="flex items-center gap-2">
            <Share aria-hidden="true" />
            {{ t('pwa.install.dialog.ios.share') }}
          </li>
          <li class="flex items-center gap-2">
            <SquarePlus aria-hidden="true" />
            {{ t('pwa.install.dialog.ios.add') }}
          </li>
          <li>{{ t('pwa.install.dialog.ios.confirm') }}</li>
        </ol>
        <p class="rounded-md bg-muted p-3 text-sm text-muted-foreground">
          {{ t('pwa.install.dialog.ios.note') }}
        </p>
      </div>

      <div v-else-if="platform === 'android'" class="flex flex-col gap-3">
        <p class="text-sm text-muted-foreground">{{ t('pwa.install.dialog.android.intro') }}</p>
        <ol class="flex list-decimal flex-col gap-2 pl-5 text-sm">
          <li>{{ t('pwa.install.dialog.android.menu') }}</li>
          <li>{{ t('pwa.install.dialog.android.install') }}</li>
          <li>{{ t('pwa.install.dialog.android.confirm') }}</li>
        </ol>
      </div>

      <div v-else class="flex flex-col gap-3">
        <p class="text-sm text-muted-foreground">{{ t('pwa.install.dialog.other.intro') }}</p>
        <ol class="flex list-decimal flex-col gap-2 pl-5 text-sm">
          <li>{{ t('pwa.install.dialog.other.menu') }}</li>
          <li>{{ t('pwa.install.dialog.other.confirm') }}</li>
        </ol>
      </div>

      <MoleculeDialogFooter>
        <MoleculeDialogClose as-child>
          <AtomButton variant="outline" class="w-full sm:w-auto">
            {{ t('common.buttons.close') }}
          </AtomButton>
        </MoleculeDialogClose>
      </MoleculeDialogFooter>
    </MoleculeDialogContent>
  </MoleculeDialog>
</template>
