import { HttpApiBuilder } from '@effect/platform'
import {
  AppApi,
  CurrentSession,
  TeamProposalNotFoundError
} from '@radix-vaults/shared'
import { Effect, Layer } from 'effect'
import { TeamProposalsHandler } from '../handlers/teamProposals'

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
          return yield* handler.list()
        })
      )
      .handle('detail', ({ path: { proposalId } }) =>
        Effect.gen(function* () {
          const handler = yield* TeamProposalsHandler
          return yield* handler.getDetail(proposalId)
        }).pipe(
          Effect.catchTags({
            ProposalNotFoundDbError: (e) =>
              new TeamProposalNotFoundError({ proposalId: e.proposalId })
          })
        )
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
          }).pipe(
            Effect.catchTags({
              ProposalNotFoundDbError: (e) =>
                new TeamProposalNotFoundError({ proposalId: e.proposalId })
            })
          )
      )
      .handle('submit', ({ path: { proposalId } }) =>
        Effect.gen(function* () {
          const handler = yield* TeamProposalsHandler
          const result = yield* handler.submit(proposalId)
          yield* Effect.logInfo('Team proposal submitted').pipe(
            Effect.annotateLogs({ proposalId })
          )
          return result
        }).pipe(
          Effect.catchTags({
            ProposalNotFoundDbError: (e) =>
              new TeamProposalNotFoundError({ proposalId: e.proposalId })
          })
        )
      )
      .handle('refreshStatus', ({ path: { proposalId } }) =>
        Effect.gen(function* () {
          const handler = yield* TeamProposalsHandler
          return yield* handler.refreshStatus(proposalId)
        }).pipe(
          Effect.catchTags({
            ProposalNotFoundDbError: (e) =>
              new TeamProposalNotFoundError({ proposalId: e.proposalId })
          })
        )
      )
).pipe(Layer.provide(TeamProposalsHandler.Default))
