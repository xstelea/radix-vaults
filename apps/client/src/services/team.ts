import type {
  AddMemberRequest,
  ChangeThresholdRequest,
  ProposalId,
  RemoveMemberRequest
} from '@radix-vaults/shared'
import { Effect } from 'effect'
import { AppApiClient } from '@/lib/apiClient'

export class TeamService extends Effect.Service<TeamService>()(
  '@radix-vaults/client/TeamService',
  {
    dependencies: [AppApiClient.Default],
    effect: Effect.gen(function* () {
      const client = yield* AppApiClient
      return {
        getOverview: () => client.team.overview(),

        // --- Team proposals ---
        addMember: (payload: AddMemberRequest) =>
          client.teamProposals.addMember({ payload }),
        removeMember: (payload: RemoveMemberRequest) =>
          client.teamProposals.removeMember({ payload }),
        changeThreshold: (payload: ChangeThresholdRequest) =>
          client.teamProposals.changeThreshold({ payload }),
        listProposals: () => client.teamProposals.list(),
        getProposalDetail: (proposalId: ProposalId) =>
          client.teamProposals.detail({ path: { proposalId } }),
        signProposal: (
          proposalId: ProposalId,
          signedPartialTransactionHex: string
        ) =>
          client.teamProposals.sign({
            path: { proposalId },
            payload: { signedPartialTransactionHex }
          }),
        submitProposal: (proposalId: ProposalId) =>
          client.teamProposals.submit({ path: { proposalId } }),
        refreshProposalStatus: (proposalId: ProposalId) =>
          client.teamProposals.refreshStatus({ path: { proposalId } })
      }
    })
  }
) {}
