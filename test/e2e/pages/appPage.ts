import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * Page objects: the e2e tier's DSL, and the counterpart of the screen
 * objects in `src/__tests__/pages/` — same vocabulary (`open`, `reload`,
 * `expectShellVisible`), different driver. A Gherkin step is then one line
 * that names the intent, and the locator behind it exists once.
 *
 * Steps stay declarative on purpose: a step that spells out its own
 * `getByRole(...)` is a step you have to read to know what it proves, and a
 * `.feature` file is meant to be readable by someone who never opens one.
 *
 * `AppPage` holds what is true of the shipped app on any route — the shell,
 * the document, the service worker, the network. Per-screen objects extend
 * it.
 */
export abstract class AppPage {
  constructor(protected readonly page: Page) {}

  async open(path = '/'): Promise<void> {
    await this.page.goto(path)
  }

  async reload(): Promise<void> {
    await this.page.reload()
  }

  async goOffline(): Promise<void> {
    await this.page.context().setOffline(true)
  }

  async goOnline(): Promise<void> {
    await this.page.context().setOffline(false)
  }

  get shell(): Locator {
    return this.page.getByRole('navigation')
  }

  /**
   * Registration is `prompt` (vite.config.ts), which deliberately leaves out
   * clientsClaim: the first load installs the worker but is not controlled
   * by it. Wait for the install to finish precaching, then reload to hand
   * the page over. Without this, an offline reload races the install and
   * hits a dead network instead of the cache.
   */
  async waitForServiceWorkerControl(): Promise<void> {
    await this.page.evaluate(async () => {
      await navigator.serviceWorker.ready
    })
    await this.reload()
    await this.page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  }

  async expectShellVisible(): Promise<void> {
    await expect(this.shell).toBeVisible()
  }

  /**
   * With the network cut, a reload only produced a document at all because
   * the worker answered the navigation out of its precache.
   */
  async expectServedByServiceWorker(): Promise<void> {
    await expect
      .poll(() => this.page.evaluate(() => navigator.serviceWorker.controller !== null))
      .toBe(true)
  }

  /** index.html itself — the one page the browser-tier axe sweeps cannot see. */
  async expectDocumentAnnounced(): Promise<void> {
    await expect(this.page).toHaveTitle(/\S/)
    await expect(this.page.locator('html')).toHaveAttribute('lang', /^[a-z]{2}(-[A-Za-z]+)*$/)
  }
}
