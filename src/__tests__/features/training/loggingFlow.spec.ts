import { describe, expect } from 'vitest'
import { Effect } from 'effect'
import { it } from '../../fixtures'
import { SessionScreen } from '../../pages/sessionScreen'
import { TodayScreen } from '../../pages/todayScreen'
import { listWorkouts, runDb } from '@/db'

/**
 * The loop closing: type a workout in off the monitor, and the plan moves on.
 *
 * Nothing stores "how far along am I" — `positionFor` derives it from the
 * workouts that carry a `planSessionId`. So the proof that logging works is
 * not that a row appeared, it is that a *different* screen changed its mind
 * about what to row next.
 */

const BENCHMARK_2K_MS = 424_200

const SEED = { benchmark2kMs: BENCHMARK_2K_MS, planId: 'pete5k' } as const

/** Week 1 of the full plan, in order. */
const FIRST = '10k+ steady'
const SECOND = '8 × 500m / 1′ rest'

const workoutRows = (): Promise<
  ReadonlyArray<{ distanceM: number; durationMs: number; planSessionId?: string; avgRate?: number }>
> => runDb(listWorkouts.pipe(Effect.orDie))

describe('logging a session', () => {
  it('offers the first session of the plan before anything is rowed', async ({ today }) => {
    const screen = await today(SEED)
    await screen.expectReady()

    await screen.expectNextSession(FIRST)
    await screen.expectPosition('Week 1 of 12 · Session 1 of 6')
  })

  it('reads a steady target as a band on the card and in the week list alike', async ({
    today,
  }) => {
    // One screen showed the same session two ways: `2:06.0` on the card and
    // `2:04.0–2:08.0` in the list directly under it. Aerobic work is a zone,
    // an interval is a number, and printing one as the other is how a steady
    // row turns into a race — so both have to read it the same way.
    const screen = await today(SEED)
    await screen.expectReady()

    await expect.element(screen.hero(FIRST)).toHaveTextContent('2:04.0–2:08.0')
    await expect.element(screen.hero(FIRST)).not.toHaveTextContent('2:06.0')
  })

  it('advances Today once the session is logged', async ({ today }) => {
    const screen = await today(SEED)
    await screen.openSession(FIRST)

    const session = SessionScreen.within(screen)
    await session.expectReady(FIRST)
    await session.logSession()
    await session.sheet.fill({ distance: '10000', time: '42:00' })
    await session.sheet.submit()
    await session.sheet.expectClosed()
    await session.expectToast('Workout logged')

    // Back to Today: the write invalidated the workouts key, so the screen
    // re-read from disk rather than being told what changed.
    await screen.tab('Today').click()
    const back = TodayScreen.within(screen)
    await back.expectNextSession(SECOND)
    await back.expectPosition('Week 1 of 12 · Session 2 of 6')
  })

  it('writes the session id, so the row is the plan’s and not a free one', async ({ today }) => {
    const screen = await today(SEED)
    await screen.openSession(FIRST)

    const session = SessionScreen.within(screen)
    await session.logSession()
    await session.sheet.fill({ distance: '10000', time: '42:00', rate: '22' })
    await session.sheet.submit()
    await session.sheet.expectClosed()

    expect(await workoutRows()).toEqual([
      expect.objectContaining({
        planSessionId: 'pete5k-w1-s1',
        distanceM: 10_000,
        durationMs: 2_520_000,
        avgRate: 22,
      }),
    ])
  })

  it('prefills the distance the session asks for', async ({ sessionDetail }) => {
    const session = await sessionDetail('pete5k-w1-s2', SEED)

    await session.logSession()

    // 8 × 500 m is 4,000 m of work, and retyping what the plan already said
    // is the fastest way to log the wrong number.
    await session.sheet.expectPrefilledDistance('4000')
  })

  it('shows the split and power the two fields work out to, before saving', async ({
    sessionDetail,
  }) => {
    const session = await sessionDetail('pete5k-w1-s1', SEED)
    await session.logSession()

    await session.sheet.fill({ distance: '10000', time: '42:00' })

    // 10,000 m in 42:00 is 2:06.0 per 500 m — the steady target for this 2k,
    // which is the comparison the readout exists to make possible.
    await session.sheet.expectResult('2:06.0 /500m · 175 W')
  })

  it('refuses to save a row with half its numbers, and says which half', async ({
    sessionDetail,
  }) => {
    // `42:7` is not enterable any more — the pad fills from the right — so
    // the mistake left to make is leaving a field alone. A Save that will not
    // press and will not say why reads as the app being broken.
    const session = await sessionDetail('pete5k-w1-s1', SEED)
    await session.logSession()

    await session.sheet.fill({ distance: '10000' })

    await session.sheet.expectSaveDisabled()
    await expect
      .element(session.sheet.anyDialog.getByText('Add the time to work out your split'))
      .toBeVisible()
  })

  it('marks the session logged when you come back to it', async ({ sessionDetail }) => {
    const session = await sessionDetail('pete5k-w1-s1', {
      ...SEED,
      completed: ['pete5k-w1-s1'],
    })
    await session.expectReady(FIRST)

    await expect.element(session.container.querySelector('main')).toHaveTextContent('Logged')
  })
})

