import type { VNode } from 'vue'
import type { Router } from 'vue-router'
import { NotebookPen, Settings } from '@lucide/vue'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { describe, expect } from 'vitest'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import OrganismAppShell from '@/components/organisms/OrganismAppShell.vue'
import { i18n } from '@/i18n'
import type { NavItem } from '@/types/navigation'
import { it as base } from '../../fixtures'

const Stub = defineComponent({ render: () => h('div', 'stub view') })

/** Mirrors OrganismAppShell's own `defineSlots`, so a renamed slot fails here too. */
type ShellSlots = { default: () => VNode; 'center-action'?: () => VNode }

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: Stub },
      { path: '/second', name: 'second', component: Stub },
      { path: '/focus', name: 'focus', component: Stub, meta: { hideNav: true } },
    ],
  })
}

const items: Array<NavItem> = [
  { routeName: 'home', icon: NotebookPen, label: 'Home' },
  { routeName: 'second', icon: Settings, label: 'Second' },
]

/**
 * This spec drives the shell in isolation — stub routes, no app, no database
 * — so its harness is a fixture here rather than a screen object in
 * `../pages`. Extending the shared `it` keeps one import for every spec; the
 * app-level fixtures it carries are lazy, so naming only `renderShell` never
 * mounts them.
 */
const it = base.extend('renderShell', async ({}, { onCleanup }) => {
  let mounted: { unmount: () => Promise<void> } | undefined
  onCleanup(async () => {
    await mounted?.unmount()
  })

  return async (initialPath: string, withCenterAction = false): Promise<{ router: Router }> => {
    const router = makeRouter()
    await router.push(initialPath)
    await router.isReady()

    // The center-action slot is filled or absent, never present-and-empty:
    // OrganismAppShell branches on `$slots['center-action']`, so an empty function
    // would test the wrong side of that branch.
    const slots: ShellSlots = { default: () => h('div', 'page content') }
    if (withCenterAction) {
      slots['center-action'] = () => h('button', { type: 'button' }, 'center')
    }

    mounted = render(OrganismAppShell, {
      props: { items },
      slots,
      global: { plugins: [i18n, router] },
    })

    return { router }
  }
})

describe('OrganismAppShell', () => {
  it('renders the tabs and marks the active route with aria-current', async ({ renderShell }) => {
    await renderShell('/')

    await expect
      .element(page.getByRole('button', { name: 'Home' }))
      .toHaveAttribute('aria-current', 'page')
    await expect
      .element(page.getByRole('button', { name: 'Second' }))
      .not.toHaveAttribute('aria-current')
  })

  it('navigates when a tab is tapped', async ({ renderShell }) => {
    const { router } = await renderShell('/')

    await page.getByRole('button', { name: 'Second' }).click()

    await expect.poll(() => router.currentRoute.value.name).toBe('second')
  })

  it('hides the tab bar on routes with meta.hideNav', async ({ renderShell }) => {
    await renderShell('/focus')

    await expect.element(page.getByText('page content')).toBeVisible()
    expect(page.getByRole('navigation').query()).toBeNull()
  })

  it('renders the center action between the split tab halves', async ({ renderShell }) => {
    await renderShell('/', true)

    const nav = page.getByRole('navigation')
    await expect.element(nav.getByRole('button', { name: 'center' })).toBeVisible()

    // One tab on each side of the center action.
    const buttons = await nav.getByRole('button').all()
    expect(buttons.map((button) => button.element().textContent?.trim())).toEqual([
      'Home',
      'center',
      'Second',
    ])
  })
})
