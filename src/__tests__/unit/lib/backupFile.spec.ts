import { describe, expect, it } from 'vitest'
import { BackupFileError, backupFilename } from '@/lib/backupFile'

describe('backupFilename', () => {
  it('stamps the file with the export date', () => {
    expect(backupFilename('2026-08-07T12:34:56.789Z')).toBe(
      'vue-pwa-starter-backup-2026-08-07.json',
    )
  })

  it('keeps only the date, never the time', () => {
    expect(backupFilename('2024-01-01T23:59:59.999Z')).not.toContain(':')
  })

  it('drops a timestamp that is not an ISO date rather than putting it in the name', () => {
    expect(backupFilename('yesterday')).toBe('vue-pwa-starter-backup.json')
    expect(backupFilename('')).toBe('vue-pwa-starter-backup.json')
  })

  it('never lets a hand-edited payload write a path into the filename', () => {
    expect(backupFilename('../../../etc/passwd')).toBe('vue-pwa-starter-backup.json')
  })

  it('requires the date at the very start, not just somewhere in the string', () => {
    // Unanchored, the pattern finds the date inside the junk and names the
    // file after it — which is trusting exactly the input this guard exists to
    // distrust.
    expect(backupFilename('junk 2026-08-07')).toBe('vue-pwa-starter-backup.json')
  })
})

/**
 * The tag and the fields are the error's public surface, not implementation
 * detail: `SettingsView.vue` matches this `_tag` in an exhaustive
 * `Effect.catchTags`, and `operation` is what the annotated log record and the
 * toast are built from. Renaming either is a breaking change to a caller the
 * type system cannot point at, so it is pinned here.
 */
describe('BackupFileError', () => {
  it('carries the tag and the operation a caller matches and reports on', () => {
    const error = new BackupFileError({
      operation: 'read backup file',
      cause: new Error('unreadable'),
    })

    expect(error._tag).toBe('BackupFile.BackupFileError')
    expect(error.operation).toBe('read backup file')
    expect(Object.keys(BackupFileError.fields).sort()).toEqual(['_tag', 'cause', 'operation'])
  })
})
