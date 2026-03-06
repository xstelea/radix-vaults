import type { HexString } from '@radix-vaults/shared'
import { PgClient } from '@effect/sql-pg'
import { SqlClient } from '@effect/sql'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Effect, Redacted } from 'effect'
import { describe, expect, it } from '@effect/vitest'
import { existsSync } from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import { ORM } from '../db/orm'
import { PgContainer } from '../test/PgContainer'
import { ChallengeStore, ChallengeExpiredOrUsedError } from './challengeStore'

const resolveMigrationsFolder = () => {
  const candidates = [
    'packages/database/drizzle',
    '../../packages/database/drizzle'
  ]
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate)
    if (existsSync(resolved)) return resolved
  }
  throw new Error('Migrations folder not found')
}

const runMigrations = (connectionString: string) =>
  Effect.acquireUseRelease(
    Effect.sync(() => new pg.Pool({ connectionString })),
    (pool) =>
      Effect.promise(() =>
        migrate(drizzle(pool), { migrationsFolder: resolveMigrationsFolder() })
      ),
    (pool) => Effect.promise(() => pool.end())
  )

const withChallengeStore = <A>(
  pgClientLayer: ReturnType<typeof PgClient.layer>,
  f: (store: ChallengeStore) => Effect.Effect<A, unknown, never>
) =>
  Effect.gen(function* () {
    const store = yield* ChallengeStore
    return yield* f(store)
  }).pipe(
    Effect.provide(ChallengeStore.Default),
    Effect.provide(ORM.Default),
    Effect.provide(pgClientLayer)
  )

describe('ChallengeStore', () => {
  it.scopedLive(
    'creates and consumes a valid challenge',
    () =>
      Effect.gen(function* () {
        const container = yield* PgContainer
        const connectionUri = container.getConnectionUri()
        const pgClientLayer = PgClient.layer({
          url: Redacted.make(connectionUri)
        })

        yield* runMigrations(connectionUri)

        const challengeHex = yield* withChallengeStore(pgClientLayer, (store) =>
          store.create()
        )

        expect(challengeHex).toHaveLength(64)

        yield* withChallengeStore(pgClientLayer, (store) =>
          store.consume(challengeHex)
        )
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )

  it.scopedLive(
    'rejects an already-used challenge',
    () =>
      Effect.gen(function* () {
        const container = yield* PgContainer
        const connectionUri = container.getConnectionUri()
        const pgClientLayer = PgClient.layer({
          url: Redacted.make(connectionUri)
        })

        yield* runMigrations(connectionUri)

        const challengeHex = yield* withChallengeStore(pgClientLayer, (store) =>
          store.create()
        )

        yield* withChallengeStore(pgClientLayer, (store) =>
          store.consume(challengeHex)
        )

        const result = yield* withChallengeStore(pgClientLayer, (store) =>
          Effect.either(store.consume(challengeHex))
        )

        expect(result._tag).toBe('Left')
        if (result._tag === 'Left') {
          expect(result.left).toBeInstanceOf(ChallengeExpiredOrUsedError)
        }
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )

  it.scopedLive(
    'rejects an unknown challenge',
    () =>
      Effect.gen(function* () {
        const container = yield* PgContainer
        const connectionUri = container.getConnectionUri()
        const pgClientLayer = PgClient.layer({
          url: Redacted.make(connectionUri)
        })

        yield* runMigrations(connectionUri)

        const result = yield* withChallengeStore(pgClientLayer, (store) =>
          Effect.either(store.consume('deadbeef'.repeat(8) as HexString))
        )

        expect(result._tag).toBe('Left')
        if (result._tag === 'Left') {
          expect(result.left).toBeInstanceOf(ChallengeExpiredOrUsedError)
        }
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )

  it.scopedLive(
    'rejects an expired challenge',
    () =>
      Effect.gen(function* () {
        const container = yield* PgContainer
        const connectionUri = container.getConnectionUri()
        const pgClientLayer = PgClient.layer({
          url: Redacted.make(connectionUri)
        })

        yield* runMigrations(connectionUri)

        // Create a challenge, expire it, then try to consume
        const result = yield* Effect.gen(function* () {
          const store = yield* ChallengeStore
          const challengeHex = yield* store.create()

          // Expire the challenge by updating the DB directly
          const sql = yield* SqlClient.SqlClient
          yield* sql`
            UPDATE challenges
            SET expires_at = now() - interval '1 hour'
            WHERE challenge = ${challengeHex}
          `

          return yield* Effect.either(store.consume(challengeHex))
        }).pipe(
          Effect.provide(ChallengeStore.Default),
          Effect.provide(ORM.Default),
          Effect.provide(pgClientLayer)
        )

        expect(result._tag).toBe('Left')
        if (result._tag === 'Left') {
          expect(result.left).toBeInstanceOf(ChallengeExpiredOrUsedError)
        }
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )
})
