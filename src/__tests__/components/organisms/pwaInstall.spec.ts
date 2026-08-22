import { describe, expect } from 'vitest'
import { it } from '../../fixtures'
import { INSTALL_HINT_STORAGE_KEY } from '@/composables/useInstallPrompt'
import { stubInstallPromptAvailable } from '../../helpers/installEvent'

/**
 * The install hint, driven the way the browser drives it: a
 * `beforeinstallprompt` event arrives (or does not), and everything else
 * follows from that. See helpers/installEvent.ts for why the event is stubbed.
 *
 * Chromium in a headless test run never fires the real event and never
 * matches `display-mode: standalone`, so "not installed, no prompt offered"
 * is the ambient state of every test here — which is exactly the case the
 * first one pins.
 */
describe('install hint', () => {
  it('stays away when the browser never offers an install', async ({ settings }) => {
    // No event dispatched. A banner here would be a promise the app cannot
    // keep: there is nothing to prompt with and no instructions that fit.
    await settings.install.expectNeverAppears()
  })

  it('appears once the browser says the app is installable', async ({ settings }) => {
    stubInstallPromptAvailable()

    await settings.install.expectVisible()
  })

  it('hands the deferred event back to the browser when the user accepts', async ({ settings }) => {
    const stub = stubInstallPromptAvailable('accepted')
    await settings.install.expectVisible()

    await settings.install.openDialog()
    await settings.install.confirmInstall()

    // The point of stashing the event: the app, not Chromium's infobar, is
    // what ends up triggering the real install dialog.
    await expect.poll(() => stub.promptCalls()).toBe(1)
  })

  it('closes itself for good once the install is accepted', async ({ settings }) => {
    stubInstallPromptAvailable('accepted')
    await settings.install.expectVisible()

    await settings.install.openDialog()
    await settings.install.confirmInstall()

    await settings.install.expectDialogClosed()
    await settings.install.expectHidden()
  })

  it('keeps the dialog open when the user backs out of the browser prompt', async ({
    settings,
  }) => {
    stubInstallPromptAvailable('dismissed')
    await settings.install.expectVisible()

    await settings.install.openDialog()
    await settings.install.confirmInstall()

    // Declining Chromium's dialog is not declining ours — the user may have
    // mis-tapped, and the steps are still what they came for.
    await settings.install.expectDialogOpen()
  })

  it('remembers "Not now" past a reload', async ({ settings }) => {
    stubInstallPromptAvailable()
    await settings.install.expectVisible()

    await settings.install.dismiss()

    // Asserting the persisted flag, not just the hidden banner: a dismissal
    // that only lives in memory would come back on the next launch, which is
    // the behaviour this feature exists to avoid.
    expect(localStorage.getItem(INSTALL_HINT_STORAGE_KEY)).toBe('true')
  })

  it('offers a way back in from settings after a dismissal', async ({ settings }) => {
    stubInstallPromptAvailable()
    await settings.install.expectVisible()
    await settings.install.dismiss()

    // A dismissal is persisted forever, so without this row the install path
    // would be a one-time offer the user could lose by mis-tapping.
    await settings.openInstallDialog()
  })
})
