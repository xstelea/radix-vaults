import type { VaultAddress } from '@radix-vaults/shared'
import { Effect } from 'effect'
import { RadixVaultRpcClient } from '@/lib/rpcClient'

export class VaultService extends Effect.Service<VaultService>()(
  '@radix-vaults/client/VaultService',
  {
    dependencies: [RadixVaultRpcClient.Default],
    effect: Effect.gen(function* () {
      const client = yield* RadixVaultRpcClient
      return {
        list: () => client.ListVaults({}),
        getDetail: (vaultAddress: VaultAddress) =>
          client.GetVaultDetail({ vaultAddress }),
        getSigners: (vaultAddress: VaultAddress) =>
          client.GetVaultSigners({ vaultAddress })
      }
    })
  }
) {}
