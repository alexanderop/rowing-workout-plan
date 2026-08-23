import { expect, vi } from 'vitest'
import type { Locator } from 'vitest/browser'
import { page, userEvent } from 'vitest/browser'

/**
 * The sheet that types a workout in off the monitor
 * (`features/training/components/LogWorkoutSheet.vue`).
 *
 * Its own object, mirroring the component: it is portalled outside whichever
 * screen opened it, and three screens open it.
 */
export class LogWorkoutSheet {
  /** Titled for what it is logging — a free row, or a session the plan set. */
  dialog(name: 'Log a row' | 'Log this session'): Locator {
    return page.getByRole('dialog', { name })
  }

  get anyDialog(): Locator {
    return page.getByRole('dialog')
  }

  get distance(): Locator {
    return page.getByRole('textbox', { name: 'Distance in metres' })
  }

  get time(): Locator {
    return page.getByRole('textbox', { name: 'Time' })
  }

  get rate(): Locator {
    return page.getByRole('textbox', { name: /^Rate in strokes per minute/ })
  }

  get save(): Locator {
    return page.getByRole('button', { name: 'Save' })
  }

  get timePad(): Locator {
    return page.getByRole('group', { name: 'Number pad for Time' })
  }

  timeKey(key: string): Locator {
    return this.timePad.getByRole('button', { name: key })
  }

  /** Replace a field's contents — the sheet prefills, so this clears first. */
  private async retype(field: Locator, value: string): Promise<void> {
    await field.clear()
    if (value !== '') await userEvent.type(field, value)
  }

  async fill(values: { distance?: string; time?: string; rate?: string }): Promise<void> {
    if (values.distance !== undefined) await this.retype(this.distance, values.distance)
    if (values.time !== undefined) await this.retype(this.time, values.time)
    if (values.rate !== undefined) await this.retype(this.rate, values.rate)
  }

  async submit(): Promise<void> {
    await this.save.click()
  }

  async openTimePad(): Promise<void> {
    await this.time.click()
    await expect.element(this.timePad).toBeVisible()
  }

  async pressTimeKeys(...keys: Array<string>): Promise<void> {
    for (const key of keys) await this.timeKey(key).click()
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

  readonly expectPrefilledDistance = vi.defineHelper(async (value: string): Promise<void> => {
    await expect.element(this.distance).toHaveValue(value)
  })

  readonly expectSaveDisabled = vi.defineHelper(async (): Promise<void> => {
    await expect.element(this.save).toBeDisabled()
  })

  readonly expectTime = vi.defineHelper(async (value: string): Promise<void> => {
    await expect.element(this.time).toHaveValue(value)
  })

  readonly expectTimePadAbsent = vi.defineHelper(async (): Promise<void> => {
    await expect.element(this.timePad).not.toBeInTheDocument()
  })
}
