import { expect, vi } from 'vitest'
import type { Locator } from 'vitest/browser'
import { page, userEvent } from 'vitest/browser'

/**
 * The 2k entry sheet (`features/training/components/BenchmarkSheet.vue`).
 *
 * Its own object rather than methods on `PlansScreen`, mirroring the
 * component that renders it: the sheet is portalled outside the screen's
 * subtree, and it is opened from two different places on that screen.
 */
export class BenchmarkSheet {
  get dialog(): Locator {
    return page.getByRole('dialog', { name: 'Your 2k time' })
  }

  get field(): Locator {
    return page.getByRole('textbox', { name: '2k time' })
  }

  get save(): Locator {
    return page.getByRole('button', { name: 'Save' })
  }

  /** Replace whatever is in the field — the sheet prefills, so this clears first. */
  async type(time: string): Promise<void> {
    await this.field.clear()
    await userEvent.type(this.field, time)
  }

  async submit(): Promise<void> {
    await this.save.click()
  }

  readonly expectOpen = vi.defineHelper(async (): Promise<void> => {
    await expect.element(this.dialog).toBeVisible()
  })

  readonly expectClosed = vi.defineHelper(async (): Promise<void> => {
    await expect.element(this.dialog).not.toBeInTheDocument()
  })

  /** The live echo of what the entered time means per 500 m. */
  readonly expectPace = vi.defineHelper(async (split: string): Promise<void> => {
    await expect.element(page.getByText(`That is ${split} per 500 m.`)).toBeVisible()
  })

  readonly expectPrefilled = vi.defineHelper(async (time: string): Promise<void> => {
    await expect.element(this.field).toHaveValue(time)
  })

  readonly expectSaveDisabled = vi.defineHelper(async (): Promise<void> => {
    await expect.element(this.save).toBeDisabled()
  })
}
