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
  ProposalExpiredError,
  ProposalInvalidError,
  ProposalNotFoundError,
  ProposalNotReadyError,
  ProposalNotSignableError,
  ProposalNotSubmittedError,
  ProposalPreviewFailedError,
  ProposalStatusCheckFailedError,
  ProposalSubmitFailedError,
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
import { TransactionStatusChecker } from './gateway/transactionStatusChecker'
import { TransactionSubmitter } from './gateway/transactionSubmitter'
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

// Mock TransactionSubmitter that succeeds with a deterministic hash
const MockTransactionSubmitterSuccess = Layer.succeed(
  TransactionSubmitter,
  TransactionSubmitter.make((_input) =>
    Effect.succeed({ intentHash: 'txid_test_abc123def456' })
  )
)

// Mock TransactionSubmitter that fails
const MockTransactionSubmitterFailure = Layer.succeed(
  TransactionSubmitter,
  TransactionSubmitter.make((_input) =>
    Effect.fail(
      new (Data.TaggedError('TransactionSubmitError') as any)({
        message: 'Fee payer not configured'
      })
    )
  )
)

// Mock TransactionStatusChecker that returns CommittedSuccess
const MockTransactionStatusCheckerCommitted = Layer.succeed(
  TransactionStatusChecker,
  TransactionStatusChecker.make((_input) =>
    Effect.succeed({ intentStatus: 'CommittedSuccess' as const })
  )
)

// Mock TransactionStatusChecker that returns CommittedFailure
const MockTransactionStatusCheckerFailed = Layer.succeed(
  TransactionStatusChecker,
  TransactionStatusChecker.make((_input) =>
    Effect.succeed({ intentStatus: 'CommittedFailure' as const })
  )
)

