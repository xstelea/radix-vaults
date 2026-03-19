import { HttpApiBuilder } from '@effect/platform'
import { AppApi, CurrentSession } from '@radix-vaults/shared'
import { Effect, Layer } from 'effect'
import { TeamMembershipChecker } from '../auth/teamMembershipChecker'
import { TeamHandler } from '../handlers/team'
import { TeamProposalsHandler } from '../handlers/teamProposals'

const getNameByAddress = (teamId: string) =>
  Effect.gen(function* () {
    const teamHandler = yield* TeamHandler
    const overview = yield* teamHandler.getOverview(teamId)
    return new Map(overview.badgeHolders.map((h) => [h.holderAddress, h.name]))
  })

export const TeamProposalHandlersLive = HttpApiBuilder.group(
  AppApi,
  'teamProposals',
  (handlers) =>
    handlers
      .handle('addMember', ({ path: { teamId }, payload }) =>
        Effect.gen(function* () {
          const session = yield* CurrentSession
          const checker = yield* TeamMembershipChecker
          yield* checker.check(teamId, session.accountAddress)
          const handler = yield* TeamProposalsHandler
          const result = yield* handler.createAddMember(
            teamId,
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
      .handle('removeMember', ({ path: { teamId }, payload }) =>
        Effect.gen(function* () {
          const session = yield* CurrentSession
          const checker = yield* TeamMembershipChecker
          yield* checker.check(teamId, session.accountAddress)
          const handler = yield* TeamProposalsHandler
          const result = yield* handler.createRemoveMember(
            teamId,
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
      .handle('changeThreshold', ({ path: { teamId }, payload }) =>
        Effect.gen(function* () {
          const session = yield* CurrentSession
          const checker = yield* TeamMembershipChecker
          yield* checker.check(teamId, session.accountAddress)
          const handler = yield* TeamProposalsHandler
          const result = yield* handler.createChangeThreshold(
            teamId,
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
      .handle('list', ({ path: { teamId } }) =>
        Effect.gen(function* () {
          const handler = yield* TeamProposalsHandler
          const [proposals, nameByAddress] = yield* Effect.all([
            handler.list(teamId),
            getNameByAddress(teamId)
          ])
          return proposals.map((p) => ({
            ...p,
            createdByName: nameByAddress.get(p.createdBy) ?? null
          }))
        })
      )
      .handle('detail', ({ path: { teamId, proposalId } }) =>
        Effect.gen(function* () {
          const handler = yield* TeamProposalsHandler
          const [proposal, nameByAddress] = yield* Effect.all([
            handler.getDetail(teamId, proposalId),
            getNameByAddress(teamId)
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
        ({
          path: { teamId, proposalId },
          payload: { signedPartialTransactionHex }
        }) =>
          Effect.gen(function* () {
            const session = yield* CurrentSession
            const checker = yield* TeamMembershipChecker
            yield* checker.check(teamId, session.accountAddress)
            const handler = yield* TeamProposalsHandler
            const result = yield* handler.sign(
              teamId,
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
      .handle('submit', ({ path: { teamId, proposalId } }) =>
        Effect.gen(function* () {
          const session = yield* CurrentSession
          const checker = yield* TeamMembershipChecker
          yield* checker.check(teamId, session.accountAddress)
          const handler = yield* TeamProposalsHandler
          const result = yield* handler.submit(teamId, proposalId)
          yield* Effect.logInfo('Team proposal submitted').pipe(
            Effect.annotateLogs({ proposalId })
          )
          return result
        })
      )
      .handle('refreshStatus', ({ path: { teamId, proposalId } }) =>
        Effect.gen(function* () {
          const session = yield* CurrentSession
          const checker = yield* TeamMembershipChecker
          yield* checker.check(teamId, session.accountAddress)
          const handler = yield* TeamProposalsHandler
          return yield* handler.refreshStatus(teamId, proposalId)
        })
      )
).pipe(
  Layer.provide(TeamProposalsHandler.Default),
  Layer.provide(TeamHandler.Default),
  Layer.provide(TeamMembershipChecker.Default)
)
