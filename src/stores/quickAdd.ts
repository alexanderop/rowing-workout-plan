import { Atom, useAtom } from '@effect/atom-vue'
import { computed, reactive } from 'vue'

/**
 * Global state for the quick-add bottom sheet opened from the nav's center
 * "+" button. Lives here (not in view-local state) because the trigger sits
 * in OrganismAppShell's center-action slot while the sheet itself is mounted
 * once in App.vue, outside any route view.
 *
 * The state is held in atoms, so it lives in the atom registry: App.vue is
 * always mounted and keeps them alive, and browser tests reset by providing
 * a fresh registry rather than calling `$reset()`.
 */
const isOpenAtom = Atom.make(false)
// Stays true after the first open so App.vue can defer mounting the sheet
// (and its dialog machinery) until it's actually needed, keeping app
// startup lean.
const hasOpenedAtom = Atom.make(false)

export function useQuickAddStore() {
  const [isOpenValue, setIsOpen] = useAtom(() => isOpenAtom)
  const [hasOpened, setHasOpened] = useAtom(() => hasOpenedAtom)

  // Writable computed rather than the read-only atom ref, because App.vue
  // two-way binds it (`v-model:open`) — writes must go through the registry,
  // not into the subscription's local ref.
  const isOpen = computed({
    get: () => isOpenValue.value,
    set: (value: boolean) => setIsOpen(value),
  })

  function open(): void {
    setIsOpen(true)
    setHasOpened(true)
  }

  function close(): void {
    setIsOpen(false)
  }

  return reactive({
    isOpen,
    hasOpened,
    open,
    close,
  })
}
