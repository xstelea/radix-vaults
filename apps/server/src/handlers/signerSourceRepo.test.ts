import { PgClient } from '@effect/sql-pg'
import { SqlClient } from '@effect/sql'
import type { AccountAddress } from '@radix-vaults/shared'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Effect, Redacted } from 'effect'
import { describe, expect, it } from '@effect/vitest'
import { existsSync } from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import { ORM } from '../db/orm'
import { PgContainer } from '../test/PgContainer'
import { SignerSourceRepo } from './signerSourceRepo'

const resolveMigrationsFolder = () => {
  const candidates = [
    'packages/database/drizzle',
    '../../packages/database/drizzle'
  ]

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate)
    if (existsSync(resolved)) {
      return resolved
    }
  }

  throw new Error(
    `Migrations folder not found (tried: ${candidates.join(', ')})`
  )
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

const runWithRepo = <A>(
  pgClientLayer: ReturnType<typeof PgClient.layer>,
  f: (repo: SignerSourceRepo) => Effect.Effect<A, unknown, never>
) =>
  Effect.gen(function* () {
    const repo = yield* SignerSourceRepo
    return yield* f(repo)
  }).pipe(
    Effect.provide(SignerSourceRepo.Default),
    Effect.provide(ORM.Default),
    Effect.provide(pgClientLayer)
  )

describe('SignerSourceRepo', () => {
  it.scopedLive(
    'sets and lists a signer source',
    () =>
      Effect.gen(function* () {
        const container = yield* PgContainer
        const connectionUri = container.getConnectionUri()
        const pgClientLayer = PgClient.layer({
          url: Redacted.make(connectionUri)
        })

        yield* runMigrations(connectionUri)

        yield* runWithRepo(pgClientLayer, (repo) =>
          repo.set(
            'account_tdx_2_1qmember1' as AccountAddress,
            'abcdef1234',
            'ed25519'
          )
        )

        const list = yield* runWithRepo(pgClientLayer, (repo) => repo.list())

        expect(list).toHaveLength(1)
        expect(list[0]).toMatchObject({
          accountAddress: 'account_tdx_2_1qmember1',
          publicKey: 'abcdef1234',
          keyType: 'ed25519'
        })
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )

  it.scopedLive(
    'upserts when setting same account twice',
    () =>
      Effect.gen(function* () {
        const container = yield* PgContainer
        const connectionUri = container.getConnectionUri()
        const pgClientLayer = PgClient.layer({
          url: Redacted.make(connectionUri)
        })

        yield* runMigrations(connectionUri)

        yield* runWithRepo(pgClientLayer, (repo) =>
          repo.set(
            'account_tdx_2_1qmember1' as AccountAddress,
            'key_v1',
            'ed25519'
          )
        )
        yield* runWithRepo(pgClientLayer, (repo) =>
          repo.set(
            'account_tdx_2_1qmember1' as AccountAddress,
            'key_v2',
            'secp256k1'
          )
        )

        const list = yield* runWithRepo(pgClientLayer, (repo) => repo.list())

        expect(list).toHaveLength(1)
        expect(list[0]).toMatchObject({
          publicKey: 'key_v2',
          keyType: 'secp256k1'
        })
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )

  it.scopedLive(
    'clears a signer source',
    () =>
      Effect.gen(function* () {
        const container = yield* PgContainer
        const connectionUri = container.getConnectionUri()
        const pgClientLayer = PgClient.layer({
          url: Redacted.make(connectionUri)
        })

        yield* runMigrations(connectionUri)

        yield* runWithRepo(pgClientLayer, (repo) =>
          repo.set(
            'account_tdx_2_1qmember1' as AccountAddress,
            'abcdef1234',
            'ed25519'
          )
        )
        yield* runWithRepo(pgClientLayer, (repo) =>
          repo.clear('account_tdx_2_1qmember1' as AccountAddress)
        )

        const list = yield* runWithRepo(pgClientLayer, (repo) => repo.list())
        expect(list).toHaveLength(0)
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )

  it.scopedLive(
    'clear is a no-op for non-existent account',
    () =>
      Effect.gen(function* () {
        const container = yield* PgContainer
        const connectionUri = container.getConnectionUri()
        const pgClientLayer = PgClient.layer({
          url: Redacted.make(connectionUri)
        })

        yield* runMigrations(connectionUri)

        yield* runWithRepo(pgClientLayer, (repo) =>
          repo.clear('account_tdx_2_1qunknown' as AccountAddress)
        )

        const list = yield* runWithRepo(pgClientLayer, (repo) => repo.list())
        expect(list).toHaveLength(0)
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )
})
