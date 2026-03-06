import { AppRpc, VaultsConfig } from '@radix-vaults/shared'
import { Effect, Layer } from 'effect'
import { ORM } from '../db/orm'
import { VaultsHandler } from '../handlers/vaults'
import { ListVaultsRepo } from '../handlers/listVaultsRepo'

export const AppRpcHandlersLive = AppRpc.toLayer({
  ListVaults: () =>
    Effect.gen(function* () {
      const vaults = yield* VaultsHandler
      return yield* vaults.list()
    }),
  GetVaultDetail: ({ vaultAddress }) =>
    Effect.gen(function* () {
      const vaults = yield* VaultsHandler
      return yield* vaults.getDetail(vaultAddress)
    }),
  GetVaultSigners: ({ vaultAddress }) =>
    Effect.gen(function* () {
      const vaults = yield* VaultsHandler
      return yield* vaults.getSigners(vaultAddress)
    })
}).pipe(
  Layer.provide(VaultsHandler.Default),
  Layer.provide(ListVaultsRepo.Default),
  Layer.provide(ORM.Default),
  Layer.provide(VaultsConfig.Live)
)
