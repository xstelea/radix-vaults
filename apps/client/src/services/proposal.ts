import type { ProposalId, VaultAddress } from '@radix-vaults/shared'
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
        getDetail: (vaultAddress: VaultAddress, proposalId: ProposalId) =>
          client.proposals.detail({
            path: { vaultAddress, proposalId }
          }),
        sign: (
          vaultAddress: VaultAddress,
          proposalId: ProposalId,
          signedPartialTransactionHex: string
        ) =>
          client.proposals.sign({
            path: { vaultAddress, proposalId },
            payload: { signedPartialTransactionHex }
          }),
        submit: (vaultAddress: VaultAddress, proposalId: ProposalId) =>
          client.proposals.submit({
            path: { vaultAddress, proposalId }
          }),
        refreshStatus: (vaultAddress: VaultAddress, proposalId: ProposalId) =>
          client.proposals.refreshStatus({
            path: { vaultAddress, proposalId }
          }),
        preview: (vaultAddress: VaultAddress, proposalId: ProposalId) =>
          client.proposals.preview({
            path: { vaultAddress, proposalId }
          })
      }
    })
  }
) {}
