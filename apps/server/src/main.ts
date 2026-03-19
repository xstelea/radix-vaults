import {
  HttpApiBuilder,
  HttpMiddleware,
  HttpServerRequest
} from '@effect/platform'
import { NodeHttpServer, NodeRuntime } from '@effect/platform-node'
import { AppApi, AuthConfig } from '@radix-vaults/shared'
import {
  GetEntityDetailsVaultAggregated,
  GetLedgerStateService,
  GetResourceHoldersService,
  NonFungibleData,
  PreviewTransaction
} from '@radix-effects/gateway'
import { Config, Effect, Layer, Logger, LogLevel } from 'effect'
import { flow } from 'effect/Function'
import { createServer } from 'node:http'
import { ChallengeStore } from './auth/challengeStore'
import { RolaVerifier } from './auth/rola'
import { SessionStore } from './auth/sessionStore'
import { AccessRuleValidator } from './gateway/accessRuleValidator'
import { GatewayApiClientLayer } from './gateway/gatewayApiClient'
import { TransactionStatusCheckerLive } from './gateway/transactionStatusChecker'
import { TransactionSubmitter } from './gateway/transactionSubmitter'
import { TransactionSubmitterLive } from './gateway/transactionSubmitterLive'
import { DatabaseMigrations } from './db/migrate'
import { ORM } from './db/orm'
import { PgClientLive } from './db/pgClient'
import { ImportVaultRepo } from './handlers/importVaultRepo'
import { ListVaultsRepo } from './handlers/listVaultsRepo'
import { ProposalRepo } from './handlers/proposalRepo'
import { TeamRepo } from './handlers/teamRepo'
import { AuthHandlersLive } from './api/authHandlers'
import { DashboardHandlersLive } from './api/dashboardHandlers'
import { ProposalHandlersLive } from './api/proposalHandlers'
import { TeamHandlersLive } from './api/teamHandlers'
import { TeamsHandlersLive } from './api/teamsHandlers'
import { TeamProposalHandlersLive } from './api/teamProposalHandlers'
import { VaultHandlersLive } from './api/vaultHandlers'
import { SessionMiddlewareLive } from './api/sessionMiddleware'

const port = Number(process.env.SERVER_PORT ?? '3001')

const logDefects = HttpMiddleware.make((httpApp) =>
  httpApp.pipe(
    Effect.tapErrorCause((cause) =>
      Effect.logError('Unhandled server error', cause)
    )
  )
)

const HealthHandlersLive = HttpApiBuilder.group(AppApi, 'health', (handlers) =>
  handlers.handle('check', () =>
    HttpMiddleware.withLoggerDisabled(Effect.succeed({ status: 'ok' }))
  )
)

const AuthServicesLive = Layer.mergeAll(
  ChallengeStore.Default,
  SessionStore.Default,
  RolaVerifier.Default
).pipe(
  Layer.provide(ORM.Default),
  Layer.provide(AuthConfig.Live),
  Layer.provide(GetEntityDetailsVaultAggregated.Default),
  Layer.provide(GatewayApiClientLayer)
)

const TransactionSubmitterLayer = TransactionSubmitterLive.pipe(
  Layer.catchAll(() => TransactionSubmitter.Default)
)

const GatewayServicesLive = Layer.mergeAll(
  GetEntityDetailsVaultAggregated.Default,
  GetLedgerStateService.Default,
  PreviewTransaction.Default,
  GetResourceHoldersService.Default,
  NonFungibleData.Default,
  TransactionStatusCheckerLive
).pipe(Layer.provide(GatewayApiClientLayer))

const RepoServicesLive = Layer.mergeAll(
  ListVaultsRepo.Default,
  ImportVaultRepo.Default,
  ProposalRepo.Default,
  TeamRepo.Default
).pipe(Layer.provide(ORM.Default))

const ApiLive = HttpApiBuilder.api(AppApi).pipe(
  // handler groups
  Layer.provide(AuthHandlersLive),
  Layer.provide(VaultHandlersLive),
  Layer.provide(TeamHandlersLive),
  Layer.provide(TeamsHandlersLive),
  Layer.provide(ProposalHandlersLive),
  Layer.provide(TeamProposalHandlersLive),
  Layer.provide(DashboardHandlersLive),
  Layer.provide(HealthHandlersLive),
  Layer.provide(SessionMiddlewareLive),
  Layer.provide(TransactionSubmitterLayer),
  // shared services
  Layer.provide(AccessRuleValidator.Default),
  Layer.provide(GatewayServicesLive),
  Layer.provide(RepoServicesLive),
  Layer.provide(AuthServicesLive),
  Layer.provide(ORM.Default),
  Layer.provide(AuthConfig.Live),
  Layer.provide(GatewayApiClientLayer)
)

const loggerSkipOptions = HttpMiddleware.make((httpApp) =>
  Effect.flatMap(HttpServerRequest.HttpServerRequest, (req) =>
    req.method === 'OPTIONS' ? httpApp : HttpMiddleware.logger(httpApp)
  )
)

const ServerLive = HttpApiBuilder.serve(
  flow(logDefects, loggerSkipOptions)
).pipe(
  Layer.provide(
    Layer.unwrapEffect(
      Effect.gen(function* () {
        const allowedOrigins = yield* Config.array(
          Config.string('ALLOWED_ORIGINS')
        ).pipe(Config.withDefault(['http://localhost:3000']), Effect.orDie)

        return HttpApiBuilder.middlewareCors({
          allowedOrigins,
          credentials: true
        })
      })
    )
  ),
  Layer.provide(ApiLive),
  Layer.provide(NodeHttpServer.layer(() => createServer(), { port })),
  Layer.provideMerge(PgClientLive)
)

const startup = Effect.gen(function* () {
  const runMigrations = yield* DatabaseMigrations
  yield* runMigrations()
  yield* Effect.logInfo(`HttpApi server listening on http://localhost:${port}`)
  yield* Layer.launch(ServerLive)
})

const LoggerLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const level = yield* Config.string('LOG_LEVEL').pipe(
      Config.withDefault('Info')
    )
    const format = yield* Config.string('LOG_FORMAT').pipe(
      Config.withDefault('pretty')
    )
    return Layer.merge(
      format === 'json' ? Logger.json : Logger.pretty,
      Logger.minimumLogLevel(LogLevel.fromLiteral(level as LogLevel.Literal))
    )
  })
)

NodeRuntime.runMain(
  startup.pipe(
    Effect.provide(DatabaseMigrations.Default),
    Effect.provide(LoggerLive)
  )
)
