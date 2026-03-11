import type { VaultAddress } from '@radix-vaults/shared'
import { Effect } from 'effect'
import { AppApiClient } from '@/lib/apiClient'
import { GatewayService } from '@/services/gateway'

export class VaultService extends Effect.Service<VaultService>()(
  '@radix-vaults/client/VaultService',
  {
    dependencies: [AppApiClient.Default, GatewayService.Default],
    effect: Effect.gen(function* () {
      const client = yield* AppApiClient
      const gateway = yield* GatewayService
      return {
        list: () => client.vaults.list(),
        getDetail: (vaultAddress: VaultAddress) =>
          client.vaults.detail({ path: { vaultAddress } }),
        getSigners: (vaultAddress: VaultAddress) =>
          gateway.getVaultSigners(vaultAddress),
        importVault: (accountAddress: VaultAddress, name: string) =>
          client.vaults.importVault({
            payload: { accountAddress, name }
          }),
        getVaultBalanceXrd: (vaultAddress: VaultAddress) =>
          gateway.getVaultBalanceXrd(vaultAddress),
        createVault: (name: string, threshold: number) =>
          client.vaults.createVault({
            payload: { name, threshold }
          })
      }
    })
  }
) {}
