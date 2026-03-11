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
  SessionMiddleware,
  UnsupportedAccessRuleError,
  VaultAddress,
  VaultAlreadyExistsError,
  VaultsConfig
} from '@radix-vaults/shared'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Effect, Layer, Redacted } from 'effect'
import { describe, expect, it } from '@effect/vitest'
import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import pg from 'pg'
import { ORM } from './db/orm'
import {
  AccessRuleValidator,
  UnsupportedRuleError,
  type ParsedAccessRule
} from './gateway/accessRuleValidator'
import { ImportVaultRepo } from './handlers/importVaultRepo'
import { VaultsHandler } from './handlers/vaults'
import { ListVaultsRepo } from './handlers/listVaultsRepo'
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

const MockSessionMiddleware = Layer.succeed(
  SessionMiddleware,
  Effect.succeed({
    sessionId: 'test',
    accountAddress: 'account_tdx_2_1testuser' as AccountAddress
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

const HealthHandlersLive = HttpApiBuilder.group(AppApi, 'health', (handlers) =>
  handlers.handle('check', () => Effect.succeed({ status: 'ok' }))
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
    .handle('members', () =>
      Effect.succeed({ badgeAddress: 'mock', members: [] })
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

const MockProposalHandlersLive = HttpApiBuilder.group(
  AppApi,
  'proposals',
  (handlers) =>
    handlers
      .handle('create', () =>
        Effect.succeed({
          id: 0,
          vaultAddress: 'mock' as any,
          status: 'created',
          manifest: '',
          maxProposerTimestamp: '',
          createdBy: '',
          createdAt: ''
        })
      )
      .handle('list', () => Effect.succeed([]))
      .handle('detail', () =>
        Effect.succeed({
          id: 0,
          vaultAddress: 'mock' as any,
          status: 'created',
          manifest: '',
          maxProposerTimestamp: '',
          createdBy: '',
          createdAt: '',
          signatureProgress: { collected: 0, required: 0, signatures: [] },
          transactionIntentHash: null,
          submittedAt: null,
          statusReason: null
        })
      )
      .handle('sign', () => Effect.succeed({ ok: true as const }))
      .handle('submit', () =>
        Effect.succeed({ intentHash: 'mock', status: 'submitted' })
      )
      .handle('refreshStatus', () =>
        Effect.succeed({
          status: 'submitted',
          transactionIntentHash: null,
          submittedAt: null,
          statusReason: null
        })
      )
)

// --- Mock AccessRuleValidator ---

const VALID_VAULT = 'account_tdx_2_1qmultisig'
const UNSUPPORTED_VAULT = 'account_tdx_2_1qunsupported'

const validRule: ParsedAccessRule = {
  type: 'CountOf',
  count: 2,
  signers: [
    {
      resourceAddress:
        'resource_rdx1nfxxxxxxxxxxed25sgxxxxxxxxx002236757237xxxxxxxxxed25sg',
      localId: '{hash_pk1}'
    },
    {
      resourceAddress:
        'resource_rdx1nfxxxxxxxxxxed25sgxxxxxxxxx002236757237xxxxxxxxxed25sg',
      localId: '{hash_pk2}'
    },
    {
      resourceAddress:
        'resource_rdx1nfxxxxxxxxxxed25sgxxxxxxxxx002236757237xxxxxxxxxed25sg',
      localId: '{hash_pk3}'
    }
  ]
}

const MockAccessRuleValidator = Layer.succeed(
  AccessRuleValidator,
  AccessRuleValidator.make({
    validate: (accountAddress) => {
      if (accountAddress === VALID_VAULT) {
        return Effect.succeed(validRule)
      }
      return Effect.fail(
        new UnsupportedRuleError({
          accountAddress,
          reason: 'Unsupported access rule'
        })
      )
    }
  })
)

const makeVaultHandlersLive = () =>
  HttpApiBuilder.group(AppApi, 'vaults', (handlers) =>
    handlers
      .handle('list', () =>
        Effect.gen(function* () {
          const vaults = yield* VaultsHandler
          return yield* vaults.list()
        })
      )
      .handle('detail', ({ path: { vaultAddress } }) =>
        Effect.gen(function* () {
          const vaults = yield* VaultsHandler
          return yield* vaults.getDetail(vaultAddress)
        })
      )
      .handle('signers', ({ path: { vaultAddress } }) =>
        Effect.gen(function* () {
          const vaults = yield* VaultsHandler
          return yield* vaults.getSigners(vaultAddress)
        })
      )
      .handle('importVault', ({ payload: { accountAddress, name } }) =>
        Effect.gen(function* () {
          const vaults = yield* VaultsHandler
          return yield* vaults.importVault(accountAddress, name)
        }).pipe(
          Effect.catchTags({
            UnsupportedRuleError: (e) =>
              new UnsupportedAccessRuleError({
                accountAddress,
                message: e.reason
              }),
            EntityNotFoundOnLedgerError: (e) =>
              new UnsupportedAccessRuleError({
                accountAddress: e.accountAddress as typeof accountAddress,
                message: 'Account not found on ledger'
              }),
            VaultAlreadyExistsDbError: (e) =>
              new VaultAlreadyExistsError({
                accountAddress: e.accountAddress
              })
          })
        )
      )
  ).pipe(
    Layer.provide(VaultsHandler.Default),
    Layer.provide(ListVaultsRepo.Default),
    Layer.provide(ImportVaultRepo.Default),
    Layer.provide(MockAccessRuleValidator),
    Layer.provide(ORM.Default),
    Layer.provide(VaultsConfig.Live)
  )

const makeServerLive = (
  port: number,
  pgClientLayer: Layer.Layer<SqlClient.SqlClient, unknown>
) => {
  const ApiLive = HttpApiBuilder.api(AppApi).pipe(
    Layer.provide(MockAuthHandlersLive),
    Layer.provide(makeVaultHandlersLive()),
    Layer.provide(MockTeamHandlersLive),
    Layer.provide(MockProposalHandlersLive),
    Layer.provide(HealthHandlersLive),
    Layer.provide(MockSessionMiddleware)
  )

  return HttpApiBuilder.serve().pipe(
    Layer.provide(ApiLive),
    Layer.provide(NodeHttpServer.layer(() => createServer(), { port })),
    Layer.provideMerge(pgClientLayer)
  )
}

describe('vault import e2e', () => {
  it.scopedLive(
    'imports a vault with supported CountOf access rule',
    () =>
      Effect.gen(function* () {
        const container = yield* PgContainer
        const connectionUri = container.getConnectionUri()

        const pgClientLayer = PgClient.layer({
          url: Redacted.make(connectionUri)
        })

        yield* runMigrations(connectionUri)

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

        const port = 3410
        yield* Layer.launch(makeServerLive(port, pgClientLayer)).pipe(
          Effect.forkScoped
        )
        yield* Effect.sleep('250 millis')

        const apiFlow = Effect.gen(function* () {
          const client = yield* HttpApiClient.make(AppApi, {
            baseUrl: `http://localhost:${port}`
          })

          // Import vault
          const imported = yield* client.vaults.importVault({
            payload: {
              accountAddress: VaultAddress.make(VALID_VAULT),
              name: 'My Multisig'
            }
          })
          expect(imported.accountAddress).toBe(VALID_VAULT)
          expect(imported.name).toBe('My Multisig')

          // Verify it appears in vault list
          const list = yield* client.vaults.list()
          expect(list).toHaveLength(1)
          expect(list[0]?.name).toBe('My Multisig')
          expect(list[0]?.accountAddress).toBe(VALID_VAULT)
        }).pipe(Effect.provide(FetchHttpClient.layer))

        yield* apiFlow
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )

  it.scopedLive(
    'rejects unsupported access rule with 422',
    () =>
      Effect.gen(function* () {
        const container = yield* PgContainer
        const connectionUri = container.getConnectionUri()

        const pgClientLayer = PgClient.layer({
          url: Redacted.make(connectionUri)
        })

        yield* runMigrations(connectionUri)

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

        const port = 3411
        yield* Layer.launch(makeServerLive(port, pgClientLayer)).pipe(
          Effect.forkScoped
        )
        yield* Effect.sleep('250 millis')

        const apiFlow = Effect.gen(function* () {
          const client = yield* HttpApiClient.make(AppApi, {
            baseUrl: `http://localhost:${port}`
          })

          const result = yield* client.vaults
            .importVault({
              payload: {
                accountAddress: VaultAddress.make(UNSUPPORTED_VAULT),
                name: 'Bad Vault'
              }
            })
            .pipe(Effect.either)

          expect(result._tag).toBe('Left')
        }).pipe(Effect.provide(FetchHttpClient.layer))

        yield* apiFlow
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )

  it.scopedLive(
    'rejects duplicate import with 409',
    () =>
      Effect.gen(function* () {
        const container = yield* PgContainer
        const connectionUri = container.getConnectionUri()

        const pgClientLayer = PgClient.layer({
          url: Redacted.make(connectionUri)
        })

        yield* runMigrations(connectionUri)

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

        const port = 3412
        yield* Layer.launch(makeServerLive(port, pgClientLayer)).pipe(
          Effect.forkScoped
        )
        yield* Effect.sleep('250 millis')

        const apiFlow = Effect.gen(function* () {
          const client = yield* HttpApiClient.make(AppApi, {
            baseUrl: `http://localhost:${port}`
          })

          // First import succeeds
          yield* client.vaults.importVault({
            payload: {
              accountAddress: VaultAddress.make(VALID_VAULT),
              name: 'My Multisig'
            }
          })

          // Second import fails
          const result = yield* client.vaults
            .importVault({
              payload: {
                accountAddress: VaultAddress.make(VALID_VAULT),
                name: 'Duplicate'
              }
            })
            .pipe(Effect.either)

          expect(result._tag).toBe('Left')
        }).pipe(Effect.provide(FetchHttpClient.layer))

        yield* apiFlow
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )
})
