import { HttpApiBuilder } from '@effect/platform'
import {
  AppApi,
  CurrentSession,
  ProposalNotFoundError,
  VaultNotFoundErrorSchema,
  VaultsConfig
} from '@radix-vaults/shared'
import { GetEntityDetailsVaultAggregated } from '@radix-effects/gateway'
import { PreviewTransaction } from '@radix-effects/gateway'
import { Effect, Layer } from 'effect'
import { ORM } from '../db/orm'
import { AccessRuleValidator } from '../gateway/accessRuleValidator'
import { GatewayApiClientLayer } from '../gateway/gatewayApiClient'
import { TransactionStatusChecker } from '../gateway/transactionStatusChecker'
import { TransactionSubmitter } from '../gateway/transactionSubmitter'
import { ListVaultsRepo } from '../handlers/listVaultsRepo'
import { ProposalRepo } from '../handlers/proposalRepo'
import { ProposalsHandler } from '../handlers/proposals'
import { SignerSourceRepo } from '../handlers/signerSourceRepo'

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
            return yield* proposalsHandler.create(
              vaultAddress,
              manifest,
              maxProposerTimestamp,
              session.accountAddress
            )
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
      .handle('sign', ({ path: { vaultAddress, proposalId } }) =>
        Effect.gen(function* () {
          const session = yield* CurrentSession
          const proposalsHandler = yield* ProposalsHandler
          return yield* proposalsHandler.sign(
            vaultAddress,
            proposalId,
            session.accountAddress
          )
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
          return yield* proposalsHandler.submit(vaultAddress, proposalId)
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
  Layer.provide(SignerSourceRepo.Default),
  Layer.provide(TransactionSubmitter.Default),
  Layer.provide(TransactionStatusChecker.Default),
  Layer.provide(PreviewTransaction.Default),
  Layer.provide(GetEntityDetailsVaultAggregated.Default),
  Layer.provide(ORM.Default),
  Layer.provide(VaultsConfig.Live),
  Layer.provide(GatewayApiClientLayer)
)
