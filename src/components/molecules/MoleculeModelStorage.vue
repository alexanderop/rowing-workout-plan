<script setup lang="ts">
import { Trash2 } from '@lucide/vue'
import { computed, onMounted, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import AtomButton from '@/components/atoms/AtomButton.vue'
import { useLocale } from '@/composables/useLocale'
import type { CachedDownload } from '@/lib/modelCache'
import { listCachedDownloads, removeCachedDownload } from '@/lib/modelCache'
import { MODEL_ID as MONITOR_PHOTO_MODEL } from '@/lib/monitorPhotoModel'

/** The npm package `@huggingface/transformers` fetches the ONNX runtime
 * from. Not a model, but it lands in the same cache and takes the same room. */
const ONNX_RUNTIME = 'onnxruntime-web'
import { useToastStore } from '@/stores/toast'

/**
 * The models this device has downloaded, and the way to get the room back.
 *
 * The photo scan pulls a few hundred megabytes of weights the first time it
 * is used, without anyone choosing to install them, and nothing ever removes
 * them again. In an app whose whole promise is that the data is yours and on
 * your device, the corollary is that you get told what is on your device and
 * can take it off — the same argument as the export and delete controls it
 * sits beside.
 *
 * A composite, not a primitive: it reads the cache and the toast store, and
 * composes atoms. It renders one small thing — a list of what is stored —
 * which is what keeps it a molecule rather than an organism
 * (docs/atomic-design.md).
 *
 * No confirmation dialog, unlike deleting your data. Removing a model takes
 * nothing away that cannot come back: the next scan downloads it again, with
 * a progress bar that says how long that will be. Guarding it would be
 * ceremony over a reversible act.
 */
const { t } = useI18n()
const { locale } = useLocale()
const toast = useToastStore()

const downloads = shallowRef<ReadonlyArray<CachedDownload>>([])
// Undefined until the first read lands, so the section can say "checking"
// once rather than flashing "nothing downloaded" at every visitor.
const isLoaded = ref(false)
const removing = ref<string | null>(null)

// Built from the locale and `computed` so a language change rebuilds it — an
// Intl formatter captures its locale when it is constructed, the same rule
// useTrainingFormat sets out.
const megabyteFormat = computed(
  () =>
    new Intl.NumberFormat(locale.value, {
      style: 'unit',
      unit: 'megabyte',
      maximumFractionDigits: 0,
      maximumSignificantDigits: 2,
      roundingPriority: 'morePrecision',
    }),
)
const BYTES_PER_MEGABYTE = 1_000_000

const size = (bytes: number): string => megabyteFormat.value.format(bytes / BYTES_PER_MEGABYTE)

/**
 * What a model is *for*, where this app knows. The repository id is the
 * honest identifier and always shown; a rower deciding whether to reclaim
 * 360 MB needs the other half — which button stops working if they do.
 *
 * A branch per model rather than an id-to-key map, because `t()` is only
 * checked against the catalogues when it is passed a literal — a map turns
 * every one of these into a key nothing can verify. One `else if` per model
 * is the price of that check, and there is one model.
 */
const purposeOf = (id: string): string => {
  if (id === MONITOR_PHOTO_MODEL) return t('settings.models.usedBy.monitorPhoto')

  return id === ONNX_RUNTIME ? t('settings.models.usedBy.runtime') : ''
}

async function refresh(): Promise<void> {
  downloads.value = await listCachedDownloads()
  isLoaded.value = true
}

async function remove(download: CachedDownload): Promise<void> {
  removing.value = download.id
  const removed = await removeCachedDownload(download.id)
  removing.value = null

  toast.showToast(
    removed
      ? t('settings.models.removed', { size: size(download.bytes) })
      : t('settings.models.removeError'),
  )
  await refresh()
}

onMounted(refresh)
</script>

<template>
  <section data-slot="model-storage" class="flex flex-col gap-3">
    <h2 class="text-section-title font-semibold">{{ t('settings.models.title') }}</h2>
    <div class="flex flex-col gap-4 rounded-lg border p-4">
      <p class="text-sm text-muted-foreground">{{ t('settings.models.description') }}</p>

      <p v-if="!isLoaded" class="text-sm text-muted-foreground">
        {{ t('settings.models.checking') }}
      </p>
      <p v-else-if="downloads.length === 0" class="text-sm text-muted-foreground">
        {{ t('settings.models.empty') }}
      </p>

      <ul v-else class="flex flex-col gap-3">
        <li
          v-for="download in downloads"
          :key="download.id"
          class="flex min-h-touch-target flex-wrap items-center justify-between gap-3 border-t pt-3 first:border-t-0 first:pt-0"
        >
          <div class="min-w-0">
            <p class="truncate font-medium">{{ download.id }}</p>
            <p class="text-sm text-muted-foreground">
              {{
                t('settings.models.usage', { size: size(download.bytes), files: download.files })
              }}
            </p>
            <p v-if="purposeOf(download.id)" class="text-sm text-muted-foreground">
              {{ purposeOf(download.id) }}
            </p>
          </div>
          <AtomButton
            variant="outline"
            :disabled="removing === download.id"
            :aria-label="t('settings.models.removeLabel', { model: download.id })"
            @click="remove(download)"
          >
            <Trash2 />
            {{
              removing === download.id ? t('settings.models.removing') : t('settings.models.remove')
            }}
          </AtomButton>
        </li>
      </ul>
    </div>
  </section>
</template>
