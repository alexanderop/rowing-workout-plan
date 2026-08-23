<script setup lang="ts">
import { Download, Smartphone, Trash2, Upload } from '@lucide/vue'
import { Effect } from 'effect'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import TemplatePageLayout from '@/components/templates/TemplatePageLayout.vue'
import OrganismPwaInstallDialog from '@/components/organisms/OrganismPwaInstallDialog.vue'
import AtomButton from '@/components/atoms/AtomButton.vue'
import AtomLabel from '@/components/atoms/AtomLabel.vue'
import AtomSwitch from '@/components/atoms/AtomSwitch.vue'
import {
  MoleculeDialog,
  MoleculeDialogClose,
  MoleculeDialogContent,
  MoleculeDialogDescription,
  MoleculeDialogFooter,
  MoleculeDialogHeader,
  MoleculeDialogTitle,
} from '@/components/molecules/dialog'
import { useDbWrite } from '@/composables/useDbWrite'
import { useInstallPrompt } from '@/composables/useInstallPrompt'
import { useLocale } from '@/composables/useLocale'
import { useReportFailure } from '@/composables/useReportFailure'
import { useTheme } from '@/composables/useTheme'
import { deleteAllData, exportData, importData, runDb } from '@/db'
import type { SupportedLocale } from '@/i18n'
import { downloadBackup, readBackupFile } from '@/lib/backupFile'
import { useToastStore } from '@/stores/toast'

const { t } = useI18n()
const { isDark } = useTheme()
const { locale, setLocale, supportedLocales } = useLocale()
const toast = useToastStore()

// The way back in after "Not now" — a dismissed hint is persisted forever, so
// without this the install path would be a one-time offer.
const { canInstall, isInstalled } = useInstallPrompt()
const installDialogOpen = ref(false)

// Import and delete write rows, so they run through the mutation atom: when
// the program lands, the read atoms are invalidated and re-read — no manual
// store reload. Export only reads, so it stays on `runDb`. The guard the
// composable carries is what stops a second tap on Delete everything from
// starting a second wipe behind the first.
const { isWriting, write } = useDbWrite()

// The shared failure branch: a structured log for the developer, a toast for
// the user — see useReportFailure for why it is an Effect.
const reportFailure = useReportFailure('settings')

/**
 * Every language is offered in its own name ("Deutsch", never "German"), so
 * the label is read from that locale's catalog instead of the active one —
 * one `nativeName` key per catalog, which a new locale brings with it.
 */
function localeName(code: SupportedLocale): string {
  return t('settings.language.nativeName', {}, { locale: code })
}

function handleLocaleChange(event: Event): void {
  // SAFETY: the handler is bound to `<select>`'s own change event in this
  // component's template, so the target is that element. `setLocale` then
  // re-checks the value against SUPPORTED_LOCALES and falls back — the
  // assertion is a shape claim, not a validity one.
  const value = (event.target as HTMLSelectElement).value
  // SAFETY: `setLocale` re-checks the value against SUPPORTED_LOCALES and
  // falls back to the default, so this narrows the argument type without
  // claiming the string has been validated.
  setLocale(value as SupportedLocale)
}

/**
 * Reading the database and handing the file to the browser are two steps that
 * can each fail, so both are programs and the recovery is written once. A
 * backup the user believes they saved and did not is the worst outcome in a
 * local-first app, so the failure is never silent.
 *
 * The runDb promise is returned to Vue: with every failure caught by tag, a
 * rejection can only be a defect, and Vue routes it to
 * `app.config.errorHandler` — but only for promises it is handed.
 */
function handleExport(): Promise<void> {
  const failed = reportFailure('export backup', t('settings.data.exportError'))

  return runDb(
    exportData.pipe(
      Effect.flatMap(downloadBackup),
      // Reading the tables can fail too now that there are tables. It gets
      // the same message as a failed download: from the user's side both are
      // "the backup you asked for did not happen".
      Effect.catchTags({ 'Db.DatabaseError': failed, 'BackupFile.BackupFileError': failed }),
    ),
  )
}

const fileInput = ref<HTMLInputElement | null>(null)

async function handleImportFile(event: Event): Promise<void> {
  // SAFETY: bound to `<input type="file">`'s own change event in this
  // component's template, so the target is that input.
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  const failed = reportFailure('import backup', t('settings.data.importError'))

  // Read the file, validate it as a backup, write it — one program, two
  // distinct ways to fail, matched by tag: a payload that is not a backup
  // gets its own message, an unreadable file stays generic. A tag left out of
  // `catchTags` stays in the error channel, so adding a third failure to the
  // pipeline breaks the build at the write edge until it is handled here.
  await write(
    readBackupFile(file).pipe(
      Effect.flatMap(importData),
      Effect.tap(() => Effect.sync(() => toast.showToast(t('settings.data.importSuccess')))),
      Effect.catchTags({
        'Db.BackupInvalidError': reportFailure('import backup', t('settings.data.invalidBackup')),
        'Db.DatabaseError': failed,
        'BackupFile.BackupFileError': failed,
      }),
    ),
  )
}

const confirmDeleteOpen = ref(false)

/**
 * Wipes every table. A mutation rather than a `runDb` call, so the read atoms
 * behind every other screen re-read once it lands — without that, the log and
 * the plan you were on would still be on screen after the data behind them
 * was gone.
 *
 * The dialog is closed after the program lands rather than on the click: the
 * confirming button is the one thing on screen that says the delete is
 * happening, and a dialog that vanishes first would leave a wipe running
 * behind an ordinary settings page. Closing it on failure too is deliberate —
 * the toast is what reports the outcome either way, and holding a confirm
 * dialog open over a failed action reads as "press it again".
 */
