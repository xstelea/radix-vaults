import { HttpApiBuilder } from '@effect/platform'
import { NodeHttpServer } from '@effect/platform-node'
import { PgClient } from '@effect/sql-pg'
import { SqlClient } from '@effect/sql'
import { AppApi, AuthConfig } from '@radix-vaults/shared'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Effect, Layer, Redacted } from 'effect'
import { describe, expect, it } from '@effect/vitest'
import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import pg from 'pg'
import type { AccountAddress } from '@radix-vaults/shared'
import { BadgeChecker, NoBadgeError } from './badgeChecker'
import { ChallengeStore } from './challengeStore'
import { RolaVerifier } from './rola'
import { SessionStore } from './sessionStore'
import { ORM } from '../db/orm'
import { AuthHandlersLive } from '../api/authHandlers'
import { VaultHandlersLive } from '../api/vaultHandlers'
import { SessionMiddlewareLive } from '../api/sessionMiddleware'
import { PgContainer } from '../test/PgContainer'

const resolveMigrationsFolder = () => {
  const candidates = [
    'packages/database/drizzle',
    '../../packages/database/drizzle'
  ]
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate)
    if (existsSync(resolved)) return resolved
  }
  throw new Error('Migrations folder not found')
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

const testAuthConfig = AuthConfig.layer({
  networkId: 2,
  dAppDefinitionAddress: 'account_tdx_2_1testdapp',
  expectedOrigin: 'http://localhost:3000',
  teamMemberBadgeAddress: 'resource_tdx_2_1testbadge'
})

const MockRolaVerifierAlwaysValid = Layer.succeed(RolaVerifier, {
  verify: () => Effect.void
} as unknown as RolaVerifier)

const MockBadgeCheckerHasBadge = Layer.succeed(BadgeChecker, {
  hasBadge: () => Effect.void
} as unknown as BadgeChecker)

const MockBadgeCheckerNoBadge = Layer.succeed(BadgeChecker, {
  hasBadge: (accountAddress: AccountAddress) =>
    Effect.fail(new NoBadgeError({ accountAddress }))
} as unknown as BadgeChecker)

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
          submittedAt: null
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
          submittedAt: null
        })
      )
)

const makeTestServer = (
  port: number,
  pgClientLayer: Layer.Layer<SqlClient.SqlClient, unknown>,
  rolaLayer: Layer.Layer<RolaVerifier>,
  badgeLayer: Layer.Layer<BadgeChecker>
) => {
  process.env.TEAM_ACCOUNT_ADDRESS = 'account_tdx_2_1qteam'

  const authServices = Layer.mergeAll(
    ChallengeStore.Default,
    SessionStore.Default,
    rolaLayer,
    badgeLayer
  ).pipe(Layer.provide(ORM.Default), Layer.provide(testAuthConfig))

  const ApiLive = HttpApiBuilder.api(AppApi).pipe(
    Layer.provide(AuthHandlersLive),
    Layer.provide(VaultHandlersLive),
    Layer.provide(MockTeamHandlersLive),
    Layer.provide(MockProposalHandlersLive),
    Layer.provide(HealthHandlersLive),
    Layer.provide(SessionMiddlewareLive)
  )

  return HttpApiBuilder.serve().pipe(
    Layer.provide(ApiLive),
    Layer.provide(authServices),
    Layer.provide(NodeHttpServer.layer(() => createServer(), { port })),
    Layer.provideMerge(pgClientLayer)
  )
}

const fetchJson = async (url: string, init?: RequestInit) => {
  const res = await fetch(url, init)
  const text = await res.text()
  return {
    status: res.status,
    body: text ? (JSON.parse(text) as Record<string, unknown>) : {},
    headers: Object.fromEntries(res.headers.entries())
  }
}

const extractSessionCookie = (headers: Record<string, string>) => {
  const setCookie = headers['set-cookie'] ?? ''
  const match = setCookie.match(/radix_vault_session=([^;]+)/)
  return match?.[1] ?? null
}

