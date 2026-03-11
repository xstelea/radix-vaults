import { PgClient } from '@effect/sql-pg'
import { SqlClient } from '@effect/sql'
import { ProposalId, VaultAddress } from '@radix-vaults/shared'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Effect, Redacted } from 'effect'
import { describe, expect, it } from '@effect/vitest'
import { existsSync } from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import { ORM } from '../db/orm'
import { PgContainer } from '../test/PgContainer'
import { ProposalRepo, ProposalNotFoundDbError } from './proposalRepo'

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

const seedVault = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`TRUNCATE TABLE proposals RESTART IDENTITY CASCADE`
  yield* sql`TRUNCATE TABLE vaults CASCADE`
  yield* sql`
    INSERT INTO vaults (account_address, name)
    VALUES ('account_tdx_2_1qalpha', 'Alpha Vault')
  `
})

const VAULT = VaultAddress.make('account_tdx_2_1qalpha')

const runWithRepo = <A>(
  pgClientLayer: ReturnType<typeof PgClient.layer>,
  f: (repo: ProposalRepo) => Effect.Effect<A, unknown, never>
) =>
  Effect.gen(function* () {
    const repo = yield* ProposalRepo
    return yield* f(repo)
  }).pipe(
    Effect.provide(ProposalRepo.Default),
    Effect.provide(ORM.Default),
    Effect.provide(pgClientLayer)
  )

describe('ProposalRepo', () => {
  it.scopedLive(
    'inserts a proposal and returns it with status created',
    () =>
      Effect.gen(function* () {
        const container = yield* PgContainer
        const connectionUri = container.getConnectionUri()
        const pgClientLayer = PgClient.layer({
          url: Redacted.make(connectionUri)
        })

        yield* runMigrations(connectionUri)
        yield* seedVault.pipe(Effect.provide(pgClientLayer))

        const result = yield* runWithRepo(pgClientLayer, (repo) =>
          repo.insert({
            vaultAddress: VAULT,
            manifest: 'CALL_METHOD Address("test") "deposit" ;',
            maxProposerTimestamp: '2026-12-31T23:59:59',
            createdBy: 'account_tdx_2_1qcreator'
          })
        )

        expect(result.id).toBe(1)
        expect(result.status).toBe('created')
        expect(result.manifest).toBe('CALL_METHOD Address("test") "deposit" ;')
        expect(result.maxProposerTimestamp).toBe('2026-12-31T23:59:59')
        expect(result.createdBy).toBe('account_tdx_2_1qcreator')
        expect(result.vaultAddress).toBe(VAULT)
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )

  it.scopedLive(
    'lists proposals by vault in descending creation order',
    () =>
      Effect.gen(function* () {
        const container = yield* PgContainer
        const connectionUri = container.getConnectionUri()
        const pgClientLayer = PgClient.layer({
          url: Redacted.make(connectionUri)
        })

        yield* runMigrations(connectionUri)
        yield* seedVault.pipe(Effect.provide(pgClientLayer))

        yield* runWithRepo(pgClientLayer, (repo) =>
          Effect.all([
            repo.insert({
              vaultAddress: VAULT,
              manifest: 'manifest1',
              maxProposerTimestamp: '2026-12-31',
              createdBy: 'creator1'
            }),
            repo.insert({
              vaultAddress: VAULT,
              manifest: 'manifest2',
              maxProposerTimestamp: '2026-12-31',
              createdBy: 'creator2'
            })
          ])
        )

        const list = yield* runWithRepo(pgClientLayer, (repo) =>
          repo.listByVault(VAULT)
        )

        expect(list).toHaveLength(2)
        expect(list[0]?.id).toBe(2)
        expect(list[1]?.id).toBe(1)
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )

  it.scopedLive(
    'gets proposal by id and vault',
    () =>
      Effect.gen(function* () {
        const container = yield* PgContainer
        const connectionUri = container.getConnectionUri()
        const pgClientLayer = PgClient.layer({
          url: Redacted.make(connectionUri)
        })

        yield* runMigrations(connectionUri)
        yield* seedVault.pipe(Effect.provide(pgClientLayer))

        const inserted = yield* runWithRepo(pgClientLayer, (repo) =>
          repo.insert({
            vaultAddress: VAULT,
            manifest: 'CALL_METHOD ...',
            maxProposerTimestamp: '2026-12-31',
            createdBy: 'creator'
          })
        )

        const detail = yield* runWithRepo(pgClientLayer, (repo) =>
          repo.getById(VAULT, inserted.id)
        )

        expect(detail.id).toBe(inserted.id)
        expect(detail.manifest).toBe('CALL_METHOD ...')
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )

  it.scopedLive(
    'fails with ProposalNotFoundDbError for missing proposal',
    () =>
      Effect.gen(function* () {
        const container = yield* PgContainer
        const connectionUri = container.getConnectionUri()
        const pgClientLayer = PgClient.layer({
          url: Redacted.make(connectionUri)
        })

        yield* runMigrations(connectionUri)
        yield* seedVault.pipe(Effect.provide(pgClientLayer))

        const result = yield* runWithRepo(pgClientLayer, (repo) =>
          Effect.either(repo.getById(VAULT, ProposalId.make(9999)))
        )

        expect(result._tag).toBe('Left')
        if (result._tag === 'Left') {
          expect(result.left).toBeInstanceOf(ProposalNotFoundDbError)
        }
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )
})
