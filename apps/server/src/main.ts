import { HttpApiBuilder } from '@effect/platform'
import { NodeHttpServer, NodeRuntime } from '@effect/platform-node'
import { AppApi, AuthConfig } from '@radix-vaults/shared'
import { GetFungibleBalance } from '@radix-effects/gateway'
import { Effect, Layer, Logger } from 'effect'
import { createServer } from 'node:http'
import { BadgeChecker } from './auth/badgeChecker'
import { ChallengeStore } from './auth/challengeStore'
import { RolaVerifier } from './auth/rola'
import { SessionStore } from './auth/sessionStore'
import { GatewayApiClientLayer } from './gateway/gatewayApiClient'
import { DatabaseMigrations } from './db/migrate'
import { ORM } from './db/orm'
import { PgClientLive } from './db/pgClient'
import { seedTracerBulletData } from './db/seed'
import { AuthHandlersLive } from './api/authHandlers'
import { TeamHandlersLive } from './api/teamHandlers'
import { VaultHandlersLive } from './api/vaultHandlers'
import { SessionMiddlewareLive } from './api/sessionMiddleware'

const port = Number(process.env.SERVER_PORT ?? '3001')

const HealthHandlersLive = HttpApiBuilder.group(AppApi, 'health', (handlers) =>
  handlers.handle('check', () => Effect.succeed({ status: 'ok' }))
)

const AuthServicesLive = Layer.mergeAll(
  ChallengeStore.Default,
  SessionStore.Default,
  RolaVerifier.Default,
  BadgeChecker.Default
).pipe(
  Layer.provide(ORM.Default),
  Layer.provide(AuthConfig.Live),
  Layer.provide(GetFungibleBalance.Default),
  Layer.provide(GatewayApiClientLayer)
)

const ApiLive = HttpApiBuilder.api(AppApi).pipe(
  Layer.provide(AuthHandlersLive),
  Layer.provide(VaultHandlersLive),
  Layer.provide(TeamHandlersLive),
  Layer.provide(HealthHandlersLive),
  Layer.provide(SessionMiddlewareLive)
)

const ServerLive = HttpApiBuilder.serve().pipe(
  Layer.provide(ApiLive),
  Layer.provide(AuthServicesLive),
  Layer.provide(NodeHttpServer.layer(() => createServer(), { port })),
  Layer.provideMerge(PgClientLive)
)

const startup = Effect.gen(function* () {
  const runMigrations = yield* DatabaseMigrations
  yield* runMigrations()
  yield* seedTracerBulletData.pipe(Effect.provide(PgClientLive))
  yield* Effect.logInfo(`HttpApi server listening on http://localhost:${port}`)
  yield* Layer.launch(ServerLive)
})

NodeRuntime.runMain(
  startup.pipe(
    Effect.provide(DatabaseMigrations.Default),
    Effect.provide(Logger.pretty)
  )
)
