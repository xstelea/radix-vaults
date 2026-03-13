import type { ProposalDetail, TeamProposalDetail } from '@radix-vaults/shared'
import { SubintentRequestBuilder } from '@radixdlt/radix-dapp-toolkit'
import { Data, Effect, Ref } from 'effect'
import { RadixDappToolkit } from '@/lib/radixDappToolkit'

export class WalletSigningError extends Data.TaggedError('WalletSigningError')<{
  message: string
}> {}

const ensureYieldToParent = (manifest: string): string => {
  const trimmed = manifest.trim()
  if (trimmed.endsWith('YIELD_TO_PARENT;')) return trimmed
  return `${trimmed}\nYIELD_TO_PARENT;\n`
}

type SignableProposal = Pick<
  ProposalDetail | TeamProposalDetail,
  | 'manifest'
  | 'epochMin'
  | 'epochMax'
  | 'maxProposerTimestamp'
  | 'createdAt'
  | 'intentDiscriminator'
>

export const requestWalletSignature = (
  proposal: SignableProposal
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
