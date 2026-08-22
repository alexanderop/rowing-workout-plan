import { AtomRegistry, registryKey } from '@effect/atom-vue'
import { render } from 'vitest-browser-vue'
import { createMemoryHistory } from 'vue-router'
import App from '@/App.vue'
import { i18n } from '@/i18n'
import { createAppRouter } from '@/router'

/**
 * Mounts the full app (shell, router, i18n) the way main.ts does, but with
 * memory history so tests don't fight over the page URL — and with a fresh
 * atom registry per render, so no atom state (toasts, and every read atom a
 * screen subscribes to) leaks from one test into the next. IndexedDB is the
 * one thing a registry cannot isolate; resetAppState still clears it.
 */
export async function renderApp(initialPath = '/') {
  const router = createAppRouter(createMemoryHistory())
  await router.push(initialPath)
  await router.isReady()

  const screen = render(App, {
    global: {
      plugins: [i18n, router],
      provide: {
        // SAFETY: `registryKey` is an InjectionKey<AtomRegistry>, which is a
        // branded symbol — `provide`'s index signature takes the symbol, and
        // the assertion only strips the phantom type parameter off it.
        [registryKey as symbol]: AtomRegistry.make(),
      },
    },
  })

  return {
    screen,
    container: screen.container,
    router,
    cleanup: (): void => {
      void screen.unmount()
    },
  }
}
