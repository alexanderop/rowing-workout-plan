import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ErgCharacteristic, ErgDevice, ErgGattServer, ErgService } from '@/lib/ergBluetooth'
import {
  ERG_MULTIPLEXED_UUID,
  ERG_SERVICE_UUID,
  isErgBluetoothSupported,
  requestErg,
  subscribeRawFrames,
} from '@/lib/ergBluetooth'

/**
 * The platform edge, and one of the two places in the project where a unit
 * spec is allowed a test double (docs/functional-core.md). Web Bluetooth
 * cannot be driven from a test runner at all, so the double is the only way
 * to grade the wiring — which is exactly what the tripwire is for.
 *
 * What is graded here is the *plumbing*: the right service, the right
 * characteristic, notifications actually started, listeners actually removed.
 * Nothing here decodes, because the module does not.
 */

/** A characteristic that can be made to notify, with a value we control. */
class FakeCharacteristic extends EventTarget implements ErgCharacteristic {
  value: DataView | undefined
  readonly startNotifications = vi.fn(async (): Promise<void> => {})
  readonly stopNotifications = vi.fn(async (): Promise<void> => {})

  /** What the browser does on a notification: set `value`, then dispatch. */
  notify(bytes: ReadonlyArray<number>): void {
    this.value = new DataView(new Uint8Array(bytes).buffer)
    this.dispatchEvent(new Event('characteristicvaluechanged'))
  }
}

class FakeDevice extends EventTarget implements ErgDevice {
  readonly characteristic = new FakeCharacteristic()
  readonly disconnect = vi.fn()
  readonly getCharacteristic = vi.fn(async (): Promise<ErgCharacteristic> => this.characteristic)
  readonly getPrimaryService = vi.fn(
    async (): Promise<ErgService> => ({ getCharacteristic: this.getCharacteristic }),
  )
  connected = true
  readonly gatt: ErgGattServer

  /**
   * One server object for the life of the device, with a `connected` that
   * tracks the device — which is what the real `BluetoothRemoteGATTServer`
   * is. A fake returning a fresh literal per access would freeze `connected`
   * at whatever it was when the module captured it, and would pass the
   * teardown test below while the shipped code disconnected a server that had
   * already gone. (It did, until this was fixed.)
   */
  constructor(readonly name = 'PM5 430123456') {
    super()

    // An arrow, not `const device = this`: a property getter's own `this` is
    // the object literal, so the flag has to be reached through a closure
    // that captured the device lexically.
    const isConnected = (): boolean => this.connected
    this.gatt = {
      get connected(): boolean {
        return isConnected()
      },
      connect: async () => this.gatt,
      disconnect: this.disconnect,
      getPrimaryService: this.getPrimaryService,
    }
  }

  /** The erg going away on its own — power off, or out of range. */
  drop(): void {
    this.connected = false
    this.dispatchEvent(new Event('gattserverdisconnected'))
  }
}

