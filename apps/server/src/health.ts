import { Effect } from 'effect'
import { SqlClient } from '@effect/sql'

export const checkDatabaseWith = <R, E>(
  queryEffect: Effect.Effect<unknown, E, R>
) =>
  queryEffect.pipe(
    Effect.as('connected' as const),
    Effect.catchAll(() => Effect.succeed('disconnected' as const))
  )

export const checkDatabase = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  return yield* checkDatabaseWith(sql`select 1`)
})
