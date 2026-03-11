import { Atom } from '@effect-atom/atom-react'
import type { ProposalId, VaultAddress } from '@radix-vaults/shared'
import { Data, Effect, Option } from 'effect'
import { makeAtomRuntime } from '@/atom/makeRuntimeAtom'
import { ProposalService } from '@/services/proposal'
import { withToast } from '@/atom/withToast'

const runtime = makeAtomRuntime(ProposalService.Default)

export const proposalListAtom = Atom.family((vaultAddress: VaultAddress) =>
  runtime
    .atom(
      Effect.gen(function* () {
        const svc = yield* ProposalService
        return yield* svc.list(vaultAddress)
      })
    )
    .pipe(Atom.withLabel(`proposalListAtom(${vaultAddress})`), Atom.keepAlive)
)

export const createProposal = runtime.fn(
  (args: {
    vaultAddress: VaultAddress
    manifest: string
    maxProposerTimestamp: string
  }) =>
    Effect.gen(function* () {
      const svc = yield* ProposalService
      return yield* svc.create(
        args.vaultAddress,
        args.manifest,
        args.maxProposerTimestamp
      )
    }).pipe(
      withToast({
        whenLoading: 'Creating proposal...',
        whenSuccess: ({ result }) => `Proposal #${result.id} created`,
        whenFailure: () => Option.none()
      })
    )
)

export const signProposal = runtime.fn(
  (args: { vaultAddress: VaultAddress; proposalId: ProposalId }) =>
    Effect.gen(function* () {
      const svc = yield* ProposalService
      return yield* svc.sign(args.vaultAddress, args.proposalId)
    }).pipe(
      withToast({
        whenLoading: 'Signing proposal...',
        whenSuccess: 'Proposal signed successfully',
        whenFailure: ({ cause }) =>
          Option.some(`Signing failed: ${String(cause)}`)
      })
    )
)

export const submitProposal = runtime.fn(
  (args: { vaultAddress: VaultAddress; proposalId: ProposalId }) =>
    Effect.gen(function* () {
      const svc = yield* ProposalService
      return yield* svc.submit(args.vaultAddress, args.proposalId)
    }).pipe(
      withToast({
        whenLoading: 'Submitting transaction...',
        whenSuccess: ({ result }) =>
          `Proposal submitted! Intent hash: ${result.intentHash.slice(0, 16)}...`,
        whenFailure: ({ cause }) =>
          Option.some(`Submit failed: ${String(cause)}`)
      })
    )
)

export const refreshProposalStatus = runtime.fn(
  (args: { vaultAddress: VaultAddress; proposalId: ProposalId }) =>
    Effect.gen(function* () {
      const svc = yield* ProposalService
      return yield* svc.refreshStatus(args.vaultAddress, args.proposalId)
    }).pipe(
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

interface ProposalDetailKey {
  readonly vaultAddress: VaultAddress
  readonly proposalId: ProposalId
}
export const ProposalDetailKey = Data.case<ProposalDetailKey>()

export const proposalDetailAtom = Atom.family(
  ({ vaultAddress, proposalId }: ProposalDetailKey) =>
    runtime
      .atom(
        Effect.gen(function* () {
          const svc = yield* ProposalService
          return yield* svc.getDetail(vaultAddress, proposalId)
        })
      )
      .pipe(
        Atom.withLabel(`proposalDetailAtom(${vaultAddress}:${proposalId})`),
        Atom.keepAlive
      )
)