async function handleDeleteAll(): Promise<void> {
  await write(
    deleteAllData.pipe(
      Effect.tap(() => Effect.sync(() => toast.showToast(t('settings.data.deleteSuccess')))),
      Effect.catchTag(
        'Db.DatabaseError',
        reportFailure('delete all data', t('settings.data.deleteError')),
      ),
    ),
  )
  confirmDeleteOpen.value = false
}
</script>

<template>
  <TemplatePageLayout :title="t('settings.title')" :show-back="false">
    <div class="mx-auto flex w-full max-w-lg flex-col gap-section p-4">
      <section class="flex flex-col gap-3">
        <h2 class="text-section-title font-semibold">{{ t('settings.appearance.title') }}</h2>
        <div class="flex min-h-touch-target items-center justify-between rounded-lg border p-4">
          <AtomLabel for="dark-mode-switch">{{ t('settings.appearance.darkMode') }}</AtomLabel>
          <AtomSwitch id="dark-mode-switch" v-model="isDark" />
        </div>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-section-title font-semibold">{{ t('settings.language.title') }}</h2>
        <div class="rounded-lg border p-4">
          <AtomLabel class="flex flex-col gap-2" for="locale-select">
            {{ t('settings.language.label') }}
            <select
              id="locale-select"
              class="h-touch-target rounded-md border border-input bg-transparent px-3 text-base"
              :value="locale"
              @change="handleLocaleChange"
            >
              <option v-for="code in supportedLocales" :key="code" :value="code">
                {{ localeName(code) }}
              </option>
            </select>
          </AtomLabel>
        </div>
      </section>

      <!-- Nothing to offer a browser that cannot install and is not installed
           — an "install" row that leads to no instructions is worse than no
           row at all. -->
      <section v-if="canInstall || isInstalled" class="flex flex-col gap-3">
        <h2 class="text-section-title font-semibold">{{ t('pwa.install.settings.title') }}</h2>
        <div class="flex flex-col gap-4 rounded-lg border p-4">
          <p v-if="isInstalled" class="text-sm text-muted-foreground">
            {{ t('pwa.install.settings.installed') }}
          </p>
          <template v-else>
            <p class="text-sm text-muted-foreground">
              {{ t('pwa.install.settings.description') }}
            </p>
            <div>
              <AtomButton variant="outline" @click="installDialogOpen = true">
                <Smartphone />
                {{ t('pwa.install.settings.action') }}
              </AtomButton>
            </div>
          </template>
        </div>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-section-title font-semibold">{{ t('settings.data.title') }}</h2>
        <div class="flex flex-col gap-4 rounded-lg border p-4">
          <p class="text-sm text-muted-foreground">{{ t('settings.data.description') }}</p>
          <div class="flex flex-wrap gap-2">
            <AtomButton variant="outline" @click="handleExport">
              <Download />
              {{ t('settings.data.export') }}
            </AtomButton>
            <AtomButton variant="outline" @click="fileInput?.click()">
              <Upload />
              {{ t('settings.data.import') }}
            </AtomButton>
            <!-- eslint-disable-next-line vue/no-restricted-html-elements -- AtomInput is a `defineModel<string>` text field; a file input has no string value to bind and this one is `hidden` anyway, driven entirely by the button above it. There is nothing here for the primitive to style. -->
            <input
              ref="fileInput"
              type="file"
              accept="application/json"
              class="hidden"
              @change="handleImportFile"
            />
          </div>

          <!-- Divided off rather than sat beside export and import: the two
               above hand you a copy of your data, and this one is the only
               control on the screen that takes something away. -->
          <div class="flex flex-col gap-3 border-t pt-4">
            <p class="text-sm text-muted-foreground">{{ t('settings.data.deleteHint') }}</p>
            <div>
              <AtomButton variant="destructive" @click="confirmDeleteOpen = true">
                <Trash2 />
                {{ t('settings.data.deleteAll') }}
              </AtomButton>
            </div>
          </div>
        </div>
      </section>
    </div>

    <MoleculeDialog v-model:open="confirmDeleteOpen">
      <MoleculeDialogContent>
        <MoleculeDialogHeader>
          <MoleculeDialogTitle>{{ t('settings.data.confirmDelete.title') }}</MoleculeDialogTitle>
          <MoleculeDialogDescription>
            {{ t('settings.data.confirmDelete.description') }}
          </MoleculeDialogDescription>
        </MoleculeDialogHeader>

        <p class="text-sm text-muted-foreground">{{ t('settings.data.confirmDelete.keeps') }}</p>

        <!-- Cancel first, so the footer's column-reverse puts it at the
             bottom — under the thumb, with the confirm above it. That is the
             opposite of the order MoleculeDialogFooter documents, and
             deliberately: its convention puts the confirming action where the
             thumb already rests, which is right for a save and wrong for an
             irreversible wipe. Here the easy target is the way out. -->
        <MoleculeDialogFooter>
          <MoleculeDialogClose as-child>
            <AtomButton variant="outline" class="w-full sm:w-auto">
              {{ t('common.buttons.cancel') }}
            </AtomButton>
          </MoleculeDialogClose>
          <!-- Not a DialogClose: the dialog closes when the write lands, not
               when the button is pressed. -->
          <!-- Disabled while the wipe runs: the dialog deliberately stays open
               until the program lands, so without this the confirming button
               is the one control on screen that still invites a second tap. -->
          <AtomButton
            variant="destructive"
            class="w-full sm:w-auto"
            :disabled="isWriting"
            @click="handleDeleteAll"
          >
            {{ t('settings.data.confirmDelete.confirm') }}
          </AtomButton>
        </MoleculeDialogFooter>
      </MoleculeDialogContent>
    </MoleculeDialog>

    <OrganismPwaInstallDialog v-model:open="installDialogOpen" />
  </TemplatePageLayout>
</template>
