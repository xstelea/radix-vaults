import type {
  VaultAddress as VaultAddressType,
  VaultDetail,
  VaultSigners
} from '@radix-vaults/shared'
import { Effect } from 'effect'
import { ListVaultsRepo } from './listVaultsRepo'

export class VaultsHandler extends Effect.Service<VaultsHandler>()(
  '@radix-vaults/server/handlers/VaultsHandler',
  {
    effect: Effect.gen(function* () {
      const listVaultsRepo = yield* ListVaultsRepo

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

      return {
        list,
        getDetail,
        getSigners
      } as const
    })
  }
) {}
