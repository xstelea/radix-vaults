import { HttpApiBuilder } from '@effect/platform'
import { AppApi } from '@radix-vaults/shared'
import { Effect, Layer } from 'effect'
import { VaultsHandler } from '../handlers/vaults'

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
      .handle('importVault', ({ payload: { accountAddress, name } }) =>
        Effect.gen(function* () {
          const vaults = yield* VaultsHandler
          return yield* vaults.importVault(accountAddress, name)
        })
      )
      .handle('createVault', ({ payload: { name, threshold } }) =>
        Effect.gen(function* () {
          const vaults = yield* VaultsHandler
          return yield* vaults.createVault(name, threshold)
        })
      )
).pipe(Layer.provide(VaultsHandler.Default))
