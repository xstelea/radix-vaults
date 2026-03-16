import { HttpApiBuilder } from '@effect/platform'
import { AppApi, CurrentSession } from '@radix-vaults/shared'
import { Effect, Layer } from 'effect'
import { TeamHandler } from '../handlers/team'
import { TeamProposalsHandler } from '../handlers/teamProposals'

const getNameByAddress = () =>
  Effect.gen(function* () {
    const teamHandler = yield* TeamHandler
    const overview = yield* teamHandler.getOverview()
    return new Map(overview.badgeHolders.map((h) => [h.holderAddress, h.name]))
  })

export const TeamProposalHandlersLive = HttpApiBuilder.group(
  AppApi,
  'teamProposals',
  (handlers) =>
    handlers
      .handle('addMember', ({ payload }) =>
        Effect.gen(function* () {
          const session = yield* CurrentSession
          const handler = yield* TeamProposalsHandler
          const result = yield* handler.createAddMember(
            payload,
            session.accountAddress
          )
          yield* Effect.logInfo('Team add-member proposal created').pipe(
            Effect.annotateLogs({
              proposalId: result.id,
              createdBy: session.accountAddress
            })
          )
          return result
        })
      )
      .handle('removeMember', ({ payload }) =>
        Effect.gen(function* () {
          const session = yield* CurrentSession
          const handler = yield* TeamProposalsHandler
          const result = yield* handler.createRemoveMember(
            payload,
            session.accountAddress
          )
          yield* Effect.logInfo('Team remove-member proposal created').pipe(
            Effect.annotateLogs({
              proposalId: result.id,
              createdBy: session.accountAddress
            })
          )
          return result
        })
      )
      .handle('changeThreshold', ({ payload }) =>
        Effect.gen(function* () {
          const session = yield* CurrentSession
          const handler = yield* TeamProposalsHandler
          const result = yield* handler.createChangeThreshold(
            payload,
            session.accountAddress
          )
          yield* Effect.logInfo('Team change-threshold proposal created').pipe(
            Effect.annotateLogs({
              proposalId: result.id,
              createdBy: session.accountAddress
            })
          )
          return result
        })
      )
      .handle('list', () =>
        Effect.gen(function* () {
          const handler = yield* TeamProposalsHandler
          const [proposals, nameByAddress] = yield* Effect.all([
            handler.list(),
            getNameByAddress()
          ])
          return proposals.map((p) => ({
            ...p,
            createdByName: nameByAddress.get(p.createdBy) ?? null
          }))
        })
      )
      .handle('detail', ({ path: { proposalId } }) =>
        Effect.gen(function* () {
          const handler = yield* TeamProposalsHandler
          const [proposal, nameByAddress] = yield* Effect.all([
            handler.getDetail(proposalId),
            getNameByAddress()
          ])
          return {
            ...proposal,
            createdByName: nameByAddress.get(proposal.createdBy) ?? null,
            signatureProgress: {
              ...proposal.signatureProgress,
              signatures: proposal.signatureProgress.signatures.map((s) => ({
                ...s,
                signerName: nameByAddress.get(s.signerAccountAddress) ?? null
              }))
            }
          }
        })
      )
      .handle(
        'sign',
        ({ path: { proposalId }, payload: { signedPartialTransactionHex } }) =>
          Effect.gen(function* () {
            const session = yield* CurrentSession
            const handler = yield* TeamProposalsHandler
            const result = yield* handler.sign(
              proposalId,
              session.accountAddress,
              signedPartialTransactionHex
            )
            yield* Effect.logInfo('Team proposal signed').pipe(
              Effect.annotateLogs({
                proposalId,
                signer: session.accountAddress
              })
            )
            return result
          })
      )
      .handle('submit', ({ path: { proposalId } }) =>
        Effect.gen(function* () {
          const handler = yield* TeamProposalsHandler
          const result = yield* handler.submit(proposalId)
          yield* Effect.logInfo('Team proposal submitted').pipe(
            Effect.annotateLogs({ proposalId })
          )
          return result
        })
      )
      .handle('refreshStatus', ({ path: { proposalId } }) =>
        Effect.gen(function* () {
          const handler = yield* TeamProposalsHandler
          return yield* handler.refreshStatus(proposalId)
        })
      )
).pipe(
  Layer.provide(TeamProposalsHandler.Default),
  Layer.provide(TeamHandler.Default)
)
