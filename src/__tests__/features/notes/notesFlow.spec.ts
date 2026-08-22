import { Effect } from 'effect'
import { describe, expect } from 'vitest'
import { listNotes, runDb } from '@/db'
import { it } from '../../fixtures'

/** What actually reached IndexedDB — the screen object stops at the UI. */
const storedNotes = () => runDb(listNotes.pipe(Effect.orDie))

describe('notes quick-add flow', () => {
  it('creates a note through the center FAB and persists it', async ({ notes }) => {
    await notes.expectNoNotes()

    await notes.addNote({ title: 'Buy milk', body: '2 liters, oat' })

    // Visible in the list, confirmed by toast, and actually in IndexedDB.
    await notes.expectNote('Buy milk')
    await notes.expectToast('Note saved')
    expect(await storedNotes()).toMatchObject([{ title: 'Buy milk', body: '2 liters, oat' }])
  })

  it('deletes a note from its card action', async ({ notes }) => {
    await notes.addNote({ title: 'Temporary' })
    await notes.expectNote('Temporary')

    await notes.deleteNote('Temporary')

    await notes.expectNoNotes()
    expect(await storedNotes()).toHaveLength(0)
  })

  /**
   * A title-less draft, refused — pressed rather than read.
   *
   * Two assertions because two different things are being claimed, and a
   * mutation check is what separated them. The state assertion pins the
   * binding: dropping `:disabled="!canSave"` leaves this test green without
   * it, because `save()` carries the same rule a second time and the write
   * never happens either way. The forced press pins that the platform
   * *honours* the state — the jsdom-era spelling of this could not, since a
   * test framework's `trigger('click')` short-circuits on a disabled control
   * itself and so grades its own guard rather than the browser's.
   *
   * `force: true` is what makes the press writable: it skips the
   * actionability *wait*, not the gesture, so Chromium still delivers a real
   * `pointerdown` and then declines to follow it with a click. A plain
   * `.click()` would instead sit in "wait for enabled" until `actionTimeout`
   * and fail for a reason that has nothing to do with the contract.
   */
  it('refuses to save a draft with no title', async ({ notes }) => {
    await notes.openQuickAdd()
    await notes.quickAdd.fill({ body: 'a body, but no title' })

    await expect.element(notes.quickAdd.saveButton).toBeDisabled()

    await notes.quickAdd.pressSaveIgnoringDisabled()

    // The sheet is still open and usable, and nothing reached IndexedDB.
    await notes.quickAdd.expectReady()
    expect(await storedNotes()).toHaveLength(0)
  })

  it('keeps the draft when the sheet is dismissed by accident', async ({ notes }) => {
    await notes.openQuickAdd()
    await notes.quickAdd.fill({ title: 'Half typed', body: '…and a body' })
    await notes.quickAdd.dismiss()

    await notes.openQuickAdd()
    await notes.quickAdd.expectDraft({ title: 'Half typed', body: '…and a body' })
  })

  it('starts from an empty draft after a successful save', async ({ notes }) => {
    await notes.addNote({ title: 'Saved and gone' })
    await notes.expectNote('Saved and gone')

    await notes.openQuickAdd()

    await notes.quickAdd.expectDraft({ title: '' })
  })

  // Tagged `flaky`: the test deliberately races two submits against a write
  // that has not resolved, so a loaded CI runner can lose the race for
  // reasons that are not the bug it guards. The tag carries the CI-only
  // retry (see `tags` in vitest.config.ts) — the point is that the retry
  // lives with the category, not copied onto this one test.
  it(
    'creates a single note when the form is submitted twice in a row',
    { tags: ['flaky'] },
    async ({ notes }) => {
      await notes.openQuickAdd()
      await notes.quickAdd.fill({ title: 'Only once' })
      notes.quickAdd.submitTwiceInOneTick()

      await expect.poll(async () => (await storedNotes()).length).toBe(1)
      await notes.expectNote('Only once')
    },
  )

  it('pins a note so it sorts first', async ({ notes }) => {
    await notes.addNote({ title: 'First' })
    await notes.addNote({ title: 'Second' })

    await notes.pinNote('First')

    await notes.expectPinned('First')
    await notes.expectOrder(['First', 'Second'])
  })
})
