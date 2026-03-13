import { Atom } from '@effect-atom/atom-react'
import type {
  ProposalDetail,
  ProposalId,
  VaultAddress
} from '@radix-vaults/shared'
import { SubintentRequestBuilder } from '@radixdlt/radix-dapp-toolkit'
import { Data, Effect, Layer, Option, Ref } from 'effect'
import { makeAtomRuntime } from '@/atom/makeRuntimeAtom'
import { AppApiClient } from '@/lib/apiClient'
import { disconnectOnUnauthorized } from '@/lib/disconnectOnUnauthorized'
import { RadixDappToolkit } from '@/lib/radixDappToolkit'
import { ProposalService } from '@/services/proposal'
import { withToast } from '@/atom/withToast'

const runtime = makeAtomRuntime(
  Layer.merge(
    ProposalService.Default,
    RadixDappToolkit.Live.pipe(Layer.provide(AppApiClient.Default))
  )
)

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

export class CreateProposalError extends Data.TaggedError(
  'CreateProposalError'
)<{
  message: string
}> {}

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

const ensureYieldToParent = (manifest: string): string => {
  const trimmed = manifest.trim()
  if (trimmed.endsWith('YIELD_TO_PARENT;')) return trimmed
  return `${trimmed}\nYIELD_TO_PARENT;\n`
}

const requestWalletSignature = (
  proposal: ProposalDetail
): Effect.Effect<string, WalletSigningError, RadixDappToolkit> =>
  Effect.gen(function* () {
    const rdtRef = yield* RadixDappToolkit
    const rdt = yield* Ref.get(rdtRef)

    const maxTs = new Date(
      proposal.maxProposerTimestamp.endsWith('Z')
        ? proposal.maxProposerTimestamp
        : proposal.maxProposerTimestamp + 'Z'
    )
    const expirationSeconds = Math.floor(maxTs.getTime() / 1000)

    const request = SubintentRequestBuilder()
      .manifest(ensureYieldToParent(proposal.manifest))
      .header({
        startEpochInclusive: proposal.epochMin,
        endEpochExclusive: proposal.epochMax,
        maxProposerTimestampExclusive: Math.floor(maxTs.getTime() / 1000),
        minProposerTimestampInclusive: Math.floor(
          new Date(proposal.createdAt).getTime() / 1000
        ),
        intentDiscriminator: Number(proposal.intentDiscriminator)
      })
      .setExpiration('atTime', expirationSeconds)
      .message('')

    const result = yield* Effect.promise(() =>
      rdt.walletApi.sendPreAuthorizationRequest(request)
    )

    if (result.isErr()) {
      return yield* new WalletSigningError({
        message: result.error.message ?? 'Wallet rejected the signing request'
      })
    }

    return result.value.signedPartialTransaction
  })

class WalletSigningError extends Data.TaggedError('WalletSigningError')<{
  message: string
}> {}

export const signProposal = runtime.fn(
  (args: {
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
  (args: { vaultAddress: VaultAddress; proposalId: ProposalId }) =>
    Effect.gen(function* () {
      const svc = yield* ProposalService
      return yield* svc.submit(args.vaultAddress, args.proposalId)
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
  (args: { vaultAddress: VaultAddress; proposalId: ProposalId }) =>
    Effect.gen(function* () {
      const svc = yield* ProposalService
      return yield* svc.refreshStatus(args.vaultAddress, args.proposalId)
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

export const previewProposal = runtime.fn(
  (args: { vaultAddress: VaultAddress; proposalId: ProposalId }) =>
    Effect.gen(function* () {
      const svc = yield* ProposalService
      return yield* svc.preview(args.vaultAddress, args.proposalId)
    })
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
