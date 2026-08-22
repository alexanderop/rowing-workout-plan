import { describe, expect } from 'vitest'
import { it } from '../../fixtures'
import { PlanWeekScreen } from '../../pages/planWeekScreen'
import { SessionScreen } from '../../pages/sessionScreen'

/**
 * Browsing a plan, and the one claim the whole trainer rests on: every number
 * on these screens is derived from one 2k time.
 *
 * The figures asserted below are the design canvas's own, for the benchmark
 * the canvas works through — 1:50.0 for week 3's long-rest intervals, 1:47.0
 * for the middle rep of the paced 2k, 2:04–2:08 around a steady row. Pinning
 * those rather than re-running `targetFor` in the test is what keeps this from
 * being a tautology: a rewrite of the pacing model has to answer to the
 * mockups, not to itself.
 */

/** The canvas's worked example: 7:04.2 over 2,000 m. */
const BENCHMARK_2K_MS = 424_200

const SEED = { benchmark2kMs: BENCHMARK_2K_MS, planId: 'pete5k' } as const

/** Week 3 of the full plan, session by session, as the rows are written. */
const SHORT_REST = '6 × 1k / 1′ rest'
const LONG_REST = '4 × 1800m / 4′ rest'
const PACED_2K = '3 × 2k / 3′ rest'
const STEADY = '10k+ steady'

describe('the plan week', () => {
  it('walks Plans → week → session in one app', async ({ plans }) => {
    const screen = await plans(SEED)

    await screen.openActivePlan(1, 'Pete Plan 5k')
    const week = PlanWeekScreen.within(screen)
    await week.expectReady(1)

    await week.openWeek(3)
    await week.expectReady(3)

    await week.openSession(LONG_REST)
    const session = SessionScreen.within(screen)
    await session.expectReady(LONG_REST)
  })

  it('lists the week and derives a target for every session', async ({ planWeek }) => {
    const week = await planWeek('pete5k', 3, SEED)
    await week.expectReady(3)

    await week.expectTarget(SHORT_REST, '1:52.0')
    await week.expectTarget(LONG_REST, '1:50.0')
    await week.expectTarget(PACED_2K, '1:47.0')
  })

  it('quotes steady as a band, because steady is a zone and not a number', async ({ planWeek }) => {
    const week = await planWeek('pete5k', 3, SEED)

    await week.expectTarget(STEADY, '2:04.0–2:08.0')
  })

  it('says where the week sits in the three-week cycle', async ({ planWeek }) => {
    const week = await planWeek('pete5k', 3, SEED)

    await expect
      .element(week.rotationNote)
      .toHaveTextContent('Last week of rotation 1 — the reps are at their longest')
  })

  it('lets the end of the plan win over the end of the rotation', async ({ planWeek }) => {
    // Week 12 closes rotation 4 *and* the plan, and "from week 13" would name
    // a week that does not exist.
    const week = await planWeek('pete5k', 12, SEED)

    await expect.element(week.rotationNote).toHaveTextContent('Last week of the plan')
  })

  it('counts the week and marks what is done', async ({ planWeek }) => {
    const week = await planWeek('pete5k', 3, {
      ...SEED,
      completed: ['pete5k-w3-s1', 'pete5k-w3-s2'],
    })

    // Three 10k steady rows, 6 × 1k, 4 × 1800m and 3 × 2k: 49.2 km of work.
    await expect.element(week.summary).toHaveTextContent('6 sessions · roughly 49 km · 2 done')
  })

  it('moves between weeks through the strip', async ({ planWeek }) => {
    const week = await planWeek('pete5k', 1, SEED)

    await week.openWeek(4)

    await week.expectReady(4)
    // Week 4 opens rotation 2, so the same slot is now a tenth faster.
    await week.expectTarget('8 × 500m / 1′ rest', '1:51.9')
  })

  it('offers every week of the plan without a scroll off the end', async ({ planWeek }) => {
    const week = await planWeek('pete5k', 1, SEED)

    await expect.element(week.weekChip(12)).toBeVisible()
    await expect.element(week.weekChip(13)).not.toBeInTheDocument()
  })

  it('says so when the week is not part of the plan', async ({ planWeek }) => {
    const week = await planWeek('pete5k', 13, SEED)

    await expect.element(week.error).toBeVisible()
  })

  it('lists the sessions before a 2k exists, without inventing targets', async ({ planWeek }) => {
    // What you are meant to row does not depend on knowing how fast.
    const week = await planWeek('pete5k', 3, {})

    await expect.element(week.sessionRow(SHORT_REST).first()).toBeVisible()
    await expect.element(week.sessionRow(SHORT_REST).first()).not.toHaveTextContent('target')
  })
})

describe('the session', () => {
  it('shows the three targets the canvas prints', async ({ sessionDetail }) => {
    const session = await sessionDetail('pete5k-w3-s2', SEED)
    await session.expectReady(SHORT_REST)

    await expect.element(session.targets).toHaveTextContent('Targets from your 2k of 7:04.2')
    await session.expectStat('1:52.0')
    await session.expectStat('24–26')
    await session.expectStat('249 W')
  })

  it('lists one row per rep', async ({ sessionDetail }) => {
    const session = await sessionDetail('pete5k-w3-s2', SEED)

    await expect.element(session.rep(1)).toHaveTextContent('1k')
    await expect.element(session.rep(6)).toHaveTextContent('1:52.0')
    await expect.element(session.rep(7)).not.toBeInTheDocument()
  })

  it('paces the middle rep of a paced 2k apart from the outer two', async ({ sessionDetail }) => {
    // The single most damaging way to get this plan wrong is to row three
    // flat-out 2ks. The outer reps are steady pace; only the middle is a test.
    const session = await sessionDetail('pete5k-w3-s6', SEED)
    await session.expectReady(PACED_2K)

    await expect.element(session.rep(1)).toHaveTextContent('2:06.0')
    await expect.element(session.rep(2)).toHaveTextContent('1:47.0')
    await expect.element(session.rep(3)).toHaveTextContent('2:06.0')
  })

  it('coaches the rotation on a session the rotation re-paces', async ({ sessionDetail }) => {
    const session = await sessionDetail('pete5k-w3-s4', SEED)

    await session.expectCoachingNote('Hold this pace as the reps get longer')
  })

  it('stays quiet on a session the rotation does not re-pace', async ({ sessionDetail }) => {
    // "Next rotation, go a tenth faster" said about a steady row is telling
    // someone to stop rowing steady.
    const session = await sessionDetail('pete5k-w3-s1', SEED)
    await session.expectReady(STEADY)

    expect(session.container.textContent).not.toContain('Next rotation')
  })

  it('shows the session without targets when there is no 2k', async ({ sessionDetail }) => {
    const session = await sessionDetail('pete5k-w3-s2', {})
    await session.expectReady(SHORT_REST)

    await expect.element(session.targets).not.toBeInTheDocument()
    expect(session.container.textContent).toContain('Set your 2k on the Plans screen')
  })

  it('says so for an id no plan has', async ({ sessionDetail }) => {
    const session = await sessionDetail('pete5k-w99-s1', SEED)

    await expect.element(session.error).toBeVisible()
  })

  it('finds a lite-plan session even though the ids share a prefix', async ({ sessionDetail }) => {
    const session = await sessionDetail('pete5k-lite-w1-s1', SEED)

    // The lite plan runs its own, shorter rotation: 6 × 500m where the full
    // plan opens with 8.
    await session.expectReady('6 × 500m / 1′ rest')
  })
})
