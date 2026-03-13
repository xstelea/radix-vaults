import { Atom } from '@effect-atom/atom-react'
import type {
  AddMemberRequest,
  ChangeThresholdRequest,
  ProposalId,
  RemoveMemberRequest,
  TeamProposalDetail
} from '@radix-vaults/shared'
import { Data, Effect, Layer, Option } from 'effect'
import { makeAtomRuntime } from '@/atom/makeRuntimeAtom'
import { requestWalletSignature } from '@/atom/walletSignature'
import { withToast } from '@/atom/withToast'
import { AppApiClient } from '@/lib/apiClient'
import { disconnectOnUnauthorized } from '@/lib/disconnectOnUnauthorized'
import { RadixDappToolkit } from '@/lib/radixDappToolkit'
import { TeamService } from '@/services/team'

const runtime = makeAtomRuntime(
  Layer.mergeAll(
    TeamService.Default,
    RadixDappToolkit.Live.pipe(Layer.provide(AppApiClient.Default))
  )
)

export const teamProposalListAtom = runtime
  .atom(
    Effect.gen(function* () {
      const svc = yield* TeamService
      return yield* svc.listProposals()
    })
  )
  .pipe(Atom.withLabel('teamProposalListAtom'), Atom.keepAlive)

export class CreateTeamProposalError extends Data.TaggedError(
  'CreateTeamProposalError'
)<{
  message: string
}> {}

export const createAddMemberProposal = runtime.fn(
  (args: { input: AddMemberRequest }) =>
    Effect.gen(function* () {
      const svc = yield* TeamService
      return yield* svc.addMember(args.input)
    }).pipe(
      disconnectOnUnauthorized,
      Effect.catchTags({
        MemberAlreadyExistsError: (e) =>
          Effect.fail(new CreateTeamProposalError({ message: e.message })),
        ThresholdExceedsSignersError: (e) =>
          Effect.fail(new CreateTeamProposalError({ message: e.message })),
        ProposalPreviewFailedError: (e) =>
          Effect.fail(new CreateTeamProposalError({ message: e.message })),
        VaultNotFoundError: () =>
          Effect.fail(
            new CreateTeamProposalError({ message: 'Vault not found.' })
          )
      }),
      withToast({
        whenLoading: 'Creating add-member proposal...',
        whenSuccess: ({ result }) =>
          `Add-member proposal #${result.id} created`,
        whenFailure: () => Option.none()
      })
    )
)

export const createRemoveMemberProposal = runtime.fn(
  (args: { input: RemoveMemberRequest }) =>
    Effect.gen(function* () {
      const svc = yield* TeamService
      return yield* svc.removeMember(args.input)
    }).pipe(
      disconnectOnUnauthorized,
      Effect.catchTags({
        MemberNotFoundError: (e) =>
          Effect.fail(new CreateTeamProposalError({ message: e.message })),
        BadgeVaultNotFoundError: (e) =>
          Effect.fail(new CreateTeamProposalError({ message: e.message })),
        ThresholdExceedsSignersError: (e) =>
          Effect.fail(new CreateTeamProposalError({ message: e.message })),
        ProposalPreviewFailedError: (e) =>
          Effect.fail(new CreateTeamProposalError({ message: e.message })),
        VaultNotFoundError: () =>
          Effect.fail(
            new CreateTeamProposalError({ message: 'Vault not found.' })
          )
      }),
      withToast({
        whenLoading: 'Creating remove-member proposal...',
        whenSuccess: ({ result }) =>
          `Remove-member proposal #${result.id} created`,
        whenFailure: () => Option.none()
      })
    )
)

export const createChangeThresholdProposal = runtime.fn(
  (args: { input: ChangeThresholdRequest }) =>
    Effect.gen(function* () {
      const svc = yield* TeamService
      return yield* svc.changeThreshold(args.input)
    }).pipe(
      disconnectOnUnauthorized,
      Effect.catchTags({
        ThresholdExceedsSignersError: (e) =>
          Effect.fail(new CreateTeamProposalError({ message: e.message })),
        ProposalPreviewFailedError: (e) =>
          Effect.fail(new CreateTeamProposalError({ message: e.message })),
        VaultNotFoundError: () =>
          Effect.fail(
            new CreateTeamProposalError({ message: 'Vault not found.' })
          )
      }),
      withToast({
        whenLoading: 'Creating change-threshold proposal...',
        whenSuccess: ({ result }) =>
          `Change-threshold proposal #${result.id} created`,
        whenFailure: () => Option.none()
      })
    )
)

export const signTeamProposal = runtime.fn(
  (args: { proposalId: ProposalId; proposal: TeamProposalDetail }) =>
    Effect.gen(function* () {
      const signedPartialTransactionHex = yield* requestWalletSignature(
        args.proposal
      )
      const svc = yield* TeamService
      return yield* svc.signProposal(
        args.proposalId,
        signedPartialTransactionHex
      )
    }).pipe(
      disconnectOnUnauthorized,
      withToast({
        whenLoading: 'Signing team proposal...',
        whenSuccess: 'Team proposal signed successfully',
        whenFailure: ({ cause }) =>
          Option.some(`Signing failed: ${String(cause)}`)
      })
    )
)

export const submitTeamProposal = runtime.fn(
  (args: { proposalId: ProposalId }) =>
    Effect.gen(function* () {
      const svc = yield* TeamService
      return yield* svc.submitProposal(args.proposalId)
    }).pipe(
      disconnectOnUnauthorized,
      withToast({
        whenLoading: 'Submitting team transaction...',
        whenSuccess: ({ result }) =>
          `Proposal submitted! Intent hash: ${result.intentHash.slice(0, 16)}...`,
        whenFailure: ({ cause }) =>
          Option.some(`Submit failed: ${String(cause)}`)
      })
    )
)

export const refreshTeamProposalStatus = runtime.fn(
  (args: { proposalId: ProposalId }) =>
    Effect.gen(function* () {
      const svc = yield* TeamService
      return yield* svc.refreshProposalStatus(args.proposalId)
    }).pipe(
      disconnectOnUnauthorized,
      withToast({
        whenLoading: 'Checking status...',
        whenSuccess: ({ result }) => {
          if (result.status === 'committed')
            return {
              message: 'Transaction committed successfully',
              type: 'success' as const
            }
          if (result.status === 'failed')
            return {
              message: 'Transaction failed on-chain',
              type: 'error' as const
            }
          return { message: 'Transaction still pending', type: 'info' as const }
        },
        whenFailure: ({ cause }) =>
          Option.some(`Status check failed: ${String(cause)}`)
      })
    )
)

interface TeamProposalDetailKey {
  readonly proposalId: ProposalId
}
export const TeamProposalDetailKey = Data.case<TeamProposalDetailKey>()

export const teamProposalDetailAtom = Atom.family(
  ({ proposalId }: TeamProposalDetailKey) =>
    runtime
      .atom(
        Effect.gen(function* () {
          const svc = yield* TeamService
          return yield* svc.getProposalDetail(proposalId)
        })
      )
      .pipe(
        Atom.withLabel(`teamProposalDetailAtom(${proposalId})`),
        Atom.keepAlive
      )
)
