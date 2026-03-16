import {
  AuthConfig,
  CreateVaultFailedError,
  ThresholdExceedsSignersError,
  UnsupportedAccessRuleError,
  type CreateVaultResponse,
  type ImportVaultResponse,
  type VaultAddress as VaultAddressType,
  type VaultAlreadyExistsError,
  type VaultDetail,
  type VaultSigners
} from '@radix-vaults/shared'
import { Effect } from 'effect'
import { AccessRuleValidator } from '../gateway/accessRuleValidator'
import { buildCreateVaultManifest } from '../gateway/manifests'
import { TransactionSubmitter } from '../gateway/transactionSubmitter'
import { VaultAddress } from '@radix-vaults/shared'
import { ImportVaultRepo } from './importVaultRepo'
import { ListVaultsRepo } from './listVaultsRepo'

export class VaultsHandler extends Effect.Service<VaultsHandler>()(
  '@radix-vaults/server/handlers/VaultsHandler',
  {
    effect: Effect.gen(function* () {
      const listVaultsRepo = yield* ListVaultsRepo
      const importVaultRepo = yield* ImportVaultRepo
      const accessRuleValidator = yield* AccessRuleValidator
      const transactionSubmitter = yield* TransactionSubmitter
      const authConfig = yield* AuthConfig

      const list = () => listVaultsRepo.list().pipe(Effect.orDie)

      const getDetail = (vaultAddress: VaultAddressType) =>
        Effect.gen(function* () {
          const vault = yield* listVaultsRepo.getDetailBase(vaultAddress)

          return {
            accountAddress: vault.accountAddress,
            name: vault.name,
            pendingProposalCount: vault.pendingProposalCount,
            balanceXrd: '0'
          } satisfies VaultDetail
        })

      const getSigners = (vaultAddress: VaultAddressType) =>
        Effect.gen(function* () {
          yield* listVaultsRepo.ensureExists(vaultAddress)

          return {
            vaultAddress,
            threshold: 0,
            signers: []
          } satisfies VaultSigners
        })

      const importVault = (
        accountAddress: VaultAddressType,
        name: string
      ): Effect.Effect<
        ImportVaultResponse,
        UnsupportedAccessRuleError | VaultAlreadyExistsError
      > =>
        Effect.gen(function* () {
          yield* accessRuleValidator.validate(accountAddress)
          const vault = yield* importVaultRepo.insert(accountAddress, name)
          return {
            accountAddress: vault.accountAddress,
            name: vault.name
          } satisfies ImportVaultResponse
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
              })
          })
        )

      const createVault = (
        name: string,
        threshold: number
      ): Effect.Effect<
        CreateVaultResponse,
        ThresholdExceedsSignersError | CreateVaultFailedError
      > =>
        Effect.gen(function* () {
          const accessRule = yield* accessRuleValidator
            .validate(authConfig.teamMemberBadgeAddress)
            .pipe(Effect.orDie)

          const signers = accessRule.signers
          if (threshold > signers.length) {
            return yield* Effect.fail(
              new ThresholdExceedsSignersError({
                message: `Threshold ${threshold} exceeds number of team signers (${signers.length})`
              })
            )
          }

          const manifest = yield* Effect.promise(() =>
            buildCreateVaultManifest({
              feePayerAddress: transactionSubmitter.feePayerAddress,
              signers,
              threshold,
              networkId: authConfig.networkId
            })
          )

          const { entities } =
            yield* transactionSubmitter.submitFeePayerOnly(manifest)

          const accountAddress = entities.find((addr) =>
            addr.startsWith('account_')
          )

          if (!accountAddress) {
            return yield* Effect.fail(
              new CreateVaultFailedError({
                message: `No account address found in transaction receipt. Entities: ${entities.join(', ')}`
              })
            )
          }

          const vaultAddress = VaultAddress.make(accountAddress)
          yield* importVaultRepo.insert(vaultAddress, name).pipe(Effect.orDie)

          return {
            accountAddress: vaultAddress,
            name
          } satisfies CreateVaultResponse
        }).pipe(
          Effect.catchTags({
            TransactionSubmitError: (e) =>
              new CreateVaultFailedError({ message: e.message })
          })
        )

      return {
        list,
        getDetail,
        getSigners,
        importVault,
        createVault
      } as const
    })
  }
) {}
