import { Unauthorized } from '@radix-vaults/shared'
import { Data, Effect, Ref } from 'effect'
import { RadixDappToolkit } from '@/lib/radixDappToolkit'

export class SessionExpiredError extends Data.TaggedError(
  'SessionExpiredError'
)<{}> {}

export const disconnectOnUnauthorized = <A, E, R>(
  self: Effect.Effect<A, E | Unauthorized, R>
): Effect.Effect<A, E | SessionExpiredError, R | RadixDappToolkit> =>
  self.pipe(
    Effect.catchTag('Unauthorized', () =>
      Effect.gen(function* () {
        const rdtRef = yield* RadixDappToolkit
        const rdt = yield* Ref.get(rdtRef)
        yield* Effect.sync(() => rdt.disconnect())
        return yield* new SessionExpiredError()
      })
    )
  )
