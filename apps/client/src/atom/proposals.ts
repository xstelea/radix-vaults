import { Atom } from '@effect-atom/atom-react'
import type {
  ProposalDetail,
  ProposalId,
  VaultAddress
} from '@radix-vaults/shared'
import { Data, Effect, Layer, Option } from 'effect'
import { makeAtomRuntime } from '@/atom/makeRuntimeAtom'
import { requestWalletSignature } from '@/atom/walletSignature'
import { AppApiClient } from '@/lib/apiClient'
import { disconnectOnUnauthorized } from '@/lib/disconnectOnUnauthorized'
import { RadixDappToolkit } from '@/lib/radixDappToolkit'
import { GatewayService } from '@/services/gateway'
import { ProposalService } from '@/services/proposal'
import { withToast } from '@/atom/withToast'

const runtime = makeAtomRuntime(
  Layer.mergeAll(
    ProposalService.Default,
    RadixDappToolkit.Live.pipe(Layer.provide(AppApiClient.Default)),
    GatewayService.Default
  )
)

export const proposalListAtom = Atom.family(
  ({ teamId, vaultAddress }: { teamId: string; vaultAddress: VaultAddress }) =>
    runtime
      .atom(
        Effect.gen(function* () {
          const svc = yield* ProposalService
          return yield* svc.list(teamId, vaultAddress)
        })
      )
      .pipe(
        Atom.withLabel(`proposalListAtom(${teamId}:${vaultAddress})`),
        Atom.keepAlive
      )
)

export class CreateProposalError extends Data.TaggedError(
  'CreateProposalError'
)<{
  message: string
}> {}

export const createProposal = runtime.fn(
  (args: {
    teamId: string
    vaultAddress: VaultAddress
    manifest: string
    maxProposerTimestamp: string
  }) =>
    Effect.gen(function* () {
      const svc = yield* ProposalService
      return yield* svc.create(
        args.teamId,
        args.vaultAddress,
        args.manifest,
        args.maxProposerTimestamp
      )
    }).pipe(
      disconnectOnUnauthorized,
      Effect.catchTags({
        ProposalPreviewFailedError: (e) =>
          Effect.fail(new CreateProposalError({ message: e.message })),
        VaultNotFoundError: () =>
          Effect.fail(new CreateProposalError({ message: 'Vault not found.' }))
      }),
      withToast({
        whenLoading: 'Creating proposal...',
        whenSuccess: ({ result }) => `Proposal #${result.id} created`,
        whenFailure: () => Option.none()
      })
    )
)

export const signProposal = runtime.fn(
  (args: {
    teamId: string
    vaultAddress: VaultAddress
    proposalId: ProposalId
    proposal: ProposalDetail
  }) =>
    Effect.gen(function* () {
      // 1. Request wallet to sign the subintent
      const signedPartialTransactionHex = yield* requestWalletSignature(
        args.proposal
      )

      // 2. Send the wallet's signed response to the server
      const svc = yield* ProposalService
      return yield* svc.sign(
        args.teamId,
        args.vaultAddress,
        args.proposalId,
        signedPartialTransactionHex
      )
    }).pipe(
      disconnectOnUnauthorized,
      withToast({
        whenLoading: 'Signing proposal...',
        whenSuccess: 'Proposal signed successfully',
        whenFailure: ({ cause }) =>
          Option.some(`Signing failed: ${String(cause)}`)
      })
    )
)

export const submitProposal = runtime.fn(
  (args: {
    teamId: string
    vaultAddress: VaultAddress
    proposalId: ProposalId
  }) =>
    Effect.gen(function* () {
      const svc = yield* ProposalService
      return yield* svc.submit(args.teamId, args.vaultAddress, args.proposalId)
    }).pipe(
      disconnectOnUnauthorized,
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
  (args: {
    teamId: string
    vaultAddress: VaultAddress
    proposalId: ProposalId
  }) =>
    Effect.gen(function* () {
      const svc = yield* ProposalService
      return yield* svc.refreshStatus(
        args.teamId,
        args.vaultAddress,
        args.proposalId
      )
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

export const previewProposal = runtime.fn((args: { manifest: string }) =>
  Effect.gen(function* () {
    const gateway = yield* GatewayService
    return yield* gateway.previewManifest(args.manifest)
  })
)

interface ProposalDetailKey {
  readonly teamId: string
  readonly vaultAddress: VaultAddress
  readonly proposalId: ProposalId
}
export const ProposalDetailKey = Data.case<ProposalDetailKey>()

export const proposalDetailAtom = Atom.family(
  ({ teamId, vaultAddress, proposalId }: ProposalDetailKey) =>
    runtime
      .atom(
        Effect.gen(function* () {
          const svc = yield* ProposalService
          return yield* svc.getDetail(teamId, vaultAddress, proposalId)
        })
      )
      .pipe(
        Atom.withLabel(
          `proposalDetailAtom(${teamId}:${vaultAddress}:${proposalId})`
        ),
        Atom.keepAlive
      )
)
