import { HttpLayerRouter, HttpServerResponse } from '@effect/platform'
import { NodeHttpServer, NodeRuntime } from '@effect/platform-node'
import { RpcSerialization, RpcServer } from '@effect/rpc'
import { AppRpc, AuthConfig } from '@radix-vaults/shared'
import { Effect, Layer, Logger } from 'effect'
import { createServer } from 'node:http'
import { AuthRoutesLive } from './auth/routes'
import { BadgeChecker } from './auth/badgeChecker'
import { ChallengeStore } from './auth/challengeStore'
import { RolaVerifier } from './auth/rola'
import { SessionStore } from './auth/sessionStore'
import { DatabaseMigrations } from './db/migrate'
import { ORM } from './db/orm'
import { PgClientLive } from './db/pgClient'
import { seedTracerBulletData } from './db/seed'
import { AppRpcHandlersLive } from './rpc/handlers'

const port = Number(process.env.SERVER_PORT ?? '3001')

const RpcRoutesLive = RpcServer.layerHttpRouter({
  group: AppRpc,
  path: '/rpc',
  protocol: 'http'
}).pipe(
  Layer.provide(AppRpcHandlersLive),
  Layer.provide(RpcSerialization.layerJson)
)

const HealthRouteLive = HttpLayerRouter.add(
  'GET',
  '/health',
  HttpServerResponse.unsafeJson({ status: 'ok' })
)

const AuthServicesLive = Layer.mergeAll(
  ChallengeStore.Default,
  SessionStore.Default,
  RolaVerifier.Default,
  BadgeChecker.Default
).pipe(Layer.provide(ORM.Default), Layer.provide(AuthConfig.Live))

const ServerLive = HttpLayerRouter.serve(
  Layer.mergeAll(RpcRoutesLive, HealthRouteLive, AuthRoutesLive)
).pipe(
  Layer.provide(AuthServicesLive),
  Layer.provide(NodeHttpServer.layer(() => createServer(), { port })),
  Layer.provideMerge(PgClientLive)
)

const startup = Effect.gen(function* () {
  const runMigrations = yield* DatabaseMigrations
  yield* runMigrations()
  yield* seedTracerBulletData.pipe(Effect.provide(PgClientLive))
  yield* Effect.logInfo(
    `Effect RPC server listening on http://localhost:${port}/rpc`
  )
  yield* Layer.launch(ServerLive)
})

NodeRuntime.runMain(
  startup.pipe(
    Effect.provide(DatabaseMigrations.Default),
    Effect.provide(Logger.pretty)
  )
)
