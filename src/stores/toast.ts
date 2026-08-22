import { Atom, useAtom } from '@effect/atom-vue'
import { reactive } from 'vue'

type ToastMessage = {
  id: string
  message: string
}

const DEFAULT_TOAST_DURATION_MS = 3000

/**
 * Shared state lives in an atom, not in module-scoped refs: the value is
 * held by the atom registry, so browser tests get a clean slate by providing
 * a fresh registry (see renderApp) instead of calling `$reset()` on every
 * store. MoleculeToastViewport.vue is mounted for the app's lifetime, which is what
 * keeps the atom alive between subscribers elsewhere.
 */
const toastsAtom = Atom.make<ReadonlyArray<ToastMessage>>([])

/**
 * Lightweight global toast store for ephemeral confirmation messages,
 * rendered by MoleculeToastViewport.vue (mounted once in App.vue).
 *
 * Use this for "never-silent" confirmations after an action that has no
 * other visible feedback (e.g. saving from a sheet that then closes itself).
 */
export function useToastStore() {
  const [toasts, setToasts] = useAtom(() => toastsAtom)

  function showToast(message: string, durationMs = DEFAULT_TOAST_DURATION_MS): void {
    const id = crypto.randomUUID()
    setToasts((current) => [...current, { id, message }])

    setTimeout(() => {
      dismissToast(id)
    }, durationMs)
  }

  function dismissToast(id: string): void {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }

  return reactive({
    toasts,
    showToast,
    dismissToast,
  })
}
