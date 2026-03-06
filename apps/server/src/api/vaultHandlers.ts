import { HttpApiBuilder } from '@effect/platform'
import { AppApi, VaultsConfig } from '@radix-vaults/shared'
import { Effect, Layer } from 'effect'
import { ORM } from '../db/orm'
import { VaultsHandler } from '../handlers/vaults'
import { ListVaultsRepo } from '../handlers/listVaultsRepo'

export const VaultHandlersLive = HttpApiBuilder.group(
  AppApi,
  'vaults',
  (handlers) =>
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
).pipe(
  Layer.provide(VaultsHandler.Default),
  Layer.provide(ListVaultsRepo.Default),
  Layer.provide(ORM.Default),
  Layer.provide(VaultsConfig.Live)
)
