import { describe } from 'vitest'
import { it } from '../fixtures'

describe('app version in settings', () => {
  it('shows the provenance of the running build', async ({ settings }) => {
    await settings.expectVersion({
      version: '0.1.0',
      commit: '0123456789ab',
      buildTime: '2026-01-01T12:00:00.000Z',
    })
  })
})
