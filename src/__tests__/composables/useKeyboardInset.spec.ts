import { expect, vi } from 'vitest'
import { useKeyboardInset } from '@/composables/useKeyboardInset'
import { it as base } from '../fixtures'

/**
 * visualViewport is a browser API and its properties are read-only, so it is
 * stubbed here — a system boundary, which is the one thing these tests mock.
 */
class FakeVisualViewport extends EventTarget {
  height = window.innerHeight
  offsetTop = 0
  scale = 1
}

/**
 * The harness for this file: a fake viewport in place of the real one, and the
 * CSS variable put back afterwards. The variable needs a teardown of its own
 * because the composable writes it to `<html>` and does not remove it on
 * unmount — correct for an app that owns the document for its whole life, and
 * a leak between tests that share one.
 *
 * `unstubGlobals` in vitest.config.ts restores the global itself.
 */
const it = base.extend('viewport', async ({}, { onCleanup }) => {
  const viewport = new FakeVisualViewport()
  vi.stubGlobal('visualViewport', viewport)
  onCleanup(() => {
    document.documentElement.style.removeProperty('--keyboard-inset')
  })
  return viewport
})

function readInset(): string {
  return document.documentElement.style.getPropertyValue('--keyboard-inset')
}

it('reports the keyboard height on resize', ({ viewport, mountComposable }) => {
  const { result } = mountComposable(() => useKeyboardInset())
  expect(result.inset.value).toBe(0)

  viewport.height = window.innerHeight - 300
  viewport.dispatchEvent(new Event('resize'))

  expect(result.inset.value).toBe(300)
  // The ref is the API, but the CSS variable is what sheets actually position
  // against — so the one assertion that reads `<html>` stays here, on the
  // reading that matters.
  expect(readInset()).toBe('300px')
})

it('follows offsetTop changes that only fire a scroll event', ({ viewport, mountComposable }) => {
  const { result } = mountComposable(() => useKeyboardInset())

  // iOS pans the visual viewport when the keyboard opens: offsetTop moves
  // without a resize ever firing.
  viewport.height = window.innerHeight - 250
  viewport.offsetTop = 50
  viewport.dispatchEvent(new Event('scroll'))

  expect(result.inset.value).toBe(200)
})

it('treats a pinch-zoomed viewport as having no keyboard', ({ viewport, mountComposable }) => {
  const { result } = mountComposable(() => useKeyboardInset())

  // Zooming shrinks the visual viewport exactly like a keyboard would.
  viewport.scale = 2
  viewport.height = window.innerHeight / 2
  viewport.dispatchEvent(new Event('resize'))

  expect(result.inset.value).toBe(0)
})

/**
 * The `isSupported` half of the contract in docs/composables.md: the whole
 * shape comes back on a browser that cannot do this, rather than a different
 * one a destructuring caller would have to know about.
 */
it('stays inert where there is no visual viewport to measure', ({ mountComposable }) => {
  // Not the `viewport` fixture: the point is that there is nothing to stub in.
  vi.stubGlobal('visualViewport', undefined)

  const { result } = mountComposable(() => useKeyboardInset())

  expect(result.isSupported.value).toBe(false)
  expect(result.inset.value).toBe(0)
  // Never written at all, so sheets fall through to `var(--keyboard-inset, 0px)`.
  expect(readInset()).toBe('')
})

/**
 * The half that only exists inside a component instance, and the reason this
 * file mounts rather than calling the composable directly.
 *
 * `useEventListener` registers its `removeEventListener` with the active
 * effect scope. Called bare there is no scope, the registration is a silent
 * no-op, and the listener outlives whatever asked for it — while every test
 * above still passes, because subscribing worked fine. This is the only test
 * in the file that can tell the two apart.
 */
it('stops following the viewport once its component goes away', ({ viewport, mountComposable }) => {
  const { unmount } = mountComposable(() => useKeyboardInset())

  unmount()
  viewport.height = window.innerHeight - 300
  viewport.dispatchEvent(new Event('resize'))

  expect(readInset()).toBe('0px')
})
