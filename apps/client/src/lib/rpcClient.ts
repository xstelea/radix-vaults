import { FetchHttpClient } from '@effect/platform'
import { RpcClient, RpcSerialization } from '@effect/rpc'
import { AppRpc, type ServerHealth } from '@radix-vaults/shared'
import { Effect } from 'effect'

const rpcUrl = import.meta.env.VITE_RPC_URL ?? '/rpc'

export const getServerHealth = Effect.gen(function* () {
  const client = yield* RpcClient.make(AppRpc)
  return yield* client.GetServerHealth({})
}).pipe(
  Effect.scoped,
  Effect.provide(RpcClient.layerProtocolHttp({ url: rpcUrl })),
  Effect.provide(RpcSerialization.layerJson),
  Effect.provide(FetchHttpClient.layer)
)

export type { ServerHealth }
