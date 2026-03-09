import {
  FetchHttpClient,
  HttpApiBuilder,
  HttpApiClient
} from '@effect/platform'
import { NodeHttpServer } from '@effect/platform-node'
import { PgClient } from '@effect/sql-pg'
import { SqlClient } from '@effect/sql'
import {
  type AccountAddress,
  type HexString,
  AppApi,
  CurrentSession,
  ProposalNotFoundError,
  ProposalPreviewFailedError,
  SessionMiddleware,
  VaultAddress,
  VaultNotFoundErrorSchema,
  VaultsConfig
} from '@radix-vaults/shared'
import { PreviewTransaction } from '@radix-effects/gateway'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Data, Effect, Layer, Redacted } from 'effect'
import { describe, expect, it } from '@effect/vitest'
import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import pg from 'pg'
import { ORM } from './db/orm'
import { ListVaultsRepo } from './handlers/listVaultsRepo'
import { ProposalRepo } from './handlers/proposalRepo'
import { ProposalsHandler } from './handlers/proposals'
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

const TEST_USER = 'account_tdx_2_1testuser' as AccountAddress
const VAULT_ADDRESS = 'account_tdx_2_1qtestvault'

const MockSessionMiddleware = Layer.succeed(
  SessionMiddleware,
  Effect.succeed({
    sessionId: 'test',
    accountAddress: TEST_USER
  })
)

const MockAuthHandlersLive = HttpApiBuilder.group(AppApi, 'auth', (handlers) =>
  handlers
    .handle('createChallenge', () =>
      Effect.succeed({ challenge: 'mock' as HexString })
    )
    .handle('verify', () =>
      Effect.succeed({
        accountAddress: 'mock' as AccountAddress,
        expiresAt: 'mock'
      })
    )
    .handle('getSession', () =>
      Effect.succeed({ accountAddress: 'mock' as AccountAddress })
    )
    .handle('logout', () => Effect.succeed({ ok: true as const }))
)

const MockVaultHandlersLive = HttpApiBuilder.group(
  AppApi,
  'vaults',
  (handlers) =>
    handlers
      .handle('list', () => Effect.succeed([]))
      .handle('detail', () =>
        Effect.succeed({
          accountAddress: 'mock' as any,
          name: 'mock',
          pendingProposalCount: 0,
          balanceXrd: '0'
        })
      )
      .handle('signers', () =>
        Effect.succeed({
          vaultAddress: 'mock' as any,
          threshold: 0,
          signers: []
        })
      )
      .handle('importVault', () =>
        Effect.succeed({ accountAddress: 'mock' as any, name: 'mock' })
      )
)

const MockTeamHandlersLive = HttpApiBuilder.group(AppApi, 'team', (handlers) =>
  handlers
    .handle('overview', () =>
      Effect.succeed({
        teamAccountAddress: 'mock' as any,
        threshold: 0,
        signers: [],
        memberSignerSources: [],
        hasMismatch: false
      })
    )
    .handle('setSignerSource', () =>
      Effect.succeed({
        accountAddress: 'mock',
        publicKey: 'mock',
        keyType: 'ed25519' as const
      })
    )
    .handle('clearSignerSource', () => Effect.succeed({ ok: true as const }))
)

const HealthHandlersLive = HttpApiBuilder.group(AppApi, 'health', (handlers) =>
  handlers.handle('check', () => Effect.succeed({ status: 'ok' }))
)

// Mock PreviewTransaction that succeeds
const MockPreviewTransactionSuccess = Layer.succeed(
  PreviewTransaction,
  PreviewTransaction.make((_input) =>
    Effect.succeed({ receipt: { status: 'Succeeded' } } as any)
  )
)

// Mock PreviewTransaction that fails
const MockPreviewTransactionFailure = Layer.succeed(
  PreviewTransaction,
  PreviewTransaction.make((_input) =>
    Effect.fail(
      new (Data.TaggedError('TransactionPreviewError') as any)({
        message: 'Invalid manifest syntax'
      })
    )
  )
)

