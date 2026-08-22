/**
 * A stand-in for Chromium's `beforeinstallprompt`.
 *
 * The real event cannot be provoked from a test: the browser fires it on its
 * own schedule, only for an origin it considers installable, and never at all
 * in a headless run. Since `useInstallPrompt` treats the event as an opaque
 * handle — stash it, call `prompt()`, await `userChoice` — a fabricated one
 * exercises the whole path, and the stub is what lets a spec assert that the
 * button actually reached `prompt()` rather than only that it rendered.
 *
 * Lives in a helper rather than a screen object because dispatching a window
 * event is driving the browser, not the UI.
 */
export interface StubbedInstallPrompt {
  /** How many times the app called `prompt()` on the event. */
  promptCalls: () => number
}

export function stubInstallPromptAvailable(
  outcome: 'accepted' | 'dismissed' = 'accepted',
): StubbedInstallPrompt {
  let promptCalls = 0

  // `cancelable`, because the composable calls preventDefault() on it — an
  // uncancelable event would make that a silent no-op and hide a regression
  // in the part that suppresses Chromium's own infobar.
  const event = new Event('beforeinstallprompt', { cancelable: true })

  Object.assign(event, {
    platforms: ['web'],
    userChoice: Promise.resolve({ outcome, platform: 'web' }),
    prompt: (): Promise<void> => {
      promptCalls += 1
      return Promise.resolve()
    },
  })

  window.dispatchEvent(event)

  return { promptCalls: () => promptCalls }
}
