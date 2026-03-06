import { FetchHttpClient, HttpLayerRouter } from '@effect/platform'
import { NodeHttpServer } from '@effect/platform-node'
import { RpcClient, RpcSerialization, RpcServer } from '@effect/rpc'
import { PgClient } from '@effect/sql-pg'
import { SqlClient } from '@effect/sql'
import { AppRpc, VaultAddress } from '@radix-vaults/shared'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Effect, Layer, Redacted } from 'effect'
import { describe, expect, it } from '@effect/vitest'
import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import pg from 'pg'
import { AppRpcHandlersLive } from './rpc/handlers'
import { PgContainer } from './test/PgContainer'

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

const seedReadFlowData = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  yield* sql`TRUNCATE TABLE proposals RESTART IDENTITY CASCADE`
  yield* sql`TRUNCATE TABLE vaults CASCADE`

  yield* sql`
    INSERT INTO vaults (account_address, name)
    VALUES
      ('account_tdx_2_1qalpha', 'Alpha Vault'),
      ('account_tdx_2_1qbeta', 'Beta Vault')
  `

  yield* sql`
    INSERT INTO proposals (vault_address, status)
    VALUES
      ('account_tdx_2_1qalpha', 'created'),
      ('account_tdx_2_1qalpha', 'submitted'),
      ('account_tdx_2_1qbeta', 'signing')
  `
})

const makeServerLive = (
  port: number,
  pgClientLayer: Layer.Layer<SqlClient.SqlClient, unknown>
) =>
  HttpLayerRouter.serve(
    RpcServer.layerHttpRouter({
      group: AppRpc,
      path: '/rpc',
      protocol: 'http'
    }).pipe(
      Layer.provide(AppRpcHandlersLive),
      Layer.provide(RpcSerialization.layerJson)
    )
  ).pipe(
    Layer.provide(NodeHttpServer.layer(() => createServer(), { port })),
    Layer.provideMerge(pgClientLayer)
  )

describe('vault read flow e2e', () => {
  it.scopedLive(
    'covers list -> detail -> signer display flow',
    () =>
      Effect.gen(function* () {
        const container = yield* PgContainer
        const connectionUri = container.getConnectionUri()
        const migrationsFolder = resolveMigrationsFolder()

        expect(existsSync(migrationsFolder)).toBe(true)

        const pgClientLayer = PgClient.layer({
          url: Redacted.make(connectionUri)
        })

        yield* runMigrations(connectionUri)
        yield* seedReadFlowData.pipe(Effect.provide(pgClientLayer))

        const previousTeamAccountAddress = process.env.TEAM_ACCOUNT_ADDRESS
        process.env.TEAM_ACCOUNT_ADDRESS = 'account_tdx_2_1qteam'
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            if (previousTeamAccountAddress === undefined) {
              delete process.env.TEAM_ACCOUNT_ADDRESS
            } else {
              process.env.TEAM_ACCOUNT_ADDRESS = previousTeamAccountAddress
            }
          })
        )

        const port = 3301
        yield* Layer.launch(makeServerLive(port, pgClientLayer)).pipe(
          Effect.forkScoped
        )
        yield* Effect.sleep('250 millis')

        const rpcFlow = Effect.gen(function* () {
          const client = yield* RpcClient.make(AppRpc)

          const list = yield* client.ListVaults({})
          expect(list).toHaveLength(2)
          expect(list[0]?.name).toBe('Alpha Vault')
          expect(list[0]?.pendingProposalCount).toBe(1)
          expect(list[1]?.name).toBe('Beta Vault')
          expect(list[1]?.pendingProposalCount).toBe(1)

          const detail = yield* client.GetVaultDetail({
            vaultAddress: VaultAddress.make('account_tdx_2_1qalpha')
          })
          expect(detail.name).toBe('Alpha Vault')
          expect(detail.pendingProposalCount).toBe(1)
          expect(detail.balanceXrd).toBe('0')

          const signers = yield* client.GetVaultSigners({
            vaultAddress: VaultAddress.make('account_tdx_2_1qalpha')
          })
          expect(signers.threshold).toBe(0)
          expect(signers.signers).toHaveLength(0)
        }).pipe(
          Effect.scoped,
          Effect.provide(
            RpcClient.layerProtocolHttp({ url: `http://localhost:${port}/rpc` })
          ),
          Effect.provide(RpcSerialization.layerJson),
          Effect.provide(FetchHttpClient.layer)
        )

        yield* rpcFlow
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )
})
