// Browser-tier setup. fake-indexeddb replaces the page's IndexedDB with an
// in-memory implementation: faster, and guaranteed-fresh per test file. The
// e2e tier (test/e2e) runs against the real IndexedDB instead.
import 'fake-indexeddb/auto'
import '@/style.css'
import 'vitest-browser-vue'
import { installConsoleGate } from './helpers/consoleGate'

// Turns Vue's silent warnings (missing props, bad v-model targets, duplicate
// v-for keys) into failures. See the helper for the allowlist and why it is
// installed here rather than per spec.
installConsoleGate()
