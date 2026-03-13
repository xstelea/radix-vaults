import { PgClient } from '@effect/sql-pg'
import { SqlClient } from '@effect/sql'
import { VaultAddress } from '@radix-vaults/shared'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Effect, Redacted } from 'effect'
import { describe, expect, it } from '@effect/vitest'
import { existsSync } from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import { ORM } from '../db/orm'
import { PgContainer } from '../test/PgContainer'
import { ListVaultsRepo, VaultNotFoundError } from './listVaultsRepo'

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

const seedVaultRows = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  yield* sql`TRUNCATE TABLE proposals RESTART IDENTITY CASCADE`
  yield* sql`TRUNCATE TABLE vaults CASCADE`

  yield* sql`
    INSERT INTO vaults (account_address, name, created_at)
    VALUES
      ('account_tdx_2_1qalpha', 'Alpha Vault', '2026-01-01T00:00:00Z'::timestamptz),
      ('account_tdx_2_1qbeta', 'Beta Vault', '2026-01-02T00:00:00Z'::timestamptz),
      ('account_tdx_2_1qgamma', 'Gamma Vault', '2026-01-03T00:00:00Z'::timestamptz)
  `

  yield* sql`
    INSERT INTO proposals (entity_address, type, status, manifest, max_proposer_timestamp, created_by, intent_discriminator, epoch_min, epoch_max)
    VALUES
      ('account_tdx_2_1qalpha', 'vault', 'created', 'CALL_METHOD ...', '2026-12-31T23:59:59', 'account_tdx_2_1qcreator', '1', 100, 200),
      ('account_tdx_2_1qalpha', 'vault', 'ready', 'CALL_METHOD ...', '2026-12-31T23:59:59', 'account_tdx_2_1qcreator', '2', 100, 200),
      ('account_tdx_2_1qalpha', 'vault', 'submitted', 'CALL_METHOD ...', '2026-12-31T23:59:59', 'account_tdx_2_1qcreator', '3', 100, 200),
      ('account_tdx_2_1qbeta', 'vault', 'signing', 'CALL_METHOD ...', '2026-12-31T23:59:59', 'account_tdx_2_1qcreator', '4', 100, 200),
      ('account_tdx_2_1qbeta', 'vault', 'failed', 'CALL_METHOD ...', '2026-12-31T23:59:59', 'account_tdx_2_1qcreator', '5', 100, 200),
      ('account_tdx_2_1qgamma', 'vault', 'submitted', 'CALL_METHOD ...', '2026-12-31T23:59:59', 'account_tdx_2_1qcreator', '6', 100, 200)
  `
})

const runWithRepo = <A>(
  pgClientLayer: ReturnType<typeof PgClient.layer>,
  f: (repo: ListVaultsRepo) => Effect.Effect<A, unknown, never>
) =>
  Effect.gen(function* () {
    const repo = yield* ListVaultsRepo
    return yield* f(repo)
  }).pipe(
    Effect.provide(ListVaultsRepo.Default),
    Effect.provide(ORM.Default),
    Effect.provide(pgClientLayer)
  )

const listFromRepo = (pgClientLayer: ReturnType<typeof PgClient.layer>) =>
  runWithRepo(pgClientLayer, (repo) => repo.list())

describe('ListVaultsRepo', () => {
  it.scopedLive(
    'lists vaults in created order and counts only pending statuses',
    () =>
      Effect.gen(function* () {
        const container = yield* PgContainer
        const connectionUri = container.getConnectionUri()
        const pgClientLayer = PgClient.layer({
          url: Redacted.make(connectionUri)
        })

        yield* runMigrations(connectionUri)
        yield* seedVaultRows.pipe(Effect.provide(pgClientLayer))

        const list = yield* listFromRepo(pgClientLayer)

        expect(list).toHaveLength(3)
        expect(list.map((vault) => vault.name)).toEqual([
          'Alpha Vault',
          'Beta Vault',
          'Gamma Vault'
        ])
        expect(list.map((vault) => vault.pendingProposalCount)).toEqual([
          2, 1, 0
        ])
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )

  it.scopedLive(
    'returns detail base with pending proposal count',
    () =>
      Effect.gen(function* () {
        const container = yield* PgContainer
        const connectionUri = container.getConnectionUri()
        const pgClientLayer = PgClient.layer({
          url: Redacted.make(connectionUri)
        })

        yield* runMigrations(connectionUri)
        yield* seedVaultRows.pipe(Effect.provide(pgClientLayer))

        const detail = yield* runWithRepo(pgClientLayer, (repo) =>
          repo.getDetailBase(VaultAddress.make('account_tdx_2_1qalpha'))
        )

        expect(detail.name).toBe('Alpha Vault')
        expect(detail.pendingProposalCount).toBe(2)
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )

  it.scopedLive(
    'fails ensureExists when vault is missing',
    () =>
      Effect.gen(function* () {
        const container = yield* PgContainer
        const connectionUri = container.getConnectionUri()
        const pgClientLayer = PgClient.layer({
          url: Redacted.make(connectionUri)
        })

        yield* runMigrations(connectionUri)
        yield* seedVaultRows.pipe(Effect.provide(pgClientLayer))

        const result = yield* runWithRepo(pgClientLayer, (repo) =>
          Effect.either(
            repo.ensureExists(VaultAddress.make('account_tdx_2_1qmissing'))
          )
        )

        expect(result._tag).toBe('Left')
        if (result._tag === 'Left') {
          expect(result.left).toBeInstanceOf(VaultNotFoundError)
          if (result.left instanceof VaultNotFoundError) {
            expect(result.left.vaultAddress).toBe('account_tdx_2_1qmissing')
          }
        }
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )
})