const seedVault = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`TRUNCATE TABLE proposals RESTART IDENTITY CASCADE`
  yield* sql`TRUNCATE TABLE vaults CASCADE`
  yield* sql`
    INSERT INTO vaults (account_address, name)
    VALUES (${VAULT_ADDRESS}, 'Test Vault')
  `
})

const makeProposalHandlersLive = (
  previewLayer: Layer.Layer<PreviewTransaction>
) =>
  HttpApiBuilder.group(AppApi, 'proposals', (handlers) =>
    handlers
      .handle(
        'create',
        ({
          path: { vaultAddress },
          payload: { manifest, maxProposerTimestamp }
        }) =>
          Effect.gen(function* () {
            const session = yield* CurrentSession
            const proposalsHandler = yield* ProposalsHandler
            return yield* proposalsHandler.create(
              vaultAddress,
              manifest,
              maxProposerTimestamp,
              session.accountAddress
            )
          }).pipe(
            Effect.catchTags({
              VaultNotFoundError: (e) =>
                new VaultNotFoundErrorSchema({
                  vaultAddress: e.vaultAddress
                }),
              ManifestPreviewFailedError: (e) =>
                new ProposalPreviewFailedError({ message: e.message })
            })
          )
      )
      .handle('list', ({ path: { vaultAddress } }) =>
        Effect.gen(function* () {
          const proposalsHandler = yield* ProposalsHandler
          return yield* proposalsHandler.list(vaultAddress)
        }).pipe(
          Effect.catchTags({
            VaultNotFoundError: (e) =>
              new VaultNotFoundErrorSchema({
                vaultAddress: e.vaultAddress
              })
          })
        )
      )
      .handle('detail', ({ path: { vaultAddress, proposalId } }) =>
        Effect.gen(function* () {
          const proposalsHandler = yield* ProposalsHandler
          return yield* proposalsHandler.getDetail(vaultAddress, proposalId)
        }).pipe(
          Effect.catchTags({
            VaultNotFoundError: (e) =>
              new VaultNotFoundErrorSchema({
                vaultAddress: e.vaultAddress
              }),
            ProposalNotFoundDbError: (e) =>
              new ProposalNotFoundError({ proposalId: e.proposalId })
          })
        )
      )
  ).pipe(
    Layer.provide(ProposalsHandler.Default),
    Layer.provide(ProposalRepo.Default),
    Layer.provide(ListVaultsRepo.Default),
    Layer.provide(previewLayer),
    Layer.provide(ORM.Default),
    Layer.provide(VaultsConfig.Live)
  )

const makeServerLive = (
  port: number,
  pgClientLayer: Layer.Layer<SqlClient.SqlClient, unknown>,
  previewLayer: Layer.Layer<PreviewTransaction>
) => {
  const ApiLive = HttpApiBuilder.api(AppApi).pipe(
    Layer.provide(MockAuthHandlersLive),
    Layer.provide(MockVaultHandlersLive),
    Layer.provide(MockTeamHandlersLive),
    Layer.provide(makeProposalHandlersLive(previewLayer)),
    Layer.provide(HealthHandlersLive),
    Layer.provide(MockSessionMiddleware)
  )

  return HttpApiBuilder.serve().pipe(
    Layer.provide(ApiLive),
    Layer.provide(NodeHttpServer.layer(() => createServer(), { port })),
    Layer.provideMerge(pgClientLayer)
  )
}

