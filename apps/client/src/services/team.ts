import type {
  AddMemberRequest,
  ChangeThresholdRequest,
  ProposalId,
  RemoveMemberRequest
} from '@radix-vaults/shared'
import { TeamId } from '@radix-vaults/shared'
import { Effect } from 'effect'
import { AppApiClient } from '@/lib/apiClient'

export class TeamService extends Effect.Service<TeamService>()(
  '@radix-vaults/client/TeamService',
  {
    dependencies: [AppApiClient.Default],
    effect: Effect.gen(function* () {
      const client = yield* AppApiClient
      return {
        getOverview: (teamId: string) =>
          client.team.overview({ path: { teamId: TeamId.make(teamId) } }),

        // --- Team proposals ---
        addMember: (teamId: string, payload: AddMemberRequest) =>
          client.teamProposals.addMember({
            path: { teamId: TeamId.make(teamId) },
            payload
          }),
        removeMember: (teamId: string, payload: RemoveMemberRequest) =>
          client.teamProposals.removeMember({
            path: { teamId: TeamId.make(teamId) },
            payload
          }),
        changeThreshold: (teamId: string, payload: ChangeThresholdRequest) =>
          client.teamProposals.changeThreshold({
            path: { teamId: TeamId.make(teamId) },
            payload
          }),
        listProposals: (teamId: string) =>
          client.teamProposals.list({ path: { teamId: TeamId.make(teamId) } }),
        getProposalDetail: (teamId: string, proposalId: ProposalId) =>
          client.teamProposals.detail({
            path: { teamId: TeamId.make(teamId), proposalId }
          }),
        signProposal: (
          teamId: string,
          proposalId: ProposalId,
          signedPartialTransactionHex: string
        ) =>
          client.teamProposals.sign({
            path: { teamId: TeamId.make(teamId), proposalId },
            payload: { signedPartialTransactionHex }
          }),
        submitProposal: (teamId: string, proposalId: ProposalId) =>
          client.teamProposals.submit({
            path: { teamId: TeamId.make(teamId), proposalId }
          }),
        refreshProposalStatus: (teamId: string, proposalId: ProposalId) =>
          client.teamProposals.refreshStatus({
            path: { teamId: TeamId.make(teamId), proposalId }
          })
      }
    })
  }
) {}
