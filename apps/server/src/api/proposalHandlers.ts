import { HttpApiBuilder } from '@effect/platform'
import { AppApi, CurrentSession } from '@radix-vaults/shared'
import { Effect, Layer } from 'effect'
import { TeamHandler } from '../handlers/team'
import { ProposalsHandler } from '../handlers/proposals'

const getNameByAddress = () =>
  Effect.gen(function* () {
    const teamHandler = yield* TeamHandler
    const overview = yield* teamHandler.getOverview()
    return new Map(overview.badgeHolders.map((h) => [h.holderAddress, h.name]))
  })

const enrichSignatures = (
  signatureProgress: {
    collected: number
    required: number
    signatures: Array<{
      signerAccountAddress: string
      signerKeyHash: string
      signerKeyType: 'ed25519' | 'secp256k1'
      signedAt: string
    }>
  },
  nameByAddress: Map<string, string>
) => ({
  ...signatureProgress,
  signatures: signatureProgress.signatures.map((s) => ({
    ...s,
    signerName: nameByAddress.get(s.signerAccountAddress) ?? null
  }))
})

export const ProposalHandlersLive = HttpApiBuilder.group(
  AppApi,
  'proposals',
  (handlers) =>
    handlers
      .handle(
        'create',
        ({
          path: { vaultAddress },
          payload: { manifest, maxProposerTimestamp }
        }) =>
          Effect.gen(function* () {
            const session = yield* CurrentSession
            const proposalsHandler = yield* ProposalsHandler
            const result = yield* proposalsHandler.create(
              vaultAddress,
              manifest,
              maxProposerTimestamp,
              session.accountAddress
            )
            yield* Effect.logInfo('Proposal created').pipe(
              Effect.annotateLogs({
                vaultAddress,
                proposalId: result.id,
                createdBy: session.accountAddress
              })
            )
            return result
          })
      )
      .handle('list', ({ path: { vaultAddress } }) =>
        Effect.gen(function* () {
          const proposalsHandler = yield* ProposalsHandler
          const [proposals, nameByAddress] = yield* Effect.all([
            proposalsHandler.list(vaultAddress),
            getNameByAddress()
          ])
          return proposals.map((p) => ({
            ...p,
            createdByName: nameByAddress.get(p.createdBy) ?? null
          }))
        })
      )
      .handle('detail', ({ path: { vaultAddress, proposalId } }) =>
        Effect.gen(function* () {
          const proposalsHandler = yield* ProposalsHandler
          const [proposal, nameByAddress] = yield* Effect.all([
            proposalsHandler.getDetail(vaultAddress, proposalId),
            getNameByAddress()
          ])
          return {
            ...proposal,
            createdByName: nameByAddress.get(proposal.createdBy) ?? null,
            signatureProgress: enrichSignatures(
              proposal.signatureProgress,
              nameByAddress
            )
          }
        })
      )
      .handle(
        'sign',
        ({
          path: { vaultAddress, proposalId },
          payload: { signedPartialTransactionHex }
        }) =>
          Effect.gen(function* () {
            const session = yield* CurrentSession
            const proposalsHandler = yield* ProposalsHandler
            const result = yield* proposalsHandler.sign(
              vaultAddress,
              proposalId,
              session.accountAddress,
              signedPartialTransactionHex
            )
            yield* Effect.logInfo('Proposal signed').pipe(
              Effect.annotateLogs({
                vaultAddress,
                proposalId,
                signer: session.accountAddress
              })
            )
            return result
          })
      )
      .handle('submit', ({ path: { vaultAddress, proposalId } }) =>
        Effect.gen(function* () {
          const proposalsHandler = yield* ProposalsHandler
          const result = yield* proposalsHandler.submit(
            vaultAddress,
            proposalId
          )
          yield* Effect.logInfo('Proposal submitted').pipe(
            Effect.annotateLogs({ vaultAddress, proposalId })
          )
          return result
        })
      )
      .handle('refreshStatus', ({ path: { vaultAddress, proposalId } }) =>
        Effect.gen(function* () {
          const proposalsHandler = yield* ProposalsHandler
          return yield* proposalsHandler.refreshStatus(vaultAddress, proposalId)
        })
      )
).pipe(
  Layer.provide(ProposalsHandler.Default),
  Layer.provide(TeamHandler.Default)
)
