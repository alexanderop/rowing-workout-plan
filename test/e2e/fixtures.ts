import { test as base, createBdd } from 'playwright-bdd'
import { NotesPage } from './pages/notesPage'

/**
 * The page objects, handed to steps as fixtures — a step declares the screen
 * it drives (`async ({ notes }) => …`) instead of constructing one.
 *
 * playwright-bdd generates the spec files, so it has to know which `test`
 * they should import. It finds this one by scanning the files matched by the
 * `steps` pattern in playwright.config.ts for an exported test instance —
 * which is why this file is listed there alongside `steps/`.
 */
export const test = base.extend<{ notes: NotesPage }>({
  notes: async ({ page }, use) => {
    await use(new NotesPage(page))
  },
})

export const { Given, When, Then, After } = createBdd(test)
