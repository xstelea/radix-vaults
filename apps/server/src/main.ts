import { HttpLayerRouter, HttpServerResponse } from "@effect/platform"
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { RpcSerialization, RpcServer } from "@effect/rpc"
import { AppRpc } from "@radix-vaults/shared"
import { Effect, Layer, Logger } from "effect"
import { createServer } from "node:http"
import { DatabaseMigrations } from "./db/migrate"
import { PgClientLive } from "./db/pgClient"
import { checkDatabase } from "./health"

const port = Number(process.env.SERVER_PORT ?? "3001")

const HandlersLive = AppRpc.toLayer({
  GetServerHealth: () =>
    checkDatabase.pipe(
      Effect.map((dbStatus) => ({
        status: "ok" as const,
        dbStatus,
        timestamp: new Date().toISOString(),
      })),
    ),
})

const RpcRoutesLive = RpcServer.layerHttpRouter({
  group: AppRpc,
  path: "/rpc",
  protocol: "http",
}).pipe(
  Layer.provide(HandlersLive),
  Layer.provide(RpcSerialization.layerJson),
)

const HealthRouteLive = HttpLayerRouter.add(
  "GET",
  "/health",
  HttpServerResponse.unsafeJson({ status: "ok" }),
)

const ServerLive = HttpLayerRouter.serve(Layer.mergeAll(RpcRoutesLive, HealthRouteLive)).pipe(
  Layer.provide(NodeHttpServer.layer(() => createServer(), { port })),
  Layer.provideMerge(PgClientLive),
)

const startup = Effect.gen(function* () {
  const runMigrations = yield* DatabaseMigrations
  yield* runMigrations()
  yield* Effect.logInfo(`Effect RPC server listening on http://localhost:${port}/rpc`)
  yield* Layer.launch(ServerLive)
})

NodeRuntime.runMain(
  startup.pipe(
    Effect.provide(DatabaseMigrations.Default),
    Effect.provide(Logger.pretty),
  ),
)
