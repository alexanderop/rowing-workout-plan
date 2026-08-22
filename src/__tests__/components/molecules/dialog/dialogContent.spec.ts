import { page } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { describe, expect } from 'vitest'
import { defineComponent, h } from 'vue'
import {
  MoleculeDialog,
  MoleculeDialogContent,
  MoleculeDialogDescription,
  MoleculeDialogTitle,
} from '@/components/molecules/dialog'
import { i18n } from '@/i18n'
import { it as base } from '../../../fixtures'

/** A sheet with more content than a keyboard-shrunk viewport can show. */
const Harness = defineComponent({
  render: () =>
    h(MoleculeDialog, { open: true, modal: false }, () => [
      h(MoleculeDialogContent, null, () => [
        h(MoleculeDialogTitle, () => 'Tall sheet'),
        h(MoleculeDialogDescription, () => 'Scroll me'),
        ...Array.from({ length: 30 }, (_, index) => h('p', `line ${index}`)),
        h('button', { type: 'button' }, 'Save'),
      ]),
    ]),
})

/**
 * The sheet under a keyboard, as a fixture: set the inset, mount the harness,
 * and put both back afterwards. `--keyboard-inset` is a property on
 * `documentElement`, so leaking it would change how every later test in the
 * file lays out — the kind of teardown that is easy to forget in an
 * `afterEach` and impossible to forget in the fixture that set it.
 */
const it = base.extend('tallSheet', async ({}, { onCleanup }) => {
  // Leave the sheet ~200px tall, roughly a landscape phone with the
  // on-screen keyboard open.
  const inset = Math.max(0, window.innerHeight - 200)
  document.documentElement.style.setProperty('--keyboard-inset', `${inset}px`)

  const mounted = render(Harness, { global: { plugins: [i18n] } })
  onCleanup(async () => {
    await mounted.unmount()
    document.documentElement.style.removeProperty('--keyboard-inset')
  })

  return {
    get body(): HTMLElement {
      const body = document.querySelector('[data-slot="dialog-body"]')
      if (!(body instanceof HTMLElement)) throw new Error('dialog body not found')
      return body
    },
    get sheet(): HTMLElement {
      const sheet = document.querySelector('[data-slot="dialog-content"]')
      if (!(sheet instanceof HTMLElement)) throw new Error('dialog content not found')
      return sheet
    },
    submit: page.getByRole('button', { name: 'Save' }),
  }
})

describe('MoleculeDialogContent', () => {
  it('scrolls its content when the keyboard shrinks the viewport', async ({ tallSheet }) => {
    await expect.element(page.getByText('Tall sheet')).toBeVisible()

    const { body, submit } = tallSheet
    expect(body.scrollHeight).toBeGreaterThan(body.clientHeight)

    // `toBeVisible` is not the assertion this test needs: the submit button
    // is clipped by the sheet's scroll region, not hidden, so it passes
    // either way. `toBeInViewport` (Vitest 4.0) measures the intersection
    // through the ancestor chain, which is what "unreachable" actually means
    // here — and what makes the scroll below prove something.
    await expect.element(submit).not.toBeInViewport()

    // Scrolling to the end brings the submit button into view — without a
    // scroll region it would be clipped by the sheet and unreachable.
    body.scrollTop = body.scrollHeight
    await expect.element(submit).toBeInViewport()
  })

  /**
   * The gap a user perceives, not the property that produces it — so this
   * survives someone swapping the padding for a spacer element, and it names
   * the bug rather than the declaration (docs/testing-strategy.md forbids
   * asserting on class strings).
   */
  it('keeps its last control clear of the bottom edge with no home indicator', async ({
    tallSheet,
  }) => {
    const { body, sheet, submit } = tallSheet

    body.scrollTop = body.scrollHeight
    await expect.element(submit).toBeInViewport()

    // env(safe-area-inset-bottom) is 0 in this browser, exactly as on a
    // flat-bottomed phone — which is the case the clamp exists for. A bare
    // env() here collapses the sheet's padding to nothing.
    const gap =
      sheet.getBoundingClientRect().bottom - submit.element().getBoundingClientRect().bottom

    expect(
      gap,
      "the sheet's last control is flush against its bottom edge — safe-area-bottom is writing a bare env(), which resolves to 0px on hardware with no home indicator",
    ).toBeGreaterThanOrEqual(24)
  })
})
