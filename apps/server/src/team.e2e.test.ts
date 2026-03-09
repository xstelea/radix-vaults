import {
  FetchHttpClient,
  HttpApiBuilder,
  HttpApiClient
} from '@effect/platform'
import { NodeHttpServer } from '@effect/platform-node'
import { PgClient } from '@effect/sql-pg'
import {
  type AccountAddress,
  type HexString,
  AppApi,
  CurrentSession,
  SessionMiddleware,
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
  type ParsedAccessRule
} from './gateway/accessRuleValidator'
import { SignerSourceRepo } from './handlers/signerSourceRepo'
import { TeamHandler } from './handlers/team'
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

const TEAM_ACCOUNT = 'account_tdx_2_1qteam'
const TEST_MEMBER = 'account_tdx_2_1qtestmember'

const MockSessionMiddleware = Layer.succeed(
  SessionMiddleware,
  Effect.succeed({
    sessionId: 'test',
    accountAddress: TEST_MEMBER as AccountAddress
  })
)

const ED25519_RESOURCE =
  'resource_rdx1nfxxxxxxxxxxed25sgxxxxxxxxx002236757237xxxxxxxxxed25sg'

const teamAccessRule: ParsedAccessRule = {
  type: 'CountOf',
  count: 2,
  signers: [
    { resourceAddress: ED25519_RESOURCE, localId: '{hash_pk1}' },
    { resourceAddress: ED25519_RESOURCE, localId: '{hash_pk2}' },
    { resourceAddress: ED25519_RESOURCE, localId: '{hash_pk3}' }
  ]
}

const MockAccessRuleValidator = Layer.succeed(
  AccessRuleValidator,
  AccessRuleValidator.make({
    validate: () => Effect.succeed(teamAccessRule)
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

const HealthHandlersLive = HttpApiBuilder.group(AppApi, 'health', (handlers) =>
  handlers.handle('check', () => Effect.succeed({ status: 'ok' }))
)

const makeTeamHandlersLive = () =>
  HttpApiBuilder.group(AppApi, 'team', (handlers) =>
    handlers
      .handle('overview', () =>
        Effect.gen(function* () {
          const team = yield* TeamHandler
          return yield* team.getOverview()
        })
      )
      .handle('setSignerSource', ({ payload: { publicKey, keyType } }) =>
        Effect.gen(function* () {
          const session = yield* CurrentSession
          const team = yield* TeamHandler
          return yield* team.setSignerSource(
            session.accountAddress,
            publicKey,
            keyType
          )
        })
      )
      .handle('clearSignerSource', () =>
        Effect.gen(function* () {
          const session = yield* CurrentSession
          const team = yield* TeamHandler
          return yield* team.clearSignerSource(session.accountAddress)
        })
      )
  ).pipe(
    Layer.provide(TeamHandler.Default),
    Layer.provide(SignerSourceRepo.Default),
    Layer.provide(MockAccessRuleValidator),
    Layer.provide(ORM.Default),
    Layer.provide(VaultsConfig.layer(TEAM_ACCOUNT))
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
          signatureProgress: { collected: 0, required: 0, signatures: [] }
        })
      )
      .handle('sign', () => Effect.succeed({ ok: true as const }))
)

const makeServerLive = (
  port: number,
  pgClientLayer: Layer.Layer<any, unknown>
) => {
  const ApiLive = HttpApiBuilder.api(AppApi).pipe(
    Layer.provide(MockAuthHandlersLive),
    Layer.provide(MockVaultHandlersLive),
    Layer.provide(makeTeamHandlersLive()),
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

describe('team e2e', () => {
  it.scopedLive(
    'returns team overview with signers and empty sources',
    () =>
      Effect.gen(function* () {
        const container = yield* PgContainer
        const connectionUri = container.getConnectionUri()

        const pgClientLayer = PgClient.layer({
          url: Redacted.make(connectionUri)
        })

        yield* runMigrations(connectionUri)

        const port = 3420
        yield* Layer.launch(makeServerLive(port, pgClientLayer)).pipe(
          Effect.forkScoped
        )
        yield* Effect.sleep('250 millis')

        const apiFlow = Effect.gen(function* () {
          const client = yield* HttpApiClient.make(AppApi, {
            baseUrl: `http://localhost:${port}`
          })

          const overview = yield* client.team.overview()
          expect(overview.teamAccountAddress).toBe(TEAM_ACCOUNT)
          expect(overview.threshold).toBe(2)
          expect(overview.signers).toHaveLength(3)
          expect(overview.memberSignerSources).toHaveLength(0)
          expect(overview.hasMismatch).toBe(true)
        }).pipe(Effect.provide(FetchHttpClient.layer))

        yield* apiFlow
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )

  it.scopedLive(
    'sets and retrieves a member signer source',
    () =>
      Effect.gen(function* () {
        const container = yield* PgContainer
        const connectionUri = container.getConnectionUri()

        const pgClientLayer = PgClient.layer({
          url: Redacted.make(connectionUri)
        })

        yield* runMigrations(connectionUri)

        const port = 3421
        yield* Layer.launch(makeServerLive(port, pgClientLayer)).pipe(
          Effect.forkScoped
        )
        yield* Effect.sleep('250 millis')

        const apiFlow = Effect.gen(function* () {
          const client = yield* HttpApiClient.make(AppApi, {
            baseUrl: `http://localhost:${port}`
          })

          // Set signer source
          const result = yield* client.team.setSignerSource({
            payload: { publicKey: 'abc123', keyType: 'ed25519' }
          })
          expect(result.accountAddress).toBe(TEST_MEMBER)
          expect(result.publicKey).toBe('abc123')
          expect(result.keyType).toBe('ed25519')

          // Verify it appears in overview
          const overview = yield* client.team.overview()
          expect(overview.memberSignerSources).toHaveLength(1)
          expect(overview.memberSignerSources[0]).toMatchObject({
            accountAddress: TEST_MEMBER,
            publicKey: 'abc123',
            keyType: 'ed25519'
          })
        }).pipe(Effect.provide(FetchHttpClient.layer))

        yield* apiFlow
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )

  it.scopedLive(
    'clears a member signer source',
    () =>
      Effect.gen(function* () {
        const container = yield* PgContainer
        const connectionUri = container.getConnectionUri()

        const pgClientLayer = PgClient.layer({
          url: Redacted.make(connectionUri)
        })

        yield* runMigrations(connectionUri)

        const port = 3422
        yield* Layer.launch(makeServerLive(port, pgClientLayer)).pipe(
          Effect.forkScoped
        )
        yield* Effect.sleep('250 millis')

        const apiFlow = Effect.gen(function* () {
          const client = yield* HttpApiClient.make(AppApi, {
            baseUrl: `http://localhost:${port}`
          })

          // Set then clear
          yield* client.team.setSignerSource({
            payload: { publicKey: 'abc123', keyType: 'ed25519' }
          })
          const clearResult = yield* client.team.clearSignerSource()
          expect(clearResult.ok).toBe(true)

          // Verify it's gone
          const overview = yield* client.team.overview()
          expect(overview.memberSignerSources).toHaveLength(0)
        }).pipe(Effect.provide(FetchHttpClient.layer))

        yield* apiFlow
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )
})
