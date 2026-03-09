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
  AlreadySignedError,
  AppApi,
  CurrentSession,
  NotEligibleSignerError,
  ProposalNotFoundError,
  ProposalNotSignableError,
  ProposalPreviewFailedError,
  SessionMiddleware,
  SignerSourceMissingError,
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
import { AccessRuleValidator } from './gateway/accessRuleValidator'
import type { ParsedAccessRule } from './gateway/accessRuleValidator'
import { ListVaultsRepo } from './handlers/listVaultsRepo'
import { ProposalRepo } from './handlers/proposalRepo'
import { ProposalsHandler, createPublicKeyHash } from './handlers/proposals'
import { SignerSourceRepo } from './handlers/signerSourceRepo'
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
const TEST_USER_2 = 'account_tdx_2_1testuser2' as AccountAddress
const VAULT_ADDRESS = 'account_tdx_2_1qtestvault'

// Test public keys (valid 32-byte hex for ed25519)
const TEST_PUBLIC_KEY_1 =
  'a6b8bde20a317f0a98e95a0c88b81ec6a1f1f44d79bbdf0a8b6b2b5d3f8c2a1e'
const TEST_PUBLIC_KEY_2 =
  'b7c9cef31b428e1ba9fa6b1d99c92fd7b2e2e55e8acce01b9c7c3c6e4e9d3b2f'

// Pre-compute key hashes for the access rule mock
const TEST_KEY_HASH_1 = createPublicKeyHash(TEST_PUBLIC_KEY_1)
const TEST_KEY_HASH_2 = createPublicKeyHash(TEST_PUBLIC_KEY_2)

const ED25519_RESOURCE =
  'resource_rdx1nfxxxxxxxxxxed25sgxxxxxxxxx002236757237xxxxxxxxxed25sg'

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

// Mock AccessRuleValidator: 2-of-2 multisig with two ed25519 signers
const makeMockAccessRuleValidator = (accessRule: ParsedAccessRule) =>
  Layer.succeed(
    AccessRuleValidator,
    AccessRuleValidator.make({
      validate: () => Effect.succeed(accessRule)
    })
  )

const DEFAULT_ACCESS_RULE: ParsedAccessRule = {
  type: 'CountOf',
  count: 2,
  signers: [
    {
      resourceAddress: ED25519_RESOURCE,
      localId: `<${TEST_KEY_HASH_1}>`
    },
    {
      resourceAddress: ED25519_RESOURCE,
      localId: `<${TEST_KEY_HASH_2}>`
    }
  ]
}

const seedVault = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`TRUNCATE TABLE proposal_signatures RESTART IDENTITY CASCADE`
  yield* sql`TRUNCATE TABLE proposals RESTART IDENTITY CASCADE`
  yield* sql`TRUNCATE TABLE member_signer_sources CASCADE`
  yield* sql`TRUNCATE TABLE vaults CASCADE`
  yield* sql`
    INSERT INTO vaults (account_address, name)
    VALUES (${VAULT_ADDRESS}, 'Test Vault')
  `
})

