import { AtomRegistry, registryKey } from '@effect/atom-vue'
import { createApp } from 'vue'
import App from './App.vue'
import { i18n } from './i18n'
import { requestPersistentStorage } from './lib/persistentStorage'
import { reportWebVitals } from './lib/webVitals'
import { createAppRouter } from './router'
import './style.css'

const app = createApp(App)

// One atom registry per app instance: every atom's state — the notes list,
// toasts, the quick-add sheet — lives here, not in module scope. Providing
// it explicitly (rather than leaning on the library's global default) is
// what lets tests hand each render its own registry and start clean.
app.provide(registryKey, AtomRegistry.make())

// Surface runtime errors that would otherwise fail silently as a blank #app.
app.config.errorHandler = (error, _instance, info) => {
  console.error('[Vue error]', error, info)
}

// Backstop for defects that escape a promise nobody returned to Vue — the
// errorHandler above only sees rejections of promises handed back from event
// handlers and lifecycle hooks. An Effect defect surfacing here means a bug
// (every expected failure is caught by tag before `dbMutation`/`runDb`
// accept a program), so it must land in the console, not vanish.
window.addEventListener('unhandledrejection', (event) => {
  console.error('[Unhandled rejection]', event.reason)
})

app.use(i18n)
app.use(createAppRouter())

app.mount('#app')

reportWebVitals()

// IndexedDB holds the only copy of the user's data — ask the browser not to
// evict it. Fire-and-forget: the answer never gates the UI.
void requestPersistentStorage()
