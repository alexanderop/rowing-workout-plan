import { Context } from 'effect'

/**
 * Id generation as an overridable reference rather than a bare import.
 *
 * Timestamps already come from Effect's `Clock`, which is what makes note
 * ages testable to the millisecond; ids reaching for `crypto` directly left
 * the other half of "what a new row looks like" untestable. A `Reference` is
 * the right shape for it: unlike a service, it carries a real default, so
 * nothing has to provide it and `Effect<A, E, never>` stays `never`. Tests
 * override it with `Effect.provideService(GenerateId, () => 'fixed-id')`.
 */
export const GenerateId = Context.Reference<() => string>('vue-pwa-starter/db/GenerateId', {
  defaultValue: () => () => crypto.randomUUID(),
})
