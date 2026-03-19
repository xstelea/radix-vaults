import { PgClient } from '@effect/sql-pg'
import { SqlClient } from '@effect/sql'
import {
  ProposalId,
  ProposalNotFoundError,
  VaultAddress
} from '@radix-vaults/shared'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Effect, Redacted } from 'effect'
import { describe, expect, it } from '@effect/vitest'
import { existsSync } from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import { ORM } from '../db/orm'
import { PgContainer } from '../test/PgContainer'
import { ProposalRepo } from './proposalRepo'

const testTeamId = '00000000-0000-0000-0000-000000000001'

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
  yield* sql`TRUNCATE TABLE teams CASCADE`
  yield* sql`
    INSERT INTO teams (id, name, badge_address)
    VALUES (${testTeamId}, 'Test Team', 'resource_tdx_2_1test_badge')
  `
  yield* sql`
    INSERT INTO vaults (team_id, account_address, name)
    VALUES (${testTeamId}, 'account_tdx_2_1qalpha', 'Alpha Vault')
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
            teamId: testTeamId,
            entityAddress: VAULT,
            type: 'vault' as const,
            manifest: 'CALL_METHOD Address("test") "deposit" ;',
            maxProposerTimestamp: '2026-12-31T23:59:59',
            createdBy: 'account_tdx_2_1qcreator',
            createdAt: new Date(),
            subintentHash: 'subtxid_test_1',
            intentDiscriminator: '123456',
            partialTransactionHex: 'deadbeef',
            epochMin: 100,
            epochMax: 200
          })
        )

        expect(result.id).toBe(1)
        expect(result.status).toBe('created')
        expect(result.manifest).toBe('CALL_METHOD Address("test") "deposit" ;')
        expect(result.maxProposerTimestamp).toBe('2026-12-31T23:59:59')
        expect(result.createdBy).toBe('account_tdx_2_1qcreator')
        expect(result.entityAddress).toBe(VAULT)
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
          Effect.gen(function* () {
            yield* repo.insert({
              teamId: testTeamId,
              entityAddress: VAULT,
              type: 'vault' as const,
              manifest: 'manifest1',
              maxProposerTimestamp: '2026-12-31',
              createdBy: 'creator1',
              createdAt: new Date('2026-01-01T00:00:00Z'),
              subintentHash: 'subtxid_test_2',
              intentDiscriminator: '111',
              partialTransactionHex: 'aa',
              epochMin: 100,
              epochMax: 200
            })
            yield* repo.insert({
              teamId: testTeamId,
              entityAddress: VAULT,
              type: 'vault' as const,
              manifest: 'manifest2',
              maxProposerTimestamp: '2026-12-31',
              createdBy: 'creator2',
              createdAt: new Date('2026-01-02T00:00:00Z'),
              subintentHash: 'subtxid_test_3',
              intentDiscriminator: '222',
              partialTransactionHex: 'bb',
              epochMin: 100,
              epochMax: 200
            })
          })
        )

        const list = yield* runWithRepo(pgClientLayer, (repo) =>
          repo.listByVault(testTeamId, VAULT)
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
            teamId: testTeamId,
            entityAddress: VAULT,
            type: 'vault' as const,
            manifest: 'CALL_METHOD ...',
            maxProposerTimestamp: '2026-12-31',
            createdBy: 'creator',
            createdAt: new Date(),
            subintentHash: 'subtxid_test_4',
            intentDiscriminator: '333',
            partialTransactionHex: 'cc',
            epochMin: 100,
            epochMax: 200
          })
        )

        const detail = yield* runWithRepo(pgClientLayer, (repo) =>
          repo.getById(testTeamId, VAULT, inserted.id)
        )

        expect(detail.id).toBe(inserted.id)
        expect(detail.manifest).toBe('CALL_METHOD ...')
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )

  it.scopedLive(
    'scopes proposals to team — listByVault only returns proposals for the given team',
    () =>
      Effect.gen(function* () {
        const container = yield* PgContainer
        const connectionUri = container.getConnectionUri()
        const pgClientLayer = PgClient.layer({
          url: Redacted.make(connectionUri)
        })

        yield* runMigrations(connectionUri)

        const otherTeamId = '00000000-0000-0000-0000-000000000002'

        // Seed two teams with the same vault address
        yield* Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          yield* sql`TRUNCATE TABLE proposals RESTART IDENTITY CASCADE`
          yield* sql`TRUNCATE TABLE vaults CASCADE`
          yield* sql`TRUNCATE TABLE teams CASCADE`
          yield* sql`
            INSERT INTO teams (id, name, badge_address) VALUES
              (${testTeamId}, 'Team One', 'resource_tdx_2_1badge_one'),
              (${otherTeamId}, 'Team Two', 'resource_tdx_2_1badge_two')
          `
          yield* sql`
            INSERT INTO vaults (team_id, account_address, name) VALUES
              (${testTeamId}, ${VAULT}, 'Alpha in T1'),
              (${otherTeamId}, ${VAULT}, 'Alpha in T2')
          `
        }).pipe(Effect.provide(pgClientLayer))

        // Insert proposals in each team
        yield* runWithRepo(pgClientLayer, (repo) =>
          Effect.gen(function* () {
            yield* repo.insert({
              teamId: testTeamId,
              entityAddress: VAULT,
              type: 'vault' as const,
              manifest: 'team1_manifest',
              maxProposerTimestamp: '2026-12-31',
              createdBy: 'creator1',
              createdAt: new Date(),
              subintentHash: 'subtxid_team1',
              intentDiscriminator: 'disc1',
              partialTransactionHex: 'aa',
              epochMin: 100,
              epochMax: 200
            })
            yield* repo.insert({
              teamId: otherTeamId,
              entityAddress: VAULT,
              type: 'vault' as const,
              manifest: 'team2_manifest',
              maxProposerTimestamp: '2026-12-31',
              createdBy: 'creator2',
              createdAt: new Date(),
              subintentHash: 'subtxid_team2',
              intentDiscriminator: 'disc2',
              partialTransactionHex: 'bb',
              epochMin: 100,
              epochMax: 200
            })
          })
        )

        // List for team one — only team one's proposal
        const team1Proposals = yield* runWithRepo(pgClientLayer, (repo) =>
          repo.listByVault(testTeamId, VAULT)
        )
        expect(team1Proposals).toHaveLength(1)
        expect(team1Proposals[0]?.createdBy).toBe('creator1')

        // List for team two — only team two's proposal
        const team2Proposals = yield* runWithRepo(pgClientLayer, (repo) =>
          repo.listByVault(otherTeamId, VAULT)
        )
        expect(team2Proposals).toHaveLength(1)
        expect(team2Proposals[0]?.createdBy).toBe('creator2')
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )

  it.scopedLive(
    'fails with ProposalNotFoundError for missing proposal',
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
          Effect.either(repo.getById(testTeamId, VAULT, ProposalId.make(9999)))
        )

        expect(result._tag).toBe('Left')
        if (result._tag === 'Left') {
          expect(result.left).toBeInstanceOf(ProposalNotFoundError)
        }
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )
})
