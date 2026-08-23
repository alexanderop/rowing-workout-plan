/**
 * Waits out every animation currently running on the page.
 *
 * A tier that *measures* — a screenshot, an axe contrast check, a
 * `getBoundingClientRect()` against the 44px floor — has to do it on a frame
 * a user could actually see. Mid-animation, a sheet is under a `transform`,
 * and a rect computed through a transform matrix is float arithmetic: the
 * benchmark sheet's Save button reads 44.00006px on one frame and 43.99994px
 * on the next, so a `< 44` comparison decides on where in the slide-up the
 * measurement happened to land. That is exactly the failure CI produced and
 * this machine did not.
 *
 * Infinite animations are excluded rather than awaited — a spinner's
 * `finished` promise never resolves, so awaiting the unfiltered list is a
 * hang waiting for the first looping animation to ship.
 */
export async function settleAnimations(): Promise<void> {
  // One frame first: an animation provoked by a class change or a mount does
  // not exist until style is recalculated, so without this there is nothing
  // to await.
  await nextFrame()

  await Promise.all(
    document
      .getAnimations()
      .filter(isFinite_)
      // An animation cancelled mid-flight rejects; that it is over is all we
      // are waiting for, and why it ended does not change the answer.
      .map((animation) => animation.finished.catch(() => undefined)),
  )

  // And one after: the final frame of an animation is committed on the next
  // tick, so a measurement taken the instant `finished` resolves can still
  // read the transform that is about to be dropped.
  await nextFrame()
}

const isFinite_ = (animation: Animation): boolean =>
  animation.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()))
