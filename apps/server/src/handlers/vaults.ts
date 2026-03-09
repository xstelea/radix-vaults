import type {
  ImportVaultResponse,
  VaultAddress as VaultAddressType,
  VaultDetail,
  VaultSigners
} from '@radix-vaults/shared'
import { Effect } from 'effect'
import {
  AccessRuleValidator,
  type UnsupportedRuleError,
  type EntityNotFoundOnLedgerError
} from '../gateway/accessRuleValidator'
import {
  ImportVaultRepo,
  type VaultAlreadyExistsDbError
} from './importVaultRepo'
import { ListVaultsRepo } from './listVaultsRepo'

export class VaultsHandler extends Effect.Service<VaultsHandler>()(
  '@radix-vaults/server/handlers/VaultsHandler',
  {
    effect: Effect.gen(function* () {
      const listVaultsRepo = yield* ListVaultsRepo
      const importVaultRepo = yield* ImportVaultRepo
      const accessRuleValidator = yield* AccessRuleValidator

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
        | UnsupportedRuleError
        | EntityNotFoundOnLedgerError
        | VaultAlreadyExistsDbError
      > =>
        Effect.gen(function* () {
          yield* accessRuleValidator.validate(accountAddress)
          const vault = yield* importVaultRepo.insert(accountAddress, name)
          return {
            accountAddress: vault.accountAddress,
            name: vault.name
          } satisfies ImportVaultResponse
        })

      return {
        list,
        getDetail,
        getSigners,
        importVault
      } as const
    })
  }
) {}
