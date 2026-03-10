import { HttpApiBuilder } from '@effect/platform'
import {
  AppApi,
  AuthConfig,
  CreateVaultFailedError,
  ThresholdExceedsSignersError,
  UnsupportedAccessRuleError,
  VaultAlreadyExistsError,
  VaultsConfig
} from '@radix-vaults/shared'
import { GetEntityDetailsVaultAggregated } from '@radix-effects/gateway'
import { Effect, Layer } from 'effect'
import { ORM } from '../db/orm'
import { AccessRuleValidator } from '../gateway/accessRuleValidator'
import { GatewayApiClientLayer } from '../gateway/gatewayApiClient'
import { TransactionSubmitter } from '../gateway/transactionSubmitter'
import { ImportVaultRepo } from '../handlers/importVaultRepo'
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
      .handle('importVault', ({ payload: { accountAddress, name } }) =>
        Effect.gen(function* () {
          const vaults = yield* VaultsHandler
          return yield* vaults.importVault(accountAddress, name)
        }).pipe(
          Effect.catchTags({
            UnsupportedRuleError: (e) =>
              new UnsupportedAccessRuleError({
                accountAddress,
                message: e.reason
              }),
            EntityNotFoundOnLedgerError: (e) =>
              new UnsupportedAccessRuleError({
                accountAddress: e.accountAddress as typeof accountAddress,
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
).pipe(
  Layer.provide(VaultsHandler.Default),
  Layer.provide(ListVaultsRepo.Default),
  Layer.provide(ImportVaultRepo.Default),
  Layer.provide(AccessRuleValidator.Default),
  Layer.provide(GetEntityDetailsVaultAggregated.Default),
  Layer.provide(ORM.Default),
  Layer.provide(VaultsConfig.Live),
  Layer.provide(AuthConfig.Live),
  Layer.provide(GatewayApiClientLayer)
)