describe('today', () => {
  it('sends you to the plans screen when there is nothing set up', async ({ today }) => {
    const screen = await today()
    await screen.expectReady()

    await expect
      .element(screen.container.querySelector('main'))
      .toHaveTextContent('Nothing scheduled yet')
  })

  it('says the plan is done when every session is behind you', async ({ today }) => {
    const everySession = Array.from({ length: 71 }, (_unused, index) => index)
    const screen = await today({
      ...SEED,
      completed: everySession.map((index) => sessionIdAt(index)),
    })
    await screen.expectReady()

    await expect.element(screen.container.querySelector('main')).toHaveTextContent('Plan complete')
  })
})

/** The nth session id of the full plan, in plan order. */
function sessionIdAt(index: number): string {
  const weeksBefore = Math.floor(index / 6)
  return `pete5k-w${weeksBefore + 1}-s${(index % 6) + 1}`
}

describe('the log', () => {
  const AUGUST_20 = new Date(2026, 7, 20, 9).getTime()

  it('is empty until something is rowed', async ({ log }) => {
    const screen = await log()
    await screen.expectReady()

    await expect
      .element(screen.container.querySelector('main'))
      .toHaveTextContent('Nothing logged yet')
  })

  it('lists a free row and totals the month', async ({ log }) => {
    const screen = await log({
      workouts: [
        { startedAt: Date.now(), distanceM: 10_000, durationMs: 2_520_000, avgSplitMs: 126_000 },
      ],
    })
    await screen.expectReady()

    await expect.element(screen.entry('Free row')).toBeVisible()
    // "0h 43m" is a figure nobody writes, so under an hour the hours are left
    // off entirely rather than shown as a zero.
    await screen.expectTotals('10 km', '42m', '1')
  })

  it('names a planned row with the plan’s own sentence', async ({ log }) => {
    const screen = await log({
      ...SEED,
      workouts: [
        {
          startedAt: Date.now(),
          planSessionId: 'pete5k-w1-s2',
          distanceM: 4000,
          durationMs: 900_000,
          avgSplitMs: 112_500,
        },
      ],
    })

    await expect.element(screen.entry(SECOND)).toBeVisible()
  })

  it('filters to what a plan asked for, and to what nothing did', async ({ log }) => {
    const screen = await log({
      ...SEED,
      workouts: [
        { startedAt: Date.now(), planSessionId: 'pete5k-w1-s2' },
        { startedAt: Date.now() - 1000 },
      ],
    })

    await screen.chooseFilter('Plan')
    await expect.element(screen.entry('Free row')).not.toBeInTheDocument()

    await screen.chooseFilter('Free row')
    await expect.element(screen.entry('Free row')).toBeVisible()
  })

  it('leaves the month totals alone when the filter changes', async ({ log }) => {
    // A number that moves when you tap a chip is a number nobody can quote.
    const screen = await log({
      ...SEED,
      workouts: [
        { startedAt: Date.now(), planSessionId: 'pete5k-w1-s2', distanceM: 4000 },
        { startedAt: Date.now() - 1000, distanceM: 6000 },
      ],
    })
    await screen.expectTotals('10 km')

    await screen.chooseFilter('Plan')

    await screen.expectTotals('10 km')
  })

  it('groups by the week a workout was rowed in', async ({ log }) => {
    const week = 7 * 24 * 60 * 60 * 1000
    const screen = await log({
      workouts: [{ startedAt: Date.now() }, { startedAt: Date.now() - 2 * week }],
    })
    await screen.expectReady()

    await expect.element(screen.bucket('This week')).toBeVisible()
    await expect.element(screen.bucket('Earlier')).toBeVisible()
  })

  it('logs a free row from the log itself', async ({ log }) => {
    const screen = await log()

    await screen.logRow()
    await screen.sheet.fill({ distance: '6000', time: '24:06' })
    await screen.sheet.submit()

    await screen.sheet.expectClosed()
    await expect.element(screen.entry('Free row')).toBeVisible()
    expect(await workoutRows()).toEqual([
      expect.objectContaining({ distanceM: 6000, durationMs: 1_446_000 }),
    ])
  })

  it('keeps a row whose plan the catalogue no longer has', async ({ log }) => {
    // A workout is a thing that happened. It stays visible whatever the
    // catalogue has since become.
    const screen = await log({
      workouts: [{ startedAt: AUGUST_20, planSessionId: 'pete5k-2019-w1-s1' }],
    })

    await expect.element(screen.entry('Free row')).toBeVisible()
  })
})