const seedSignerSource = (
  accountAddress: string,
  publicKey: string,
  keyType: string
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      INSERT INTO member_signer_sources (account_address, public_key, key_type)
      VALUES (${accountAddress}, ${publicKey}, ${keyType})
      ON CONFLICT (account_address) DO UPDATE
      SET public_key = ${publicKey}, key_type = ${keyType}
    `
  })

const makeProposalHandlersLive = (
  previewLayer: Layer.Layer<PreviewTransaction>,
  accessRuleLayer: Layer.Layer<AccessRuleValidator>
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
      .handle('sign', ({ path: { vaultAddress, proposalId } }) =>
        Effect.gen(function* () {
          const session = yield* CurrentSession
          const proposalsHandler = yield* ProposalsHandler
          return yield* proposalsHandler.sign(
            vaultAddress,
            proposalId,
            session.accountAddress
          )
        }).pipe(
          Effect.catchTags({
            VaultNotFoundError: (e) =>
              new VaultNotFoundErrorSchema({ vaultAddress: e.vaultAddress }),
            ProposalNotFoundDbError: (e) =>
              new ProposalNotFoundError({ proposalId: e.proposalId }),
            ProposalNotSignableHandlerError: (e) =>
              new ProposalNotSignableError({ message: e.message }),
            SignerSourceMissingHandlerError: (e) =>
              new SignerSourceMissingError({ message: e.message }),
            NotEligibleSignerHandlerError: (e) =>
              new NotEligibleSignerError({ message: e.message }),
            AlreadySignedHandlerError: (e) =>
              new AlreadySignedError({ message: e.message })
          })
        )
      )
  ).pipe(
    Layer.provide(ProposalsHandler.Default),
    Layer.provide(ProposalRepo.Default),
    Layer.provide(ListVaultsRepo.Default),
    Layer.provide(SignerSourceRepo.Default),
    Layer.provide(accessRuleLayer),
    Layer.provide(previewLayer),
    Layer.provide(ORM.Default),
    Layer.provide(VaultsConfig.Live)
  )

const makeServerLive = (
  port: number,
  pgClientLayer: Layer.Layer<SqlClient.SqlClient, unknown>,
  previewLayer: Layer.Layer<PreviewTransaction>,
  accessRuleLayer: Layer.Layer<AccessRuleValidator>,
  sessionLayer?: Layer.Layer<SessionMiddleware>
) => {
  const ApiLive = HttpApiBuilder.api(AppApi).pipe(
    Layer.provide(MockAuthHandlersLive),
    Layer.provide(MockVaultHandlersLive),
    Layer.provide(MockTeamHandlersLive),
    Layer.provide(makeProposalHandlersLive(previewLayer, accessRuleLayer)),
    Layer.provide(HealthHandlersLive),
    Layer.provide(sessionLayer ?? MockSessionMiddleware)
  )

  return HttpApiBuilder.serve().pipe(
    Layer.provide(ApiLive),
    Layer.provide(NodeHttpServer.layer(() => createServer(), { port })),
    Layer.provideMerge(pgClientLayer)
  )
}

const defaultAccessRuleLayer = makeMockAccessRuleValidator(DEFAULT_ACCESS_RULE)

describe('proposal lifecycle e2e', () => {
  it.scopedLive(
    'creates a proposal, lists it, and retrieves detail with signature progress',
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
          makeServerLive(
            port,
            pgClientLayer,
            MockPreviewTransactionSuccess,
            defaultAccessRuleLayer
          )
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

          // Get detail — should include signature progress
          const detail = yield* client.proposals.detail({
            path: { vaultAddress, proposalId: 1 }
          })
          expect(detail.id).toBe(1)
          expect(detail.manifest).toBe(
            'CALL_METHOD Address("test") "deposit" ;'
          )
          expect(detail.maxProposerTimestamp).toBe('2026-12-31T23:59:59')
          expect(detail.signatureProgress.collected).toBe(0)
          expect(detail.signatureProgress.required).toBe(2)
          expect(detail.signatureProgress.signatures).toHaveLength(0)
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
          makeServerLive(
            port,
            pgClientLayer,
            MockPreviewTransactionFailure,
            defaultAccessRuleLayer
          )
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
          makeServerLive(
            port,
            pgClientLayer,
            MockPreviewTransactionSuccess,
            defaultAccessRuleLayer
          )
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

  it.scopedLive(
    'signs a proposal and transitions status from created to signing to ready',
    () =>
      Effect.gen(function* () {
        const container = yield* PgContainer
        const connectionUri = container.getConnectionUri()
        const pgClientLayer = PgClient.layer({
          url: Redacted.make(connectionUri)
        })

        yield* runMigrations(connectionUri)
        yield* seedVault.pipe(Effect.provide(pgClientLayer))

        // Seed signer source for TEST_USER
        yield* seedSignerSource(TEST_USER, TEST_PUBLIC_KEY_1, 'ed25519').pipe(
          Effect.provide(pgClientLayer)
        )

        // Seed signer source for TEST_USER_2
        yield* seedSignerSource(TEST_USER_2, TEST_PUBLIC_KEY_2, 'ed25519').pipe(
          Effect.provide(pgClientLayer)
        )

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

        const port = 3433
        yield* Layer.launch(
          makeServerLive(
            port,
            pgClientLayer,
            MockPreviewTransactionSuccess,
            defaultAccessRuleLayer
          )
        ).pipe(Effect.forkScoped)
        yield* Effect.sleep('250 millis')

        const apiFlow = Effect.gen(function* () {
          const client = yield* HttpApiClient.make(AppApi, {
            baseUrl: `http://localhost:${port}`
          })

          const vaultAddress = VaultAddress.make(VAULT_ADDRESS)

          // Create a proposal
          yield* client.proposals.create({
            path: { vaultAddress },
            payload: {
              manifest: 'CALL_METHOD Address("test") "deposit" ;',
              maxProposerTimestamp: '2026-12-31T23:59:59'
            }
          })

          // Sign as TEST_USER (first signer)
          const signResult = yield* client.proposals.sign({
            path: { vaultAddress, proposalId: 1 }
          })
          expect(signResult.ok).toBe(true)

          // Check status is now 'signing' (1 of 2 signatures)
          const detailAfterFirstSign = yield* client.proposals.detail({
            path: { vaultAddress, proposalId: 1 }
          })
          expect(detailAfterFirstSign.status).toBe('signing')
          expect(detailAfterFirstSign.signatureProgress.collected).toBe(1)
          expect(detailAfterFirstSign.signatureProgress.required).toBe(2)
          expect(
            detailAfterFirstSign.signatureProgress.signatures
          ).toHaveLength(1)
          expect(
            detailAfterFirstSign.signatureProgress.signatures[0]
              ?.signerAccountAddress
          ).toBe(TEST_USER)
        }).pipe(Effect.provide(FetchHttpClient.layer))

        yield* apiFlow

        // Sign as TEST_USER_2 (second signer) — need a new session
        const sessionLayer2 = Layer.succeed(
          SessionMiddleware,
          Effect.succeed({
            sessionId: 'test2',
            accountAddress: TEST_USER_2
          })
        )

        const port2 = 3434
        yield* Layer.launch(
          makeServerLive(
            port2,
            pgClientLayer,
            MockPreviewTransactionSuccess,
            defaultAccessRuleLayer,
            sessionLayer2
          )
        ).pipe(Effect.forkScoped)
        yield* Effect.sleep('250 millis')

        const apiFlow2 = Effect.gen(function* () {
          const client = yield* HttpApiClient.make(AppApi, {
            baseUrl: `http://localhost:${port2}`
          })

          const vaultAddress = VaultAddress.make(VAULT_ADDRESS)

          // Sign as TEST_USER_2 (second signer)
          const signResult2 = yield* client.proposals.sign({
            path: { vaultAddress, proposalId: 1 }
          })
          expect(signResult2.ok).toBe(true)

          // Check status is now 'ready' (2 of 2 signatures)
          const detailAfterSecondSign = yield* client.proposals.detail({
            path: { vaultAddress, proposalId: 1 }
          })
          expect(detailAfterSecondSign.status).toBe('ready')
          expect(detailAfterSecondSign.signatureProgress.collected).toBe(2)
          expect(detailAfterSecondSign.signatureProgress.required).toBe(2)
        }).pipe(Effect.provide(FetchHttpClient.layer))

        yield* apiFlow2
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )

  it.scopedLive(
    'rejects duplicate signature from same signer',
    () =>
      Effect.gen(function* () {
        const container = yield* PgContainer
        const connectionUri = container.getConnectionUri()
        const pgClientLayer = PgClient.layer({
          url: Redacted.make(connectionUri)
        })

        yield* runMigrations(connectionUri)
        yield* seedVault.pipe(Effect.provide(pgClientLayer))

        yield* seedSignerSource(TEST_USER, TEST_PUBLIC_KEY_1, 'ed25519').pipe(
          Effect.provide(pgClientLayer)
        )

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

        const port = 3435
        yield* Layer.launch(
          makeServerLive(
            port,
            pgClientLayer,
            MockPreviewTransactionSuccess,
            defaultAccessRuleLayer
          )
        ).pipe(Effect.forkScoped)
        yield* Effect.sleep('250 millis')

        const apiFlow = Effect.gen(function* () {
          const client = yield* HttpApiClient.make(AppApi, {
            baseUrl: `http://localhost:${port}`
          })

          const vaultAddress = VaultAddress.make(VAULT_ADDRESS)

          yield* client.proposals.create({
            path: { vaultAddress },
            payload: {
              manifest: 'CALL_METHOD Address("test") "deposit" ;',
              maxProposerTimestamp: '2026-12-31T23:59:59'
            }
          })

          // First sign succeeds
          yield* client.proposals.sign({
            path: { vaultAddress, proposalId: 1 }
          })

          // Second sign from same user should fail
          const dupResult = yield* client.proposals
            .sign({
              path: { vaultAddress, proposalId: 1 }
            })
            .pipe(Effect.either)

          expect(dupResult._tag).toBe('Left')
        }).pipe(Effect.provide(FetchHttpClient.layer))

        yield* apiFlow
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )

  it.scopedLive(
    'rejects sign when signer source is missing',
    () =>
      Effect.gen(function* () {
        const container = yield* PgContainer
        const connectionUri = container.getConnectionUri()
        const pgClientLayer = PgClient.layer({
          url: Redacted.make(connectionUri)
        })

        yield* runMigrations(connectionUri)
        yield* seedVault.pipe(Effect.provide(pgClientLayer))
        // NOT seeding signer source for TEST_USER

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

        const port = 3436
        yield* Layer.launch(
          makeServerLive(
            port,
            pgClientLayer,
            MockPreviewTransactionSuccess,
            defaultAccessRuleLayer
          )
        ).pipe(Effect.forkScoped)
        yield* Effect.sleep('250 millis')

        const apiFlow = Effect.gen(function* () {
          const client = yield* HttpApiClient.make(AppApi, {
            baseUrl: `http://localhost:${port}`
          })

          const vaultAddress = VaultAddress.make(VAULT_ADDRESS)

          yield* client.proposals.create({
            path: { vaultAddress },
            payload: {
              manifest: 'CALL_METHOD Address("test") "deposit" ;',
              maxProposerTimestamp: '2026-12-31T23:59:59'
            }
          })

          const result = yield* client.proposals
            .sign({
              path: { vaultAddress, proposalId: 1 }
            })
            .pipe(Effect.either)

          expect(result._tag).toBe('Left')
        }).pipe(Effect.provide(FetchHttpClient.layer))

        yield* apiFlow
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )
})
