import { HttpApiBuilder } from '@effect/platform'
import {
  AppApi,
  CreateVaultFailedError,
  ThresholdExceedsSignersError,
  UnsupportedAccessRuleError,
  VaultAlreadyExistsError
} from '@radix-vaults/shared'
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
        }).pipe(
          Effect.catchTags({
            UnsupportedRuleError: (e) =>
              new UnsupportedAccessRuleError({
                entityAddress: accountAddress,
                message: e.reason
              }),
            EntityNotFoundOnLedgerError: (e) =>
              new UnsupportedAccessRuleError({
                entityAddress: e.entityAddress,
                message: 'Account not found on ledger'
              }),
            VaultAlreadyExistsDbError: (e) =>
              new VaultAlreadyExistsError({
                accountAddress: e.accountAddress
              })
          })
        )
      )
      .handle('createVault', ({ payload: { name, threshold } }) =>
        Effect.gen(function* () {
          const vaults = yield* VaultsHandler
          return yield* vaults.createVault(name, threshold)
        }).pipe(
          Effect.catchTags({
            ThresholdExceedsSignersHandlerError: (e) =>
              new ThresholdExceedsSignersError({ message: e.message }),
            CreateVaultFailedHandlerError: (e) =>
              new CreateVaultFailedError({ message: e.message }),
            TransactionSubmitError: (e) =>
              new CreateVaultFailedError({ message: e.message })
          })
        )
      )
).pipe(Layer.provide(VaultsHandler.Default))
