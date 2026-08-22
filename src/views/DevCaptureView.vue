<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import AtomButton from '@/components/atoms/AtomButton.vue'
import AtomInput from '@/components/atoms/AtomInput.vue'
import AtomLabel from '@/components/atoms/AtomLabel.vue'
import TemplatePageLayout from '@/components/templates/TemplatePageLayout.vue'
import type { ErgSubscription } from '@/lib/ergBluetooth'
import {
  ERG_MULTIPLEXED_UUID,
  ERG_SERVICE_UUID,
  isErgBluetoothSupported,
  requestErg,
  subscribeRawFrames,
} from '@/lib/ergBluetooth'
import type { CapturedFrame } from '@/lib/ergCapture'
import { buildCapture, downloadCapture, toHex } from '@/lib/ergCapture'

/**
 * The PM5 capture harness — a developer tool, not a screen. It exists to
 * produce the fixtures slice 8's decoder is graded on, and it is deliberately
 * the one part of this app that understands nothing about what it records:
 * every frame is stored as hex exactly as it arrived, id byte included.
 *
 * Dev-only. The route is spread into the table behind `import.meta.env.DEV`,
 * which Vite replaces with `false` for a production build, so neither this
 * component nor the Bluetooth modules reach the shipped bundle.
 *
 * All copy is hard-coded English rather than translated: this never ships, and
 * a message key in `en.ts` and `de.ts` for a tool nobody but us opens is a cost
 * every future translator pays. The i18n arch test only grades `t()` calls, so
 * nothing here has to pretend otherwise.
 *
 * See docs/pm5-capture.md for how to reach it from a phone — which needs a
 * secure context, and is the part that actually catches people out.
 */

type Status = 'idle' | 'connecting' | 'recording' | 'stopped' | 'failed'

const supported = isErgBluetoothSupported()

const status = ref<Status>('idle')
const error = ref('')
const device = ref('')
const notes = ref('')
const capturedAt = ref(0)

// `shallowRef` on purpose: this array grows to thousands of entries over a
// session, and deep-proxying every frame to render a count would be the one
// thing in the app that makes a capture drop notifications.
const frames = shallowRef<Array<CapturedFrame>>([])
const subscription = shallowRef<ErgSubscription | null>(null)

const count = computed(() => frames.value.length)

/** The last few, as proof it is really recording rather than merely connected. */
const recent = computed(() => frames.value.slice(-5).reverse())

function record(value: DataView): void {
  // Read the view out now: it is the browser's own buffer, reused between
  // notifications, so a stored one is a window onto whatever arrived last.
  frames.value = [...frames.value, { at: Date.now() - capturedAt.value, hex: toHex(value) }]
}

function fail(cause: unknown): void {
  status.value = 'failed'
  error.value = cause instanceof Error ? cause.message : String(cause)
}

/** A drop the app did not ask for: the erg powered down, or walked away. */
function handleDrop(): void {
  status.value = 'stopped'
}

/**
 * Split from `start` only because the shell's statement budget says so — and
 * the budget is right: this is the part that actually does something, and it
 * reads better with the error handling lifted off it.
 */
async function connect(): Promise<void> {
  const erg = await requestErg()

  device.value = erg.name ?? 'unknown'
  capturedAt.value = Date.now()
  frames.value = []
  subscription.value = await subscribeRawFrames(erg, record, handleDrop)
  status.value = 'recording'
}

async function start(): Promise<void> {
  status.value = 'connecting'
  error.value = ''

  try {
    await connect()
  } catch (cause) {
    fail(cause)
  }
}

async function stop(): Promise<void> {
  await subscription.value?.stop()
  subscription.value = null
  status.value = 'stopped'
}

function save(): void {
  downloadCapture(
    buildCapture({
      capturedAt: capturedAt.value,
      device: device.value,
      notes: notes.value,
      service: ERG_SERVICE_UUID,
      characteristic: ERG_MULTIPLEXED_UUID,
      frames: frames.value,
    }),
  )
}

// Leaving the screen with the erg still connected would keep the radio open
// and the monitor thinking it has a partner.
onBeforeUnmount(() => {
  void subscription.value?.stop()
})
</script>

<template>
  <TemplatePageLayout title="PM5 capture" subtitle="Raw frames, nothing decoded" :show-back="false">
    <div class="mx-auto flex w-full max-w-lg flex-col gap-section p-4">
      <p v-if="!supported" role="alert" class="rounded-lg border border-dashed p-6 text-sm">
        This browser has no Web Bluetooth. Use Chrome on Android or desktop, over HTTPS or localhost
        — see docs/pm5-capture.md.
      </p>

      <template v-else>
        <div class="flex flex-wrap gap-2">
          <AtomButton :disabled="status === 'connecting' || status === 'recording'" @click="start">
            {{ status === 'stopped' ? 'Connect again' : 'Connect and record' }}
          </AtomButton>
          <AtomButton variant="outline" :disabled="status !== 'recording'" @click="stop">
            Stop
          </AtomButton>
          <AtomButton variant="outline" :disabled="count === 0" @click="save">
            Download {{ count }} frames
          </AtomButton>
        </div>

        <p v-if="error !== ''" role="alert" class="text-sm text-destructive">{{ error }}</p>

        <dl class="grid grid-cols-3 gap-2 rounded-lg border bg-card p-4 text-center">
          <div class="flex flex-col gap-0.5">
            <dd class="text-lg font-semibold tabular-nums">{{ count }}</dd>
            <dt class="text-xs text-muted-foreground">frames</dt>
          </div>
          <div class="flex flex-col gap-0.5">
            <dd class="truncate text-lg font-semibold">{{ status }}</dd>
            <dt class="text-xs text-muted-foreground">status</dt>
          </div>
          <div class="flex flex-col gap-0.5">
            <dd class="truncate text-lg font-semibold">{{ device === '' ? '—' : device }}</dd>
            <dt class="text-xs text-muted-foreground">monitor</dt>
          </div>
        </dl>

        <div class="flex flex-col gap-2">
          <AtomLabel for="capture-notes">What you rowed</AtomLabel>
          <AtomInput
            id="capture-notes"
            v-model="notes"
            placeholder="6 x 1k / 1' rest, 24spm"
            autocomplete="off"
          />
        </div>

        <!-- The last few frames, newest first. A count alone cannot tell a
             live stream from a stuck one; changing hex can. -->
        <ul v-if="recent.length > 0" class="flex list-none flex-col gap-1 p-0">
          <li
            v-for="frame in recent"
            :key="`${frame.at}-${frame.hex}`"
            class="truncate rounded-md border px-3 py-2 font-mono text-xs tabular-nums"
          >
            {{ frame.at }}ms {{ frame.hex }}
          </li>
        </ul>
      </template>
    </div>
  </TemplatePageLayout>
</template>