describe('proposal lifecycle e2e', () => {
  it.scopedLive(
    'creates a proposal, lists it, and retrieves detail',
    () =>
      Effect.gen(function* () {
        const container = yield* PgContainer
        const connectionUri = container.getConnectionUri()
        const pgClientLayer = PgClient.layer({
          url: Redacted.make(connectionUri)
        })

        yield* runMigrations(connectionUri)
        yield* seedVault.pipe(Effect.provide(pgClientLayer))

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

        const port = 3430
        yield* Layer.launch(
          makeServerLive(port, pgClientLayer, MockPreviewTransactionSuccess)
        ).pipe(Effect.forkScoped)
        yield* Effect.sleep('250 millis')

        const apiFlow = Effect.gen(function* () {
          const client = yield* HttpApiClient.make(AppApi, {
            baseUrl: `http://localhost:${port}`
          })

          const vaultAddress = VaultAddress.make(VAULT_ADDRESS)

          // Create a proposal
          const created = yield* client.proposals.create({
            path: { vaultAddress },
            payload: {
              manifest: 'CALL_METHOD Address("test") "deposit" ;',
              maxProposerTimestamp: '2026-12-31T23:59:59'
            }
          })
          expect(created.id).toBe(1)
          expect(created.status).toBe('created')
          expect(created.manifest).toBe(
            'CALL_METHOD Address("test") "deposit" ;'
          )
          expect(created.createdBy).toBe(TEST_USER)

          // List proposals
          const list = yield* client.proposals.list({
            path: { vaultAddress }
          })
          expect(list).toHaveLength(1)
          expect(list[0]?.id).toBe(1)
          expect(list[0]?.status).toBe('created')

          // Get detail
          const detail = yield* client.proposals.detail({
            path: { vaultAddress, proposalId: 1 }
          })
          expect(detail.id).toBe(1)
          expect(detail.manifest).toBe(
            'CALL_METHOD Address("test") "deposit" ;'
          )
          expect(detail.maxProposerTimestamp).toBe('2026-12-31T23:59:59')
        }).pipe(Effect.provide(FetchHttpClient.layer))

        yield* apiFlow
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )

  it.scopedLive(
    'rejects proposal when preview fails with 422',
    () =>
      Effect.gen(function* () {
        const container = yield* PgContainer
        const connectionUri = container.getConnectionUri()
        const pgClientLayer = PgClient.layer({
          url: Redacted.make(connectionUri)
        })

        yield* runMigrations(connectionUri)
        yield* seedVault.pipe(Effect.provide(pgClientLayer))

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

        const port = 3431
        yield* Layer.launch(
          makeServerLive(port, pgClientLayer, MockPreviewTransactionFailure)
        ).pipe(Effect.forkScoped)
        yield* Effect.sleep('250 millis')

        const apiFlow = Effect.gen(function* () {
          const client = yield* HttpApiClient.make(AppApi, {
            baseUrl: `http://localhost:${port}`
          })

          const vaultAddress = VaultAddress.make(VAULT_ADDRESS)

          const result = yield* client.proposals
            .create({
              path: { vaultAddress },
              payload: {
                manifest: 'INVALID MANIFEST',
                maxProposerTimestamp: '2026-12-31T23:59:59'
              }
            })
            .pipe(Effect.either)

          expect(result._tag).toBe('Left')

          // Verify no proposal was persisted
          const list = yield* client.proposals.list({
            path: { vaultAddress }
          })
          expect(list).toHaveLength(0)
        }).pipe(Effect.provide(FetchHttpClient.layer))

        yield* apiFlow
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )

  it.scopedLive(
    'returns 404 for non-existent proposal detail',
    () =>
      Effect.gen(function* () {
        const container = yield* PgContainer
        const connectionUri = container.getConnectionUri()
        const pgClientLayer = PgClient.layer({
          url: Redacted.make(connectionUri)
        })

        yield* runMigrations(connectionUri)
        yield* seedVault.pipe(Effect.provide(pgClientLayer))

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

        const port = 3432
        yield* Layer.launch(
          makeServerLive(port, pgClientLayer, MockPreviewTransactionSuccess)
        ).pipe(Effect.forkScoped)
        yield* Effect.sleep('250 millis')

        const apiFlow = Effect.gen(function* () {
          const client = yield* HttpApiClient.make(AppApi, {
            baseUrl: `http://localhost:${port}`
          })

          const vaultAddress = VaultAddress.make(VAULT_ADDRESS)

          const result = yield* client.proposals
            .detail({
              path: { vaultAddress, proposalId: 9999 }
            })
            .pipe(Effect.either)

          expect(result._tag).toBe('Left')
        }).pipe(Effect.provide(FetchHttpClient.layer))

        yield* apiFlow
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )
})
