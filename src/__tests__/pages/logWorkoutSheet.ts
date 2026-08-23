import { expect, vi } from 'vitest'
import type { Locator } from 'vitest/browser'
import { page } from 'vitest/browser'

/**
 * The sheet that types a workout in off the monitor
 * (`features/training/components/LogWorkoutSheet.vue`).
 *
 * Its own object, mirroring the component: it is portalled outside whichever
 * screen opened it, and three screens open it.
 *
 * Every field here is a trigger that opens a pad, so the object speaks in
 * values rather than keystrokes: `fill({ time: '42:00' })` presses the digits
 * that produce `42:00` and confirms, because that is the only way a user can
 * put a time into this sheet.
 */

/** The three fields, as the pad title and the label that names the trigger. */
const FIELDS = {
  distance: { title: 'Distance', label: 'Distance in metres' },
  time: { title: 'Time', label: 'Time' },
  rate: { title: 'Rate', label: 'Rate in strokes per minute' },
} as const

export type FieldName = keyof typeof FIELDS

export class LogWorkoutSheet {
  /** Titled for what it is logging — a free row, or a session the plan set. */
  dialog(name: 'Log a row' | 'Log this session'): Locator {
    return page.getByRole('dialog', { name })
  }

  get anyDialog(): Locator {
    return page.getByRole('dialog')
  }

  get distance(): Locator {
    return this.field('distance')
  }

  get time(): Locator {
    return this.field('time')
  }

  get rate(): Locator {
    return this.field('rate')
  }

  get save(): Locator {
    return page.getByRole('button', { name: 'Save' })
  }

  /** The trigger, named by its label and reading out its current value. */
  field(name: FieldName): Locator {
    return page.getByRole('button', { name: new RegExp(`^${FIELDS[name].label}`) })
  }

  /** The pad itself, a dialog titled for the field it is editing. */
  pad(name: FieldName): Locator {
    return page.getByRole('dialog', { name: FIELDS[name].title })
  }

  padKey(name: FieldName, key: string): Locator {
    return this.pad(name).getByRole('button', { name: key })
  }

  async openPad(name: FieldName): Promise<void> {
    await this.field(name).click()
    await expect.element(this.pad(name)).toBeVisible()
  }

  async pressKeys(name: FieldName, ...keys: Array<string>): Promise<void> {
    for (const key of keys) await this.padKey(name, key).click()
  }

  /** Type a value the way a user does: digits only, the mask does the rest. */
  async enter(name: FieldName, value: string): Promise<void> {
    await this.openPad(name)
    await this.pressKeys(name, ...value.replace(/\D/g, ''))
    await this.padKey(name, 'Confirm value').click()
    await expect.element(this.pad(name)).not.toBeInTheDocument()
  }

  async fill(values: { distance?: string; time?: string; rate?: string }): Promise<void> {
    for (const name of ['distance', 'time', 'rate'] as const) {
      const value = values[name]
      if (value !== undefined) await this.enter(name, value)
    }
  }

  async submit(): Promise<void> {
    await this.save.click()
  }

  readonly expectOpen = vi.defineHelper(async (name: 'Log a row' | 'Log this session') => {
    await expect.element(this.dialog(name)).toBeVisible()
  })

  readonly expectClosed = vi.defineHelper(async (): Promise<void> => {
    await expect.element(this.anyDialog).not.toBeInTheDocument()
  })

  /** The live readout — the split and power the two fields work out to. */
  readonly expectResult = vi.defineHelper(async (text: string): Promise<void> => {
    await expect.element(page.getByText(text)).toBeVisible()
  })

  /** What a field reads as, pad closed. */
  readonly expectValue = vi.defineHelper(async (name: FieldName, value: string): Promise<void> => {
    await expect.element(this.field(name)).toHaveTextContent(value)
  })

  /** What the pad is showing mid-entry, transient states included. */
  readonly expectDraft = vi.defineHelper(async (name: FieldName, value: string): Promise<void> => {
    await expect
      .element(this.pad(name).getByRole('status', { name: 'Current value' }))
      .toHaveTextContent(value)
  })

  readonly expectPrefilledDistance = vi.defineHelper(async (value: string): Promise<void> => {
    await expect.element(this.distance).toHaveTextContent(value)
  })

  readonly expectSaveDisabled = vi.defineHelper(async (): Promise<void> => {
    await expect.element(this.save).toBeDisabled()
  })
}
