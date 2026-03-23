import { PgClient } from '@effect/sql-pg'
import { SqlClient } from '@effect/sql'
import { TeamNotFoundError } from '@radix-vaults/shared'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Effect, Redacted } from 'effect'
import { describe, expect, it } from '@effect/vitest'
import { existsSync } from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import { ORM } from '../db/orm'
import { PgContainer } from '../test/PgContainer'
import { TeamRepo } from './teamRepo'

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

const cleanTables = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`TRUNCATE TABLE team_members CASCADE`
  yield* sql`TRUNCATE TABLE teams CASCADE`
})

const runWithRepo = <A>(
  pgClientLayer: ReturnType<typeof PgClient.layer>,
  f: (repo: TeamRepo) => Effect.Effect<A, unknown, never>
) =>
  Effect.gen(function* () {
    const repo = yield* TeamRepo
    return yield* f(repo)
  }).pipe(
    Effect.provide(TeamRepo.Default),
    Effect.provide(ORM.Default),
    Effect.provide(pgClientLayer)
  )

describe('TeamRepo', () => {
  it.scopedLive(
    'inserts a team and retrieves it by id',
    () =>
      Effect.gen(function* () {
        const container = yield* PgContainer
        const connectionUri = container.getConnectionUri()
        const pgClientLayer = PgClient.layer({
          url: Redacted.make(connectionUri)
        })

        yield* runMigrations(connectionUri)
        yield* cleanTables.pipe(Effect.provide(pgClientLayer))

        const teamId = crypto.randomUUID()

        yield* runWithRepo(pgClientLayer, (repo) =>
          repo.insert(teamId, 'Test Team', 'resource_tdx_2_badge123')
        )

        const team = yield* runWithRepo(pgClientLayer, (repo) =>
          repo.getById(teamId)
        )

        expect(team.id).toBe(teamId)
        expect(team.name).toBe('Test Team')
        expect(team.badgeAddress).toBe('resource_tdx_2_badge123')
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )

  it.scopedLive(
    'fails with TeamNotFoundError for missing team',
    () =>
      Effect.gen(function* () {
        const container = yield* PgContainer
        const connectionUri = container.getConnectionUri()
        const pgClientLayer = PgClient.layer({
          url: Redacted.make(connectionUri)
        })

        yield* runMigrations(connectionUri)
        yield* cleanTables.pipe(Effect.provide(pgClientLayer))

        const result = yield* runWithRepo(pgClientLayer, (repo) =>
          Effect.either(repo.getById(crypto.randomUUID()))
        )

        expect(result._tag).toBe('Left')
        if (result._tag === 'Left') {
          expect(result.left).toBeInstanceOf(TeamNotFoundError)
        }
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )

  it.scopedLive(
    'adds a member and lists teams by member',
    () =>
      Effect.gen(function* () {
        const container = yield* PgContainer
        const connectionUri = container.getConnectionUri()
        const pgClientLayer = PgClient.layer({
          url: Redacted.make(connectionUri)
        })

        yield* runMigrations(connectionUri)
        yield* cleanTables.pipe(Effect.provide(pgClientLayer))

        const teamId1 = crypto.randomUUID()
        const teamId2 = crypto.randomUUID()
        const memberAddress = 'account_tdx_2_member1'

        yield* runWithRepo(pgClientLayer, (repo) =>
          Effect.gen(function* () {
            yield* repo.insert(teamId1, 'Team Alpha', 'resource_tdx_2_alpha')
            yield* repo.insert(teamId2, 'Team Beta', 'resource_tdx_2_beta')
            yield* repo.addMember(teamId1, memberAddress, true)
            yield* repo.addMember(teamId2, memberAddress, true)
            yield* repo.addMember(teamId1, 'account_tdx_2_other', true)
          })
        )

        const teams = yield* runWithRepo(pgClientLayer, (repo) =>
          repo.listByMember(memberAddress)
        )

        expect(teams).toHaveLength(2)
        const names = teams.map((t) => t.name).sort()
        expect(names).toEqual(['Team Alpha', 'Team Beta'])
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )

  it.scopedLive(
    'returns empty list for member with no teams',
    () =>
      Effect.gen(function* () {
        const container = yield* PgContainer
        const connectionUri = container.getConnectionUri()
        const pgClientLayer = PgClient.layer({
          url: Redacted.make(connectionUri)
        })

        yield* runMigrations(connectionUri)
        yield* cleanTables.pipe(Effect.provide(pgClientLayer))

        const teams = yield* runWithRepo(pgClientLayer, (repo) =>
          repo.listByMember('account_tdx_2_nobody')
        )

        expect(teams).toHaveLength(0)
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )

  it.scopedLive(
    'confirmMember flips confirmed to true',
    () =>
      Effect.gen(function* () {
        const container = yield* PgContainer
        const connectionUri = container.getConnectionUri()
        const pgClientLayer = PgClient.layer({
          url: Redacted.make(connectionUri)
        })

        yield* runMigrations(connectionUri)
        yield* cleanTables.pipe(Effect.provide(pgClientLayer))

        const teamId = crypto.randomUUID()
        const memberAddress = 'account_tdx_2_pending'

        yield* runWithRepo(pgClientLayer, (repo) =>
          Effect.gen(function* () {
            yield* repo.insert(teamId, 'Test Team', 'resource_tdx_2_badge1')
            yield* repo.addMember(teamId, memberAddress, false)
          })
        )

        // Unconfirmed member should not appear in listByMember
        const beforeConfirm = yield* runWithRepo(pgClientLayer, (repo) =>
          repo.listByMember(memberAddress)
        )
        expect(beforeConfirm).toHaveLength(0)

        // But should appear in getMembers as unconfirmed
        const allMembers = yield* runWithRepo(pgClientLayer, (repo) =>
          repo.getMembers(teamId)
        )
        expect(allMembers).toHaveLength(1)
        expect(allMembers[0]!.confirmed).toBe(false)

        // Confirm the member
        yield* runWithRepo(pgClientLayer, (repo) =>
          repo.confirmMember(teamId, memberAddress)
        )

        // Now should appear in listByMember
        const afterConfirm = yield* runWithRepo(pgClientLayer, (repo) =>
          repo.listByMember(memberAddress)
        )
        expect(afterConfirm).toHaveLength(1)
        expect(afterConfirm[0]!.name).toBe('Test Team')

        // And should be confirmed in getMembers
        const membersAfter = yield* runWithRepo(pgClientLayer, (repo) =>
          repo.getMembers(teamId)
        )
        expect(membersAfter[0]!.confirmed).toBe(true)
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )

  it.scopedLive(
    'removeMember deletes member record',
    () =>
      Effect.gen(function* () {
        const container = yield* PgContainer
        const connectionUri = container.getConnectionUri()
        const pgClientLayer = PgClient.layer({
          url: Redacted.make(connectionUri)
        })

        yield* runMigrations(connectionUri)
        yield* cleanTables.pipe(Effect.provide(pgClientLayer))

        const teamId = crypto.randomUUID()
        const member1 = 'account_tdx_2_alice'
        const member2 = 'account_tdx_2_bob'

        yield* runWithRepo(pgClientLayer, (repo) =>
          Effect.gen(function* () {
            yield* repo.insert(teamId, 'Test Team', 'resource_tdx_2_badge2')
            yield* repo.addMember(teamId, member1, true)
            yield* repo.addMember(teamId, member2, true)
          })
        )

        // Remove member2
        yield* runWithRepo(pgClientLayer, (repo) =>
          repo.removeMember(teamId, member2)
        )

        const members = yield* runWithRepo(pgClientLayer, (repo) =>
          repo.getMembers(teamId)
        )
        expect(members).toHaveLength(1)
        expect(members[0]!.accountAddress).toBe(member1)

        // member2 should no longer see the team
        const teamsForBob = yield* runWithRepo(pgClientLayer, (repo) =>
          repo.listByMember(member2)
        )
        expect(teamsForBob).toHaveLength(0)
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )

  it.scopedLive(
    'listByMember excludes unconfirmed members',
    () =>
      Effect.gen(function* () {
        const container = yield* PgContainer
        const connectionUri = container.getConnectionUri()
        const pgClientLayer = PgClient.layer({
          url: Redacted.make(connectionUri)
        })

        yield* runMigrations(connectionUri)
        yield* cleanTables.pipe(Effect.provide(pgClientLayer))

        const teamId = crypto.randomUUID()
        const confirmed = 'account_tdx_2_confirmed'
        const unconfirmed = 'account_tdx_2_unconfirmed'

        yield* runWithRepo(pgClientLayer, (repo) =>
          Effect.gen(function* () {
            yield* repo.insert(teamId, 'Mixed Team', 'resource_tdx_2_badge3')
            yield* repo.addMember(teamId, confirmed, true)
            yield* repo.addMember(teamId, unconfirmed, false)
          })
        )

        // Confirmed member sees the team
        const teamsForConfirmed = yield* runWithRepo(pgClientLayer, (repo) =>
          repo.listByMember(confirmed)
        )
        expect(teamsForConfirmed).toHaveLength(1)

        // Unconfirmed member does not
        const teamsForUnconfirmed = yield* runWithRepo(pgClientLayer, (repo) =>
          repo.listByMember(unconfirmed)
        )
        expect(teamsForUnconfirmed).toHaveLength(0)

        // But getMembers shows both
        const allMembers = yield* runWithRepo(pgClientLayer, (repo) =>
          repo.getMembers(teamId)
        )
        expect(allMembers).toHaveLength(2)
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )
})
