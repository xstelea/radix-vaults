import { TeamId, type VaultAddress } from '@radix-vaults/shared'
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
        list: (teamId: string) =>
          client.vaults.list({ path: { teamId: TeamId.make(teamId) } }),
        getDetail: (teamId: string, vaultAddress: VaultAddress) =>
          client.vaults.detail({
            path: { teamId: TeamId.make(teamId), vaultAddress }
          }),
        getSigners: (_teamId: string, vaultAddress: VaultAddress) =>
          gateway.getVaultSigners(vaultAddress),
        importVault: (
          teamId: string,
          accountAddress: VaultAddress,
          name: string
        ) =>
          client.vaults.importVault({
            path: { teamId: TeamId.make(teamId) },
            payload: { accountAddress, name }
          }),
        getVaultBalanceXrd: (_teamId: string, vaultAddress: VaultAddress) =>
          gateway.getVaultBalanceXrd(vaultAddress),
        createVault: (teamId: string, name: string, threshold: number) =>
          client.vaults.createVault({
            path: { teamId: TeamId.make(teamId) },
            payload: { name, threshold }
          })
      }
    })
  }
) {}
