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
import { ImportVaultRepo } from './importVaultRepo'
import { VaultAlreadyExistsError } from '@radix-vaults/shared'

const TEAM_A = '00000000-0000-0000-0000-00000000000a'
const TEAM_B = '00000000-0000-0000-0000-00000000000b'
const VAULT = VaultAddress.make('account_tdx_2_1qshared')

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

const seedTeams = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`TRUNCATE TABLE proposals RESTART IDENTITY CASCADE`
  yield* sql`TRUNCATE TABLE vaults CASCADE`
  yield* sql`TRUNCATE TABLE teams CASCADE`
  yield* sql`
    INSERT INTO teams (id, name, badge_address) VALUES
      (${TEAM_A}, 'Team Alpha', 'resource_tdx_2_1badge_a'),
      (${TEAM_B}, 'Team Beta', 'resource_tdx_2_1badge_b')
  `
})

const runWithRepo = <A>(
  pgClientLayer: ReturnType<typeof PgClient.layer>,
  f: (repo: ImportVaultRepo) => Effect.Effect<A, unknown, never>
) =>
  Effect.gen(function* () {
    const repo = yield* ImportVaultRepo
    return yield* f(repo)
  }).pipe(
    Effect.provide(ImportVaultRepo.Default),
    Effect.provide(ORM.Default),
    Effect.provide(pgClientLayer)
  )

describe('ImportVaultRepo', () => {
  it.scopedLive(
    'imports vault with teamId and accountAddress',
    () =>
      Effect.gen(function* () {
        const container = yield* PgContainer
        const connectionUri = container.getConnectionUri()
        const pgClientLayer = PgClient.layer({
          url: Redacted.make(connectionUri)
        })

        yield* runMigrations(connectionUri)
        yield* seedTeams.pipe(Effect.provide(pgClientLayer))

        const result = yield* runWithRepo(pgClientLayer, (repo) =>
          repo.insert(TEAM_A, VAULT, 'Shared Vault')
        )

        expect(result.accountAddress).toBe(VAULT)
        expect(result.name).toBe('Shared Vault')
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )

  it.scopedLive(
    'allows same vault address in different teams',
    () =>
      Effect.gen(function* () {
        const container = yield* PgContainer
        const connectionUri = container.getConnectionUri()
        const pgClientLayer = PgClient.layer({
          url: Redacted.make(connectionUri)
        })

        yield* runMigrations(connectionUri)
        yield* seedTeams.pipe(Effect.provide(pgClientLayer))

        // Import same vault in team A
        const resultA = yield* runWithRepo(pgClientLayer, (repo) =>
          repo.insert(TEAM_A, VAULT, 'Vault in A')
        )
        expect(resultA.accountAddress).toBe(VAULT)

        // Import same vault address in team B — should succeed
        const resultB = yield* runWithRepo(pgClientLayer, (repo) =>
          repo.insert(TEAM_B, VAULT, 'Vault in B')
        )
        expect(resultB.accountAddress).toBe(VAULT)
        expect(resultB.name).toBe('Vault in B')
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )

  it.scopedLive(
    'rejects duplicate import within same team',
    () =>
      Effect.gen(function* () {
        const container = yield* PgContainer
        const connectionUri = container.getConnectionUri()
        const pgClientLayer = PgClient.layer({
          url: Redacted.make(connectionUri)
        })

        yield* runMigrations(connectionUri)
        yield* seedTeams.pipe(Effect.provide(pgClientLayer))

        yield* runWithRepo(pgClientLayer, (repo) =>
          repo.insert(TEAM_A, VAULT, 'First Import')
        )

        // Same vault + same team → VaultAlreadyExistsError
        const result = yield* runWithRepo(pgClientLayer, (repo) =>
          Effect.either(repo.insert(TEAM_A, VAULT, 'Duplicate'))
        )

        expect(result._tag).toBe('Left')
        if (result._tag === 'Left') {
          expect(result.left).toBeInstanceOf(VaultAlreadyExistsError)
        }
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )
})
