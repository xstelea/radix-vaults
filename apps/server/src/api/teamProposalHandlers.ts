import { HttpApiBuilder } from '@effect/platform'
import {
  AppApi,
  AuthConfig,
  CurrentSession,
  TeamProposalNotFoundError,
  VaultNotFoundErrorSchema
} from '@radix-vaults/shared'
import {
  GetEntityDetailsVaultAggregated,
  GetLedgerStateService,
  PreviewTransaction
} from '@radix-effects/gateway'
import { Effect, Layer } from 'effect'
import { ORM } from '../db/orm'
import { AccessRuleValidator } from '../gateway/accessRuleValidator'
import { GatewayApiClientLayer } from '../gateway/gatewayApiClient'
import { TransactionStatusCheckerLive } from '../gateway/transactionStatusChecker'
import { ListVaultsRepo } from '../handlers/listVaultsRepo'
import { ProposalRepo } from '../handlers/proposalRepo'
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
        }).pipe(
          Effect.catchTags({
            VaultNotFoundError: (e) =>
              new VaultNotFoundErrorSchema({ vaultAddress: e.vaultAddress })
          })
        )
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
).pipe(
  Layer.provide(TeamProposalsHandler.Default),
  Layer.provide(ProposalRepo.Default),
  Layer.provide(ListVaultsRepo.Default),
  Layer.provide(AccessRuleValidator.Default),
  Layer.provide(TransactionStatusCheckerLive),
  Layer.provide(GetLedgerStateService.Default),
  Layer.provide(PreviewTransaction.Default),
  Layer.provide(GetEntityDetailsVaultAggregated.Default),
  Layer.provide(AuthConfig.Live),
  Layer.provide(ORM.Default),
  Layer.provide(GatewayApiClientLayer)
)
