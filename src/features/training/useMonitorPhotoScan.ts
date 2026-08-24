import { Result } from 'effect'
import { shallowRef, type ShallowRef } from 'vue'
import { readMonitorPhoto } from '@/lib/monitorPhotoModel'
import { MONITOR_PHOTO_PROMPT, type MonitorReading, parseMonitorReading } from './monitorPhoto'

/**
 * The shell over the photo scan: *when* a scan runs and what its progress
 * looks like to a template. What the model is asked lives in
 * `monitorPhoto.ts`, how it is asked in `lib/monitorPhotoModel.ts` — this
 * composable only sequences the two and narrates.
 *
 * Two working states rather than one busy flag, because they differ by
 * orders of magnitude: `loadingModel` covers the first-use download of the
 * model weights (minutes on a slow line), `reading` the actual look at the
 * photo (seconds). A single spinner over both reads as a hang.
 *
 * Per-caller state on purpose — no `createSharedComposable`: each sheet owns
 * its own scan, and there is exactly one sheet mounted.
 */
type MonitorPhotoScanStatus = 'idle' | 'loadingModel' | 'reading'

interface UseMonitorPhotoScanReturn {
  /** What the scan is doing right now; `idle` between scans. */
  readonly status: ShallowRef<MonitorPhotoScanStatus>
  /** Reads one photo. Resolves with the reading, or `undefined` when the
   * photo could not be read — the caller says so, this does not throw. */
  readonly scan: (photo: Blob) => Promise<MonitorReading | undefined>
}

export function useMonitorPhotoScan(): UseMonitorPhotoScanReturn {
  const status = shallowRef<MonitorPhotoScanStatus>('idle')

  async function scan(photo: Blob): Promise<MonitorReading | undefined> {
    status.value = 'loadingModel'
    const reply = await readMonitorPhoto(photo, MONITOR_PHOTO_PROMPT, () => {
      status.value = 'reading'
    })
    const reading =
      reply === null ? undefined : Result.getOrElse(parseMonitorReading(reply), () => undefined)
    status.value = 'idle'

    return reading
  }

  return { status, scan }
}
