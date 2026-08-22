/**
 * The Web Bluetooth surface of a Concept2 PM5 — and nothing above it.
 *
 * Platform edge: plain async TypeScript, try/catch, no Effect, no domain
 * content (docs/functional-core.md). What the bytes *mean* is decoded
 * elsewhere from `specs/reference/PM5_BluetoothSmartInterfaceDefinition.pdf`;
 * this module only opens the pipe and hands over what came down it, byte for
 * byte. That separation is the point: a capture taken through here is
 * evidence, not an interpretation, so it can be used to check the decoder
 * that is written later.
 *
 * The Web Bluetooth types are declared structurally rather than pulled from
 * `@types/web-bluetooth`, the same way `swUpdateCheck.ts` narrows a
 * `ServiceWorkerRegistration`: the contract then says exactly what is used,
 * and a spec can hand over a stand-in without asserting one into existence.
 *
 * **Secure context only.** Web Bluetooth is refused on plain HTTP, which
 * includes a dev server reached over a LAN address from a phone. See
 * `docs/pm5-capture.md` for the `adb reverse` route that makes the phone see
 * it as `localhost`.
 */

/**
 * Concept2's rowing service, from the interface definition. Lowercase because
 * Web Bluetooth compares UUIDs as lowercase strings and silently matches
 * nothing if handed the upper-case form the document prints.
 */
export const ERG_SERVICE_UUID = 'ce060030-43e5-11e4-916c-0800200c9a66'

/**
 * The multiplexed characteristic. Every rowing sub-message arrives here with
 * its id in the leading byte — which is why one subscription captures the lot,
 * and why the id byte must be kept: it is what tells 0x0031 from 0x0032.
 */
export const ERG_MULTIPLEXED_UUID = 'ce060080-43e5-11e4-916c-0800200c9a66'

/**
 * The slice of Web Bluetooth this module touches.
 *
 * Exported so a spec can implement them exactly rather than assert a stand-in
 * into place — the double is then checked by the compiler against the same
 * contract the shipped code reads, which is the only thing that makes a fake
 * worth writing.
 *
 * The notification calls are declared as returning nothing. The real ones
 * hand back the characteristic; nothing here reads it, and saying so keeps
 * `unknown` out of a contract other code has to satisfy.
 */
export interface ErgCharacteristic extends EventTarget {
  readonly value?: DataView | undefined
  startNotifications(): Promise<void>
  stopNotifications(): Promise<void>
}

export interface ErgService {
  getCharacteristic(uuid: string): Promise<ErgCharacteristic>
}

export interface ErgGattServer {
  readonly connected: boolean
  connect(): Promise<ErgGattServer>
  disconnect(): void
  getPrimaryService(uuid: string): Promise<ErgService>
}

export interface ErgDevice extends EventTarget {
  readonly name?: string | undefined
  readonly gatt?: ErgGattServer | undefined
}

interface BluetoothLike {
  requestDevice(options: {
    filters: ReadonlyArray<{ services?: ReadonlyArray<string>; namePrefix?: string }>
    optionalServices?: ReadonlyArray<string>
  }): Promise<ErgDevice>
}

/**
 * `lib.dom` has no `navigator.bluetooth`, so the property is declared rather
 * than asserted into existence at the one place it is read. Optional, because
 * that is the truth: it is absent on iOS and on Firefox, and every caller has
 * to handle its absence anyway.
 */
declare global {
  interface Navigator {
    readonly bluetooth?: BluetoothLike
  }
}

function bluetooth(): BluetoothLike | undefined {
  return globalThis.navigator?.bluetooth
}

/** Whether this browser can talk to an erg at all. False on iOS and Firefox. */
export function isErgBluetoothSupported(): boolean {
  return bluetooth() !== undefined
}

/**
 * Ask the user to pick their monitor. **Must be called from a user gesture** —
 * the browser refuses otherwise, and the refusal looks like a rejected promise
 * rather than anything a feature test could have caught first.
 *
 * Two filters, OR'd: a PM5 that advertises the rowing service is matched by
 * it, and one that only advertises its name is matched by the prefix. The
 * service is repeated under `optionalServices` because a device matched by
 * name alone is not granted access to it otherwise — which fails later, at
 * `getPrimaryService`, with an error that reads like the erg is broken.
 */
export async function requestErg(): Promise<ErgDevice> {
  const api = bluetooth()
  if (api === undefined) throw new Error('Web Bluetooth is not available in this browser')

  return api.requestDevice({
    filters: [{ services: [ERG_SERVICE_UUID] }, { namePrefix: 'PM5' }],
    optionalServices: [ERG_SERVICE_UUID],
  })
}

/** A running subscription. `stop` is idempotent and never throws. */
export interface ErgSubscription {
  stop(): Promise<void>
}

/**
 * Connect and stream every raw notification to `onFrame`.
 *
 * The `DataView` handed over is the browser's own buffer, reused between
 * notifications — so a caller that keeps it keeps a view onto whatever
 * arrived last. Copy in the callback; `ergCapture.ts` does exactly that.
 *
 * `onDisconnect` fires for a drop the app did not ask for (the erg powering
 * down, walking out of range), which is worth showing rather than leaving a
 * screen looking connected and silent.
 */
export async function subscribeRawFrames(
  device: ErgDevice,
  onFrame: (value: DataView) => void,
  onDisconnect?: () => void,
): Promise<ErgSubscription> {
  const gatt = device.gatt
  if (gatt === undefined) throw new Error('That device exposes no GATT server')

  const server = await gatt.connect()
  const service = await server.getPrimaryService(ERG_SERVICE_UUID)
  const characteristic = await service.getCharacteristic(ERG_MULTIPLEXED_UUID)

  // Closed over rather than read off `event.target`: the listener is bound to
  // this characteristic and to no other, so the object is already in hand and
  // there is nothing to narrow an event target down to.
  const handleValue = (): void => {
    const value = characteristic.value
    if (value !== undefined) onFrame(value)
  }

  const handleDisconnect = (): void => onDisconnect?.()

  characteristic.addEventListener('characteristicvaluechanged', handleValue)
  device.addEventListener('gattserverdisconnected', handleDisconnect)
  await characteristic.startNotifications()

  return {
    async stop(): Promise<void> {
      characteristic.removeEventListener('characteristicvaluechanged', handleValue)
      device.removeEventListener('gattserverdisconnected', handleDisconnect)

      // Both of these throw if the erg has already gone, which is the most
      // likely reason someone is stopping. Tearing down is best-effort by
      // definition — there is nothing a caller could do with the failure.
      try {
        await characteristic.stopNotifications()
      } catch {
        // Already gone.
      }
      try {
        if (server.connected) server.disconnect()
      } catch {
        // Already gone.
      }
    },
  }
}
