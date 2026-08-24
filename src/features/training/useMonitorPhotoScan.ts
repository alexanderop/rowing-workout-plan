import { Result } from 'effect'
import { shallowRef, type ShallowRef } from 'vue'
import { readMonitorPhoto } from '@/lib/monitorPhotoModel'
import { MONITOR_PHOTO_TASK, type MonitorReading, parseMonitorReading } from './monitorPhoto'

/**
 * The shell over the photo scan: *when* a scan runs and what its progress
 * looks like to a template. What the model is asked lives in
 * `monitorPhoto.ts`, how it is asked in `lib/monitorPhotoModel.ts` — this
 * composable only sequences the two and narrates.
 *
 * Two working states rather than one busy flag, because they differ by
 * orders of magnitude: `loadingModel` covers the first-use download of the
 * model weights (a couple of hundred megabytes, minutes on a slow line),
 * `reading` the actual look at the photo (a second or two). A single spinner
 * over both reads as a hang.
 *
 * `progress` is the same story one level finer, and passed straight through
 * from `readMonitorPhoto` rather than decided here: `null` is an
 * indeterminate bar, which is what the two unmeasurable stretches genuinely
 * are — before the first weight file answers with its size, and while a
 * *cached* model is being deserialised, which downloads nothing and so
 * reports nothing. Filling those gaps with a guess is the one thing a
 * progress bar must not do, and where that call gets made matters: it is
 * arithmetic, so it belongs a layer down where a spec can walk it
 * (docs/testing-composables.md).
 *
 * Per-caller state on purpose — no `createSharedComposable`: each sheet owns
 * its own scan, and there is exactly one sheet mounted.
 */
type MonitorPhotoScanStatus = 'idle' | 'loadingModel' | 'reading'

/** Bytes fetched against bytes known, while the weights are downloading. */
interface MonitorPhotoDownloaded {
  readonly loaded: number
  readonly total: number
}

interface UseMonitorPhotoScanReturn {
  /** What the scan is doing right now; `idle` between scans. */
  readonly status: ShallowRef<MonitorPhotoScanStatus>
  /** How far along, 0–1, or `null` when this stretch cannot say. */
  readonly progress: ShallowRef<number | null>
  /** The download behind `progress`, or `null` when nothing is downloading. */
  readonly downloaded: ShallowRef<MonitorPhotoDownloaded | null>
  /** Reads one photo. Resolves with the reading, or `undefined` when the
   * photo could not be read — the caller says so, this does not throw. */
  readonly scan: (photo: Blob) => Promise<MonitorReading | undefined>
}

export function useMonitorPhotoScan(): UseMonitorPhotoScanReturn {
  const status = shallowRef<MonitorPhotoScanStatus>('idle')
  const progress = shallowRef<number | null>(null)
  const downloaded = shallowRef<MonitorPhotoDownloaded | null>(null)

  function rest(next: MonitorPhotoScanStatus): void {
    status.value = next
    progress.value = null
    downloaded.value = null
  }

  async function scan(photo: Blob): Promise<MonitorReading | undefined> {
    rest('loadingModel')
    const reply = await readMonitorPhoto(photo, MONITOR_PHOTO_TASK, (update) => {
      status.value = update.phase
      progress.value = update.ratio
      downloaded.value =
        update.phase === 'loadingModel'
          ? { loaded: update.loadedBytes, total: update.totalBytes }
          : null
    })
    const reading =
      reply === null ? undefined : Result.getOrElse(parseMonitorReading(reply), () => undefined)
    rest('idle')

    return reading
  }

  return { status, progress, downloaded, scan }
}