describe('Auth e2e', () => {
  it.scopedLive(
    'valid login: challenge -> verify -> session -> logout',
    () =>
      Effect.gen(function* () {
        const container = yield* PgContainer
        const connectionUri = container.getConnectionUri()
        const pgClientLayer = PgClient.layer({
          url: Redacted.make(connectionUri)
        })
        yield* runMigrations(connectionUri)

        const port = 3401
        yield* Layer.launch(
          makeTestServer(
            port,
            pgClientLayer,
            MockRolaVerifierAlwaysValid,
            MockBadgeCheckerHasBadge
          )
        ).pipe(Effect.forkScoped)
        yield* Effect.sleep('250 millis')

        const base = `http://localhost:${port}`

        // 1. Create challenge
        const challengeRes = yield* Effect.promise(() =>
          fetchJson(`${base}/auth/challenge`)
        )
        expect(challengeRes.status).toBe(200)
        expect(challengeRes.body.challenge).toBeDefined()
        const challenge = challengeRes.body.challenge as string
        expect(challenge).toHaveLength(64)

        // 2. Verify with signed challenges (mocked ROLA + badge)
        const verifyRes = yield* Effect.promise(() =>
          fetchJson(`${base}/auth/verify`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              signedChallenge: {
                address: 'account_tdx_2_1testuser',
                type: 'account',
                challenge,
                proof: {
                  publicKey: 'aa'.repeat(32),
                  signature: 'bb'.repeat(32),
                  curve: 'curve25519'
                }
              }
            })
          })
        )
        expect(verifyRes.status).toBe(200)
        expect(verifyRes.body.accountAddress).toBe('account_tdx_2_1testuser')
        expect(verifyRes.body.expiresAt).toBeDefined()

        const sessionCookie = extractSessionCookie(verifyRes.headers)
        expect(sessionCookie).toBeTruthy()

        // 3. Get session
        const sessionRes = yield* Effect.promise(() =>
          fetchJson(`${base}/auth/session`, {
            headers: { cookie: `radix_vault_session=${sessionCookie}` }
          })
        )
        expect(sessionRes.status).toBe(200)
        expect(sessionRes.body.accountAddress).toBe('account_tdx_2_1testuser')

        // 4. Logout
        const logoutRes = yield* Effect.promise(() =>
          fetchJson(`${base}/auth/logout`, {
            method: 'POST',
            headers: { cookie: `radix_vault_session=${sessionCookie}` }
          })
        )
        expect(logoutRes.status).toBe(200)

        // 5. Session should be gone
        const sessionAfterLogout = yield* Effect.promise(() =>
          fetchJson(`${base}/auth/session`, {
            headers: { cookie: `radix_vault_session=${sessionCookie}` }
          })
        )
        expect(sessionAfterLogout.status).toBe(401)
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )

  it.scopedLive(
    'rejects expired/reused challenge',
    () =>
      Effect.gen(function* () {
        const container = yield* PgContainer
        const connectionUri = container.getConnectionUri()
        const pgClientLayer = PgClient.layer({
          url: Redacted.make(connectionUri)
        })
        yield* runMigrations(connectionUri)

        const port = 3402
        yield* Layer.launch(
          makeTestServer(
            port,
            pgClientLayer,
            MockRolaVerifierAlwaysValid,
            MockBadgeCheckerHasBadge
          )
        ).pipe(Effect.forkScoped)
        yield* Effect.sleep('250 millis')

        const base = `http://localhost:${port}`

        const challengeRes = yield* Effect.promise(() =>
          fetchJson(`${base}/auth/challenge`)
        )
        const challenge = challengeRes.body.challenge as string

        const signedChallenge = {
          address: 'account_tdx_2_1testuser',
          type: 'account',
          challenge,
          proof: {
            publicKey: 'aa'.repeat(32),
            signature: 'bb'.repeat(32),
            curve: 'curve25519'
          }
        }

        // First verify succeeds
        const res1 = yield* Effect.promise(() =>
          fetchJson(`${base}/auth/verify`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ signedChallenge })
          })
        )
        expect(res1.status).toBe(200)

        // Same challenge again fails (single-use)
        const res2 = yield* Effect.promise(() =>
          fetchJson(`${base}/auth/verify`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ signedChallenge })
          })
        )
        expect(res2.status).toBe(401)
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )

  it.scopedLive(
    'rejects login when badge check fails',
    () =>
      Effect.gen(function* () {
        const container = yield* PgContainer
        const connectionUri = container.getConnectionUri()
        const pgClientLayer = PgClient.layer({
          url: Redacted.make(connectionUri)
        })
        yield* runMigrations(connectionUri)

        const port = 3403
        yield* Layer.launch(
          makeTestServer(
            port,
            pgClientLayer,
            MockRolaVerifierAlwaysValid,
            MockBadgeCheckerNoBadge
          )
        ).pipe(Effect.forkScoped)
        yield* Effect.sleep('250 millis')

        const base = `http://localhost:${port}`

        const challengeRes = yield* Effect.promise(() =>
          fetchJson(`${base}/auth/challenge`)
        )
        const challenge = challengeRes.body.challenge as string

        const verifyRes = yield* Effect.promise(() =>
          fetchJson(`${base}/auth/verify`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              signedChallenge: {
                address: 'account_tdx_2_1nobadge',
                type: 'account',
                challenge,
                proof: {
                  publicKey: 'aa'.repeat(32),
                  signature: 'bb'.repeat(32),
                  curve: 'curve25519'
                }
              }
            })
          })
        )
        expect(verifyRes.status).toBe(401)
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )

  it.scopedLive(
    'rejects unauthenticated session check',
    () =>
      Effect.gen(function* () {
        const container = yield* PgContainer
        const connectionUri = container.getConnectionUri()
        const pgClientLayer = PgClient.layer({
          url: Redacted.make(connectionUri)
        })
        yield* runMigrations(connectionUri)

        const port = 3404
        yield* Layer.launch(
          makeTestServer(
            port,
            pgClientLayer,
            MockRolaVerifierAlwaysValid,
            MockBadgeCheckerHasBadge
          )
        ).pipe(Effect.forkScoped)
        yield* Effect.sleep('250 millis')

        const base = `http://localhost:${port}`

        // No cookie
        const res1 = yield* Effect.promise(() =>
          fetchJson(`${base}/auth/session`)
        )
        expect(res1.status).toBe(401)

        // Invalid cookie
        const res2 = yield* Effect.promise(() =>
          fetchJson(`${base}/auth/session`, {
            headers: {
              cookie: 'radix_vault_session=00000000-0000-0000-0000-000000000000'
            }
          })
        )
        expect(res2.status).toBe(401)
      }).pipe(Effect.provide(PgContainer.Default)),
    90_000
  )
})
