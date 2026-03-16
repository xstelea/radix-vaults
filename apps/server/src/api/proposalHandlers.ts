import { HttpApiBuilder } from '@effect/platform'
import { AppApi, CurrentSession } from '@radix-vaults/shared'
import { Effect, Layer } from 'effect'
import { ProposalsHandler } from '../handlers/proposals'

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
          return yield* proposalsHandler.list(vaultAddress)
        })
      )
      .handle('detail', ({ path: { vaultAddress, proposalId } }) =>
        Effect.gen(function* () {
          const proposalsHandler = yield* ProposalsHandler
          return yield* proposalsHandler.getDetail(vaultAddress, proposalId)
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
).pipe(Layer.provide(ProposalsHandler.Default))
