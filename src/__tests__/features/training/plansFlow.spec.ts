import { describe, expect } from 'vitest'
import { Effect } from 'effect'
import { it } from '../../fixtures'
import { listBenchmarks, listEnrolments, runDb } from '@/db'

/**
 * Onboarding and the plans browser, through the real UI and against real
 * IndexedDB.
 *
 * The pattern from the epic: interact the way a user does, assert what the
 * screen says, then assert what is actually on disk. The second half is what
 * makes these different from a component test — a screen that renders an
 * enrolment it never persisted passes the first half.
 */

/** The design canvas's worked example: 7:04.2 over 2,000 m. */
const BENCHMARK_2K_MS = 424_200

const benchmarkRows = (): Promise<ReadonlyArray<{ timeMs: number; kind: string }>> =>
  runDb(listBenchmarks.pipe(Effect.orDie))

const enrolmentRows = (): Promise<ReadonlyArray<{ planId: string; active: boolean }>> =>
  runDb(listEnrolments.pipe(Effect.orDie))

describe('onboarding', () => {
  it('asks for a 2k before it offers a single plan', async ({ plans }) => {
    const screen = await plans()

    await screen.expectAsksForBenchmark()
    // Not merely "the prompt is visible": the browse list must not be there
    // either, because a plan browsed without a benchmark has no paces in it.
    await expect.element(screen.planCard('Pete Plan 5k')).not.toBeInTheDocument()
  })

  it('shows what a 2k means per 500 m before it is saved', async ({ plans }) => {
    const screen = await plans()
    await screen.enterBenchmark()

    await screen.benchmark.type('7:04.2')

    // 1:46.0 is the canvas's own figure for this benchmark. Seeing it is what
    // catches a split typed where a 2k time belongs.
    await screen.benchmark.expectPace('1:46.0')
  })

  it('refuses to save text that is not a time', async ({ plans }) => {
    const screen = await plans()
    await screen.enterBenchmark()

    await screen.benchmark.type('seven minutes')

    await screen.benchmark.expectSaveDisabled()
    await expect
      .element(screen.benchmark.dialog.getByText('Enter a time like 7:04.2'))
      .toBeVisible()
  })

  it('reveals the plans once a 2k is entered, and keeps it', async ({ plans }) => {
    const screen = await plans()
    await screen.enterBenchmark()

    await screen.benchmark.type('7:04.2')
    await screen.benchmark.submit()

    await screen.benchmark.expectClosed()
    await screen.expectToast('Benchmark saved')
    await screen.expectPacedFrom('7:04.2')
    await expect.element(screen.planCard('Pete Plan 5k')).toBeVisible()

    expect(await benchmarkRows()).toEqual([
      expect.objectContaining({ kind: '2k', timeMs: BENCHMARK_2K_MS }),
    ])
  })

  it('reopens prefilled, so changing a 2k is an edit and not a retype', async ({ plans }) => {
    const screen = await plans({ benchmark2kMs: BENCHMARK_2K_MS })

    await screen.changeBenchmark()

    await screen.benchmark.expectPrefilled('7:04.2')
  })

  it('paces from the newest 2k after a correction', async ({ plans }) => {
    const screen = await plans({ benchmark2kMs: BENCHMARK_2K_MS })
    await screen.changeBenchmark()

    await screen.benchmark.type('6:58.0')
    await screen.benchmark.submit()

    await screen.expectPacedFrom('6:58.0')
    // Both rows are kept — a benchmark is a record, not a setting — and the
    // screen reads the latest rather than the only one.
    expect(await benchmarkRows()).toHaveLength(2)
  })
})

describe('the plans browser', () => {
  it('says there is no plan yet, and lists both to choose from', async ({ plans }) => {
    const screen = await plans({ benchmark2kMs: BENCHMARK_2K_MS })

    await expect.element(screen.noPlanYet).toBeVisible()
    await expect.element(screen.planCard('Pete Plan 5k')).toBeVisible()
    await expect.element(screen.planCard('Pete Plan 5k — Lite')).toBeVisible()
  })

  it('enrols on a tap and persists it', async ({ plans }) => {
    const screen = await plans({ benchmark2kMs: BENCHMARK_2K_MS })

    await screen.enrol('Pete Plan 5k')

    await screen.expectToast('You are on Pete Plan 5k')
    await expect.element(screen.activePlan('Pete Plan 5k')).toBeVisible()
    await screen.expectProgress('Week 1 of 12 · 0 of 71 sessions done')

    expect(await enrolmentRows()).toEqual([
      expect.objectContaining({ planId: 'pete5k', active: true }),
    ])
  })

  it('drops the active plan out of the browse list', async ({ plans }) => {
    const screen = await plans({ benchmark2kMs: BENCHMARK_2K_MS, planId: 'pete5k' })

    await expect.element(screen.planCard('Pete Plan 5k')).not.toBeInTheDocument()
    await expect.element(screen.planCard('Pete Plan 5k — Lite')).toBeVisible()
  })

  it('switches plans without leaving two of them active', async ({ plans }) => {
    const screen = await plans({ benchmark2kMs: BENCHMARK_2K_MS, planId: 'pete5k' })

    await screen.enrol('Pete Plan 5k — Lite')

    await expect.element(screen.activePlan('Pete Plan 5k — Lite')).toBeVisible()
    // The enrolment repository deactivates the others in the same
    // transaction, which is the only reason the screen can show one card.
    const rows = await enrolmentRows()
    expect(rows.filter((row) => row.active)).toEqual([
      expect.objectContaining({ planId: 'pete5k-lite' }),
    ])
    expect(rows).toHaveLength(2)
  })

  it('counts progress from the workouts, not from a stored counter', async ({ plans }) => {
    const screen = await plans({
      benchmark2kMs: BENCHMARK_2K_MS,
      planId: 'pete5k',
      completed: ['pete5k-w1-s1', 'pete5k-w1-s2'],
    })

    await screen.expectProgress('Week 1 of 12 · 2 of 71 sessions done')
  })

  it('ignores a workout logged against another plan', async ({ plans }) => {
    const screen = await plans({
      benchmark2kMs: BENCHMARK_2K_MS,
      planId: 'pete5k',
      completed: ['pete5k-lite-w1-s1'],
    })

    await screen.expectProgress('Week 1 of 12 · 0 of 71 sessions done')
  })
})