function stubBluetooth(requestDevice?: () => Promise<ErgDevice>): void {
  vi.stubGlobal('navigator', requestDevice ? { bluetooth: { requestDevice } } : {})
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('isErgBluetoothSupported', () => {
  it('is false on a browser with no Web Bluetooth', () => {
    stubBluetooth(undefined)

    expect(isErgBluetoothSupported()).toBe(false)
  })

  it('is true when the API is there', () => {
    stubBluetooth(async () => new FakeDevice())

    expect(isErgBluetoothSupported()).toBe(true)
  })
})

describe('requestErg', () => {
  it('refuses clearly rather than throwing on an undefined property', async () => {
    stubBluetooth(undefined)

    await expect(requestErg()).rejects.toThrow('Web Bluetooth is not available')
  })

  it('offers the rowing service and the PM5 name as alternatives', async () => {
    // Two filters, OR'd: a monitor that advertises the service is matched by
    // it, one that only advertises its name by the prefix.
    const requestDevice = vi.fn(async () => new FakeDevice())
    stubBluetooth(requestDevice)

    await requestErg()

    expect(requestDevice).toHaveBeenCalledWith({
      filters: [{ services: [ERG_SERVICE_UUID] }, { namePrefix: 'PM5' }],
      optionalServices: [ERG_SERVICE_UUID],
    })
  })

  it('names the service in lowercase, which is the only form that matches', () => {
    // Web Bluetooth compares UUIDs as lowercase strings and matches nothing at
    // all when handed the upper-case form the interface definition prints.
    expect(ERG_SERVICE_UUID).toBe(ERG_SERVICE_UUID.toLowerCase())
    expect(ERG_MULTIPLEXED_UUID).toBe(ERG_MULTIPLEXED_UUID.toLowerCase())
  })
})

describe('subscribeRawFrames', () => {
  it('subscribes to the multiplexed characteristic of the rowing service', async () => {
    const fake = new FakeDevice()

    await subscribeRawFrames(fake, () => {})

    expect(fake.getPrimaryService).toHaveBeenCalledWith(ERG_SERVICE_UUID)
    expect(fake.getCharacteristic).toHaveBeenCalledWith(ERG_MULTIPLEXED_UUID)
    expect(fake.characteristic.startNotifications).toHaveBeenCalledOnce()
  })

  it('hands over every notification, byte for byte', async () => {
    const fake = new FakeDevice()
    const seen: Array<Array<number>> = []
    await subscribeRawFrames(fake, (value) => {
      seen.push([...new Uint8Array(value.buffer)])
    })

    fake.characteristic.notify([0x31, 0x00, 0x01])
    fake.characteristic.notify([0x32, 0xff])

    expect(seen).toEqual([
      [0x31, 0x00, 0x01],
      [0x32, 0xff],
    ])
  })

  it('reports a drop the app did not ask for', async () => {
    const fake = new FakeDevice()
    const onDisconnect = vi.fn()
    await subscribeRawFrames(fake, () => {}, onDisconnect)

    fake.drop()

    expect(onDisconnect).toHaveBeenCalledOnce()
  })

  it('survives a drop with no handler passed', async () => {
    const fake = new FakeDevice()
    await subscribeRawFrames(fake, () => {})

    expect(() => fake.drop()).not.toThrow()
  })

  it('refuses a device with no GATT server', async () => {
    // An `EventTarget` and nothing else: `name` and `gatt` are both optional
    // on the contract, so this is a device the compiler accepts and the
    // module has to refuse at runtime.
    const gattless: ErgDevice = new EventTarget()

    await expect(subscribeRawFrames(gattless, () => {})).rejects.toThrow('no GATT server')
  })

  it('stops listening and disconnects on stop', async () => {
    const fake = new FakeDevice()
    const seen: Array<string> = []
    const subscription = await subscribeRawFrames(fake, () => seen.push('frame'))

    await subscription.stop()
    fake.characteristic.notify([0x31])

    expect(seen).toEqual([])
    expect(fake.characteristic.stopNotifications).toHaveBeenCalledOnce()
    expect(fake.disconnect).toHaveBeenCalledOnce()
  })

  it('does not disconnect a server that has already gone', async () => {
    const fake = new FakeDevice()
    const subscription = await subscribeRawFrames(fake, () => {})

    fake.drop()
    await subscription.stop()

    expect(fake.disconnect).not.toHaveBeenCalled()
  })

  it('tears down even when the erg has already vanished', async () => {
    // The most likely reason someone is stopping, and there is nothing a
    // caller could do with the failure anyway.
    const fake = new FakeDevice()
    fake.characteristic.stopNotifications.mockRejectedValueOnce(new Error('GATT is gone'))
    const subscription = await subscribeRawFrames(fake, () => {})

    await expect(subscription.stop()).resolves.toBeUndefined()
    expect(fake.disconnect).toHaveBeenCalledOnce()
  })
})
