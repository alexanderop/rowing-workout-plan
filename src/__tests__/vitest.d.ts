import 'vitest'

/**
 * The tags defined in `vitest.config.ts`, as a type. Vitest already rejects an
 * undefined tag at runtime (`strictTags` defaults to on); this makes the same
 * mistake a compile error, and gives the editor the list.
 *
 * Adding a tag means adding it in both places — see docs/vitest-practices.md
 * for what earns one.
 */
declare module 'vitest' {
  interface TestTags {
    tags: 'flaky'
  }
}