// Mock TransactionStatusChecker that returns Pending
const MockTransactionStatusCheckerPending = Layer.succeed(
  TransactionStatusChecker,
  TransactionStatusChecker.make((_input) =>
    Effect.succeed({ intentStatus: 'Pending' as const })
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
  accessRuleLayer: Layer.Layer<AccessRuleValidator>,
  transactionSubmitterLayer: Layer.Layer<TransactionSubmitter> = MockTransactionSubmitterSuccess,
  transactionStatusCheckerLayer: Layer.Layer<TransactionStatusChecker> = MockTransactionStatusCheckerPending
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
            ProposalExpiredHandlerError: (e) =>
              new ProposalExpiredError({ message: e.message }),
            SignerSourceMissingHandlerError: (e) =>
              new SignerSourceMissingError({ message: e.message }),
            NotEligibleSignerHandlerError: (e) =>
              new NotEligibleSignerError({ message: e.message }),
            AlreadySignedHandlerError: (e) =>
              new AlreadySignedError({ message: e.message })
          })
        )
      )
      .handle('submit', ({ path: { vaultAddress, proposalId } }) =>
        Effect.gen(function* () {
          const proposalsHandler = yield* ProposalsHandler
          return yield* proposalsHandler.submit(vaultAddress, proposalId)
        }).pipe(
          Effect.catchTags({
            VaultNotFoundError: (e) =>
              new VaultNotFoundErrorSchema({ vaultAddress: e.vaultAddress }),
            ProposalNotFoundDbError: (e) =>
              new ProposalNotFoundError({ proposalId: e.proposalId }),
            ProposalNotReadyHandlerError: (e) =>
              new ProposalNotReadyError({ message: e.message }),
            ProposalExpiredHandlerError: (e) =>
              new ProposalExpiredError({ message: e.message }),
            ProposalInvalidHandlerError: (e) =>
              new ProposalInvalidError({ message: e.message }),
            ProposalSubmitFailedHandlerError: (e) =>
              new ProposalSubmitFailedError({ message: e.message })
          })
        )
      )
      .handle('refreshStatus', ({ path: { vaultAddress, proposalId } }) =>
        Effect.gen(function* () {
          const proposalsHandler = yield* ProposalsHandler
          return yield* proposalsHandler.refreshStatus(vaultAddress, proposalId)
        }).pipe(
          Effect.catchTags({
            VaultNotFoundError: (e) =>
              new VaultNotFoundErrorSchema({ vaultAddress: e.vaultAddress }),
            ProposalNotFoundDbError: (e) =>
              new ProposalNotFoundError({ proposalId: e.proposalId }),
            ProposalNotSubmittedHandlerError: (e) =>
              new ProposalNotSubmittedError({ message: e.message }),
            ProposalStatusCheckFailedHandlerError: (e) =>
              new ProposalStatusCheckFailedError({ message: e.message })
          })
        )
      )
  ).pipe(
    Layer.provide(ProposalsHandler.Default),
    Layer.provide(ProposalRepo.Default),
    Layer.provide(ListVaultsRepo.Default),
    Layer.provide(SignerSourceRepo.Default),
    Layer.provide(transactionSubmitterLayer),
    Layer.provide(transactionStatusCheckerLayer),
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
  sessionLayer?: Layer.Layer<SessionMiddleware>,
  transactionSubmitterLayer?: Layer.Layer<TransactionSubmitter>,
  transactionStatusCheckerLayer?: Layer.Layer<TransactionStatusChecker>
) => {
  const ApiLive = HttpApiBuilder.api(AppApi).pipe(
    Layer.provide(MockAuthHandlersLive),
    Layer.provide(MockVaultHandlersLive),
    Layer.provide(MockTeamHandlersLive),
    Layer.provide(
      makeProposalHandlersLive(
        previewLayer,
        accessRuleLayer,
        transactionSubmitterLayer,
        transactionStatusCheckerLayer
      )
    ),
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

  it.scopedLive(
    'submits a ready proposal and returns intent hash',
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

        // Start server with TEST_USER session
        const port = 3437
        yield* Layer.launch(
          makeServerLive(
            port,
            pgClientLayer,
            MockPreviewTransactionSuccess,
            defaultAccessRuleLayer
          )
        ).pipe(Effect.forkScoped)
        yield* Effect.sleep('250 millis')

        // Create proposal and sign as TEST_USER
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
          yield* client.proposals.sign({
            path: { vaultAddress, proposalId: 1 }
          })
        }).pipe(Effect.provide(FetchHttpClient.layer))
        yield* apiFlow

        // Sign as TEST_USER_2 to reach threshold
        const sessionLayer2 = Layer.succeed(
          SessionMiddleware,
          Effect.succeed({
            sessionId: 'test2',
            accountAddress: TEST_USER_2
          })
        )
        const port2 = 3438
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

          yield* client.proposals.sign({
            path: { vaultAddress, proposalId: 1 }
          })

          // Proposal should now be ready — submit it
          const submitResult = yield* client.proposals.submit({
            path: { vaultAddress, proposalId: 1 }
          })
          expect(submitResult.intentHash).toBe('txid_test_abc123def456')
          expect(submitResult.status).toBe('submitted')

          // Verify detail shows submitted status and tx info
          const detail = yield* client.proposals.detail({
            path: { vaultAddress, proposalId: 1 }
          })
          expect(detail.status).toBe('submitted')
          expect(detail.transactionIntentHash).toBe('txid_test_abc123def456')
          expect(detail.submittedAt).toBeTruthy()
        }).pipe(Effect.provide(FetchHttpClient.layer))

        yield* apiFlow2
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )

  it.scopedLive(
    'returns same intent hash on duplicate submit (idempotent)',
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

        const port = 3439
        yield* Layer.launch(
          makeServerLive(
            port,
            pgClientLayer,
            MockPreviewTransactionSuccess,
            defaultAccessRuleLayer
          )
        ).pipe(Effect.forkScoped)
        yield* Effect.sleep('250 millis')

        // Create + sign as USER1
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
          yield* client.proposals.sign({
            path: { vaultAddress, proposalId: 1 }
          })
        }).pipe(Effect.provide(FetchHttpClient.layer))
        yield* apiFlow

        // Sign as USER2 to reach threshold
        const sessionLayer2 = Layer.succeed(
          SessionMiddleware,
          Effect.succeed({
            sessionId: 'test2',
            accountAddress: TEST_USER_2
          })
        )
        const port2 = 3440
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

          yield* client.proposals.sign({
            path: { vaultAddress, proposalId: 1 }
          })

          // First submit
          const first = yield* client.proposals.submit({
            path: { vaultAddress, proposalId: 1 }
          })
          expect(first.intentHash).toBe('txid_test_abc123def456')

          // Second submit — idempotent, same result
          const second = yield* client.proposals.submit({
            path: { vaultAddress, proposalId: 1 }
          })
          expect(second.intentHash).toBe('txid_test_abc123def456')
          expect(second.status).toBe('submitted')
        }).pipe(Effect.provide(FetchHttpClient.layer))

        yield* apiFlow2
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )

  it.scopedLive(
    'rejects submit for non-ready proposal with 422',
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

        const port = 3441
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

          // Create proposal (status = created, not ready)
          yield* client.proposals.create({
            path: { vaultAddress },
            payload: {
              manifest: 'CALL_METHOD Address("test") "deposit" ;',
              maxProposerTimestamp: '2026-12-31T23:59:59'
            }
          })

          // Try to submit — should fail because proposal is not ready
          const result = yield* client.proposals
            .submit({
              path: { vaultAddress, proposalId: 1 }
            })
            .pipe(Effect.either)

          expect(result._tag).toBe('Left')
        }).pipe(Effect.provide(FetchHttpClient.layer))

        yield* apiFlow
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )

  it.scopedLive(
    'refreshes submitted proposal status to committed when Gateway reports success',
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

        // Start server with TEST_USER session
        const port = 3442
        yield* Layer.launch(
          makeServerLive(
            port,
            pgClientLayer,
            MockPreviewTransactionSuccess,
            defaultAccessRuleLayer
          )
        ).pipe(Effect.forkScoped)
        yield* Effect.sleep('250 millis')

        // Create + sign as USER1
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
          yield* client.proposals.sign({
            path: { vaultAddress, proposalId: 1 }
          })
        }).pipe(Effect.provide(FetchHttpClient.layer))
        yield* apiFlow

        // Sign as USER2 to reach threshold
        const sessionLayer2 = Layer.succeed(
          SessionMiddleware,
          Effect.succeed({
            sessionId: 'test2',
            accountAddress: TEST_USER_2
          })
        )
        const port2 = 3443
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

        // Sign as USER2 + submit
        const apiFlow2 = Effect.gen(function* () {
          const client = yield* HttpApiClient.make(AppApi, {
            baseUrl: `http://localhost:${port2}`
          })
          const vaultAddress = VaultAddress.make(VAULT_ADDRESS)

          yield* client.proposals.sign({
            path: { vaultAddress, proposalId: 1 }
          })
          yield* client.proposals.submit({
            path: { vaultAddress, proposalId: 1 }
          })
        }).pipe(Effect.provide(FetchHttpClient.layer))
        yield* apiFlow2

        // Start a new server with CommittedSuccess status checker
        const port3 = 3444
        yield* Layer.launch(
          makeServerLive(
            port3,
            pgClientLayer,
            MockPreviewTransactionSuccess,
            defaultAccessRuleLayer,
            undefined,
            undefined,
            MockTransactionStatusCheckerCommitted
          )
        ).pipe(Effect.forkScoped)
        yield* Effect.sleep('250 millis')

        // Refresh status — should transition to committed
        const apiFlow3 = Effect.gen(function* () {
          const client = yield* HttpApiClient.make(AppApi, {
            baseUrl: `http://localhost:${port3}`
          })
          const vaultAddress = VaultAddress.make(VAULT_ADDRESS)

          const result = yield* client.proposals.refreshStatus({
            path: { vaultAddress, proposalId: 1 }
          })
          expect(result.status).toBe('committed')
          expect(result.transactionIntentHash).toBe('txid_test_abc123def456')
          expect(result.submittedAt).toBeTruthy()

          // Verify proposal detail also reflects committed
          const detail = yield* client.proposals.detail({
            path: { vaultAddress, proposalId: 1 }
          })
          expect(detail.status).toBe('committed')
        }).pipe(Effect.provide(FetchHttpClient.layer))

        yield* apiFlow3
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )

  it.scopedLive(
    'refreshes submitted proposal status to failed when Gateway reports failure',
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

        const port = 3445
        yield* Layer.launch(
          makeServerLive(
            port,
            pgClientLayer,
            MockPreviewTransactionSuccess,
            defaultAccessRuleLayer
          )
        ).pipe(Effect.forkScoped)
        yield* Effect.sleep('250 millis')

        // Create + sign as USER1
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
          yield* client.proposals.sign({
            path: { vaultAddress, proposalId: 1 }
          })
        }).pipe(Effect.provide(FetchHttpClient.layer))
        yield* apiFlow

        // Sign as USER2 + submit
        const sessionLayer2 = Layer.succeed(
          SessionMiddleware,
          Effect.succeed({
            sessionId: 'test2',
            accountAddress: TEST_USER_2
          })
        )
        const port2 = 3446
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

          yield* client.proposals.sign({
            path: { vaultAddress, proposalId: 1 }
          })
          yield* client.proposals.submit({
            path: { vaultAddress, proposalId: 1 }
          })
        }).pipe(Effect.provide(FetchHttpClient.layer))
        yield* apiFlow2

        // Start server with Failed status checker
        const port3 = 3447
        yield* Layer.launch(
          makeServerLive(
            port3,
            pgClientLayer,
            MockPreviewTransactionSuccess,
            defaultAccessRuleLayer,
            undefined,
            undefined,
            MockTransactionStatusCheckerFailed
          )
        ).pipe(Effect.forkScoped)
        yield* Effect.sleep('250 millis')

        // Refresh status — should transition to failed
        const apiFlow3 = Effect.gen(function* () {
          const client = yield* HttpApiClient.make(AppApi, {
            baseUrl: `http://localhost:${port3}`
          })
          const vaultAddress = VaultAddress.make(VAULT_ADDRESS)

          const result = yield* client.proposals.refreshStatus({
            path: { vaultAddress, proposalId: 1 }
          })
          expect(result.status).toBe('failed')

          // Verify detail also reflects failed
          const detail = yield* client.proposals.detail({
            path: { vaultAddress, proposalId: 1 }
          })
          expect(detail.status).toBe('failed')
        }).pipe(Effect.provide(FetchHttpClient.layer))

        yield* apiFlow3
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )

  it.scopedLive(
    'rejects refresh-status for non-submitted proposal with 422',
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

        const port = 3448
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

          // Create proposal (status = created, not submitted)
          yield* client.proposals.create({
            path: { vaultAddress },
            payload: {
              manifest: 'CALL_METHOD Address("test") "deposit" ;',
              maxProposerTimestamp: '2026-12-31T23:59:59'
            }
          })

          // Try to refresh — should fail because proposal is not submitted
          const result = yield* client.proposals
            .refreshStatus({
              path: { vaultAddress, proposalId: 1 }
            })
            .pipe(Effect.either)

          expect(result._tag).toBe('Left')
        }).pipe(Effect.provide(FetchHttpClient.layer))

        yield* apiFlow
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )

  it.scopedLive(
    'marks proposal expired and rejects sign when max proposer timestamp has passed',
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

        const port = 3449
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

          // Create proposal with an already-expired timestamp
          yield* client.proposals.create({
            path: { vaultAddress },
            payload: {
              manifest: 'CALL_METHOD Address("test") "deposit" ;',
              maxProposerTimestamp: '2020-01-01T00:00:00'
            }
          })

          // Try to sign — should fail because proposal is expired
          const signResult = yield* client.proposals
            .sign({
              path: { vaultAddress, proposalId: 1 }
            })
            .pipe(Effect.either)

          expect(signResult._tag).toBe('Left')

          // Verify detail shows expired status with reason
          const detail = yield* client.proposals.detail({
            path: { vaultAddress, proposalId: 1 }
          })
          expect(detail.status).toBe('expired')
          expect(detail.statusReason).toContain('expired')
        }).pipe(Effect.provide(FetchHttpClient.layer))

        yield* apiFlow
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )

  it.scopedLive(
    'marks proposal expired and rejects submit when max proposer timestamp has passed',
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

        // Create proposal with future timestamp, sign to ready, then submit with expired check
        // We'll use SQL to directly set status to 'ready' and insert signatures, then change timestamp
        const port = 3450
        yield* Layer.launch(
          makeServerLive(
            port,
            pgClientLayer,
            MockPreviewTransactionSuccess,
            defaultAccessRuleLayer
          )
        ).pipe(Effect.forkScoped)
        yield* Effect.sleep('250 millis')

        // Create proposal with far-future timestamp and sign it to ready
        const apiFlow = Effect.gen(function* () {
          const client = yield* HttpApiClient.make(AppApi, {
            baseUrl: `http://localhost:${port}`
          })
          const vaultAddress = VaultAddress.make(VAULT_ADDRESS)

          yield* client.proposals.create({
            path: { vaultAddress },
            payload: {
              manifest: 'CALL_METHOD Address("test") "deposit" ;',
              maxProposerTimestamp: '2099-12-31T23:59:59'
            }
          })

          yield* client.proposals.sign({
            path: { vaultAddress, proposalId: 1 }
          })
        }).pipe(Effect.provide(FetchHttpClient.layer))
        yield* apiFlow

        // Sign as USER2 to reach ready
        const sessionLayer2 = Layer.succeed(
          SessionMiddleware,
          Effect.succeed({
            sessionId: 'test2',
            accountAddress: TEST_USER_2
          })
        )
        const port2 = 3451
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
          yield* client.proposals.sign({
            path: { vaultAddress, proposalId: 1 }
          })
        }).pipe(Effect.provide(FetchHttpClient.layer))
        yield* apiFlow2

        // Now change the max_proposer_timestamp to a past date via SQL
        yield* Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          yield* sql`UPDATE proposals SET max_proposer_timestamp = '2020-01-01T00:00:00' WHERE id = 1`
        }).pipe(Effect.provide(pgClientLayer))

        // Try to submit — should fail because proposal is expired
        const apiFlow3 = Effect.gen(function* () {
          const client = yield* HttpApiClient.make(AppApi, {
            baseUrl: `http://localhost:${port2}`
          })
          const vaultAddress = VaultAddress.make(VAULT_ADDRESS)

          const submitResult = yield* client.proposals
            .submit({
              path: { vaultAddress, proposalId: 1 }
            })
            .pipe(Effect.either)

          expect(submitResult._tag).toBe('Left')

          // Verify detail shows expired status
          const detail = yield* client.proposals.detail({
            path: { vaultAddress, proposalId: 1 }
          })
          expect(detail.status).toBe('expired')
          expect(detail.statusReason).toContain('expired')
        }).pipe(Effect.provide(FetchHttpClient.layer))

        yield* apiFlow3
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )

  it.scopedLive(
    'marks proposal invalid when signer threshold drifts at submit time',
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

        // Start with 2-of-2 rule, sign to ready
        const port = 3452
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
              maxProposerTimestamp: '2099-12-31T23:59:59'
            }
          })
          yield* client.proposals.sign({
            path: { vaultAddress, proposalId: 1 }
          })
        }).pipe(Effect.provide(FetchHttpClient.layer))
        yield* apiFlow

        // Sign as USER2 to reach ready
        const sessionLayer2 = Layer.succeed(
          SessionMiddleware,
          Effect.succeed({
            sessionId: 'test2',
            accountAddress: TEST_USER_2
          })
        )
        const port2 = 3453
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
          yield* client.proposals.sign({
            path: { vaultAddress, proposalId: 1 }
          })
        }).pipe(Effect.provide(FetchHttpClient.layer))
        yield* apiFlow2

        // Now start a new server where the access rule requires 3 signers (drift)
        const driftedAccessRule: ParsedAccessRule = {
          type: 'CountOf',
          count: 3,
          signers: [
            ...DEFAULT_ACCESS_RULE.signers,
            {
              resourceAddress: ED25519_RESOURCE,
              localId: '<aabbccdd>'
            }
          ]
        }
        const driftedAccessRuleLayer =
          makeMockAccessRuleValidator(driftedAccessRule)

        const port3 = 3454
        yield* Layer.launch(
          makeServerLive(
            port3,
            pgClientLayer,
            MockPreviewTransactionSuccess,
            driftedAccessRuleLayer
          )
        ).pipe(Effect.forkScoped)
        yield* Effect.sleep('250 millis')

        // Try to submit — should fail because threshold drifted (2 sigs, 3 required)
        const apiFlow3 = Effect.gen(function* () {
          const client = yield* HttpApiClient.make(AppApi, {
            baseUrl: `http://localhost:${port3}`
          })
          const vaultAddress = VaultAddress.make(VAULT_ADDRESS)

          const submitResult = yield* client.proposals
            .submit({
              path: { vaultAddress, proposalId: 1 }
            })
            .pipe(Effect.either)

          expect(submitResult._tag).toBe('Left')

          // Verify detail shows invalid status with reason
          const detail = yield* client.proposals.detail({
            path: { vaultAddress, proposalId: 1 }
          })
          expect(detail.status).toBe('invalid')
          expect(detail.statusReason).toContain('drift')
        }).pipe(Effect.provide(FetchHttpClient.layer))

        yield* apiFlow3
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )

  it.scopedLive(
    'marks proposal invalid when manifest preview fails at submit time',
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

        // Create + sign with success preview
        const port = 3455
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
              maxProposerTimestamp: '2099-12-31T23:59:59'
            }
          })
          yield* client.proposals.sign({
            path: { vaultAddress, proposalId: 1 }
          })
        }).pipe(Effect.provide(FetchHttpClient.layer))
        yield* apiFlow

        // Sign as USER2 to reach ready
        const sessionLayer2 = Layer.succeed(
          SessionMiddleware,
          Effect.succeed({
            sessionId: 'test2',
            accountAddress: TEST_USER_2
          })
        )
        const port2 = 3456
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
          yield* client.proposals.sign({
            path: { vaultAddress, proposalId: 1 }
          })
        }).pipe(Effect.provide(FetchHttpClient.layer))
        yield* apiFlow2

        // Start server with FAILING preview — simulates manifest no longer valid
        const port3 = 3457
        yield* Layer.launch(
          makeServerLive(
            port3,
            pgClientLayer,
            MockPreviewTransactionFailure,
            defaultAccessRuleLayer
          )
        ).pipe(Effect.forkScoped)
        yield* Effect.sleep('250 millis')

        // Try to submit — should fail because preview fails, marking invalid
        const apiFlow3 = Effect.gen(function* () {
          const client = yield* HttpApiClient.make(AppApi, {
            baseUrl: `http://localhost:${port3}`
          })
          const vaultAddress = VaultAddress.make(VAULT_ADDRESS)

          const submitResult = yield* client.proposals
            .submit({
              path: { vaultAddress, proposalId: 1 }
            })
            .pipe(Effect.either)

          expect(submitResult._tag).toBe('Left')

          // Verify detail shows invalid status with reason
          const detail = yield* client.proposals.detail({
            path: { vaultAddress, proposalId: 1 }
          })
          expect(detail.status).toBe('invalid')
          expect(detail.statusReason).toContain('no longer valid')
        }).pipe(Effect.provide(FetchHttpClient.layer))

        yield* apiFlow3
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )
})
