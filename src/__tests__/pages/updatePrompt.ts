import { expect, vi } from 'vitest'
import type { Locator } from 'vitest/browser'
import { page } from 'vitest/browser'

/**
 * The "update available" banner (`PwaUpdatePrompt.vue`).
 *
 * Owned by `AppScreen` alongside `InstallPrompt`, and for the same reason:
 * App.vue mounts it app-wide, so it is reachable from whichever screen the
 * user is on when a new build lands.
 *
 * The banner only appears once `stubUpdateAvailable()` has raised
 * `needRefresh` — see `helpers/pwaUpdate.ts` for why that is a stub rather
 * than a real service-worker swap.
 */
export class UpdatePrompt {
  get banner(): Locator {
    return page.getByText('A new version is available')
  }

  get reloadButton(): Locator {
    return page.getByRole('button', { name: 'Reload' })
  }

  get dismissButton(): Locator {
    return page.getByRole('button', { name: 'Dismiss update notice' })
  }

  async dismiss(): Promise<void> {
    await this.dismissButton.click()
    await this.expectHidden()
  }

  readonly expectVisible = vi.defineHelper(async (): Promise<void> => {
    await expect.element(this.banner).toBeVisible()
  })

  readonly expectHidden = vi.defineHelper(async (): Promise<void> => {
    await expect.element(this.banner).not.toBeInTheDocument()
  })
}
