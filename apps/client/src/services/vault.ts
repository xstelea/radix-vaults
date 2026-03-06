import type { VaultAddress } from '@radix-vaults/shared'
import { Effect } from 'effect'
import { AppApiClient } from '@/lib/apiClient'

export class VaultService extends Effect.Service<VaultService>()(
  '@radix-vaults/client/VaultService',
  {
    dependencies: [AppApiClient.Default],
    effect: Effect.gen(function* () {
      const client = yield* AppApiClient
      return {
        list: () => client.vaults.list(),
        getDetail: (vaultAddress: VaultAddress) =>
          client.vaults.detail({ path: { vaultAddress } }),
        getSigners: (vaultAddress: VaultAddress) =>
          client.vaults.signers({ path: { vaultAddress } })
      }
    })
  }
) {}
