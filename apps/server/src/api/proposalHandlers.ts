import { HttpApiBuilder } from '@effect/platform'
import {
  AppApi,
  CurrentSession,
  ProposalNotFoundError,
  VaultNotFoundErrorSchema,
  VaultsConfig
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
import {
  TransactionStatusChecker,
  TransactionStatusCheckerLive
} from '../gateway/transactionStatusChecker'
import { ListVaultsRepo } from '../handlers/listVaultsRepo'
import { ProposalRepo } from '../handlers/proposalRepo'
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
          }).pipe(
            Effect.catchTags({
              VaultNotFoundError: (e) =>
                new VaultNotFoundErrorSchema({ vaultAddress: e.vaultAddress })
            })
          )
      )
      .handle('list', ({ path: { vaultAddress } }) =>
        Effect.gen(function* () {
          const proposalsHandler = yield* ProposalsHandler
          return yield* proposalsHandler.list(vaultAddress)
        }).pipe(
          Effect.catchTags({
            VaultNotFoundError: (e) =>
              new VaultNotFoundErrorSchema({ vaultAddress: e.vaultAddress })
          })
        )
      )
      .handle('detail', ({ path: { vaultAddress, proposalId } }) =>
        Effect.gen(function* () {
          const proposalsHandler = yield* ProposalsHandler
          return yield* proposalsHandler.getDetail(vaultAddress, proposalId)
        }).pipe(
          Effect.catchTags({
            VaultNotFoundError: (e) =>
              new VaultNotFoundErrorSchema({ vaultAddress: e.vaultAddress }),
            ProposalNotFoundDbError: (e) =>
              new ProposalNotFoundError({ proposalId: e.proposalId })
          })
        )
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
          }).pipe(
            Effect.catchTags({
              VaultNotFoundError: (e) =>
                new VaultNotFoundErrorSchema({ vaultAddress: e.vaultAddress }),
              ProposalNotFoundDbError: (e) =>
                new ProposalNotFoundError({ proposalId: e.proposalId })
            })
          )
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
        }).pipe(
          Effect.catchTags({
            VaultNotFoundError: (e) =>
              new VaultNotFoundErrorSchema({ vaultAddress: e.vaultAddress }),
            ProposalNotFoundDbError: (e) =>
              new ProposalNotFoundError({ proposalId: e.proposalId })
          })
        )
      )
      .handle('refreshStatus', ({ path: { vaultAddress, proposalId } }) =>
        Effect.gen(function* () {
          const proposalsHandler = yield* ProposalsHandler
          return yield* proposalsHandler.refreshStatus(vaultAddress, proposalId)
        }).pipe(
          Effect.catchTags({
            VaultNotFoundError: (e) =>
              new VaultNotFoundErrorSchema({ vaultAddress: e.vaultAddress }),
            ProposalNotFoundDbError: (e) =>
              new ProposalNotFoundError({ proposalId: e.proposalId })
          })
        )
      )
).pipe(
  Layer.provide(ProposalsHandler.Default),
  Layer.provide(ProposalRepo.Default),
  Layer.provide(ListVaultsRepo.Default),
  Layer.provide(AccessRuleValidator.Default),
  Layer.provide(TransactionStatusCheckerLive),
  Layer.provide(GetLedgerStateService.Default),
  Layer.provide(PreviewTransaction.Default),
  Layer.provide(GetEntityDetailsVaultAggregated.Default),
  Layer.provide(ORM.Default),
  Layer.provide(VaultsConfig.Live),
  Layer.provide(GatewayApiClientLayer)
)
