import type { VaultAddress } from '@radix-vaults/shared'
import { Effect } from 'effect'
import { AppApiClient } from '@/lib/apiClient'

export class ProposalService extends Effect.Service<ProposalService>()(
  '@radix-vaults/client/ProposalService',
  {
    dependencies: [AppApiClient.Default],
    effect: Effect.gen(function* () {
      const client = yield* AppApiClient
      return {
        create: (
          vaultAddress: VaultAddress,
          manifest: string,
          maxProposerTimestamp: string
        ) =>
          client.proposals.create({
            path: { vaultAddress },
            payload: { manifest, maxProposerTimestamp }
          }),
        list: (vaultAddress: VaultAddress) =>
          client.proposals.list({ path: { vaultAddress } }),
        getDetail: (vaultAddress: VaultAddress, proposalId: number) =>
          client.proposals.detail({
            path: { vaultAddress, proposalId }
          }),
        sign: (vaultAddress: VaultAddress, proposalId: number) =>
          client.proposals.sign({
            path: { vaultAddress, proposalId }
          }),
        submit: (vaultAddress: VaultAddress, proposalId: number) =>
          client.proposals.submit({
            path: { vaultAddress, proposalId }
          })
      }
    })
  }
) {}
