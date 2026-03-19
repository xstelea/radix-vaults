import type { ProposalId, VaultAddress } from '@radix-vaults/shared'
import { TeamId } from '@radix-vaults/shared'
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
          teamId: string,
          vaultAddress: VaultAddress,
          manifest: string,
          maxProposerTimestamp: string
        ) =>
          client.proposals.create({
            path: { teamId: TeamId.make(teamId), vaultAddress },
            payload: { manifest, maxProposerTimestamp }
          }),
        list: (teamId: string, vaultAddress: VaultAddress) =>
          client.proposals.list({
            path: { teamId: TeamId.make(teamId), vaultAddress }
          }),
        getDetail: (
          teamId: string,
          vaultAddress: VaultAddress,
          proposalId: ProposalId
        ) =>
          client.proposals.detail({
            path: { teamId: TeamId.make(teamId), vaultAddress, proposalId }
          }),
        sign: (
          teamId: string,
          vaultAddress: VaultAddress,
          proposalId: ProposalId,
          signedPartialTransactionHex: string
        ) =>
          client.proposals.sign({
            path: { teamId: TeamId.make(teamId), vaultAddress, proposalId },
            payload: { signedPartialTransactionHex }
          }),
        submit: (
          teamId: string,
          vaultAddress: VaultAddress,
          proposalId: ProposalId
        ) =>
          client.proposals.submit({
            path: { teamId: TeamId.make(teamId), vaultAddress, proposalId }
          }),
        refreshStatus: (
          teamId: string,
          vaultAddress: VaultAddress,
          proposalId: ProposalId
        ) =>
          client.proposals.refreshStatus({
            path: { teamId: TeamId.make(teamId), vaultAddress, proposalId }
          })
      }
    })
  }
) {}
