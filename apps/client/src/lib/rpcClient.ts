import { FetchHttpClient } from '@effect/platform'
import { RpcClient, RpcSerialization } from '@effect/rpc'
import {
  AppRpc,
  type VaultDetail,
  type VaultListItem,
  type VaultSigners
} from '@radix-vaults/shared'
import { Effect } from 'effect'
import { envVars } from './envVars'

const rpcUrl = envVars.RPC_URL

export class RadixVaultRpcClient extends Effect.Service<RadixVaultRpcClient>()(
  '@radix-vaults/client/RpcClient',
  {
    scoped: Effect.gen(function* () {
      const client = yield* RpcClient.make(AppRpc).pipe(
        Effect.provide(RpcClient.layerProtocolHttp({ url: rpcUrl })),
        Effect.provide(RpcSerialization.layerJson),
        Effect.provide(FetchHttpClient.layer)
      )
      return client
    })
  }
) {}

export type { VaultListItem, VaultDetail, VaultSigners }
