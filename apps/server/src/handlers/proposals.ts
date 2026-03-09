import type {
  CreateProposalResponse,
  ProposalDetail,
  ProposalListItem,
  VaultAddress as VaultAddressType
} from '@radix-vaults/shared'
import { PreviewTransaction } from '@radix-effects/gateway'
import { Data, Effect } from 'effect'
import { ListVaultsRepo, type VaultNotFoundError } from './listVaultsRepo'
import { ProposalRepo, type ProposalNotFoundDbError } from './proposalRepo'

export class ManifestPreviewFailedError extends Data.TaggedError(
  'ManifestPreviewFailedError'
)<{
  message: string
}> {}

export class ProposalsHandler extends Effect.Service<ProposalsHandler>()(
  '@radix-vaults/server/handlers/ProposalsHandler',
  {
    effect: Effect.gen(function* () {
      const listVaultsRepo = yield* ListVaultsRepo
      const proposalRepo = yield* ProposalRepo
      const previewFn = yield* PreviewTransaction

      const create = (
        vaultAddress: VaultAddressType,
        manifest: string,
        maxProposerTimestamp: string,
        createdBy: string
      ): Effect.Effect<
        CreateProposalResponse,
        VaultNotFoundError | ManifestPreviewFailedError
      > =>
        Effect.gen(function* () {
          yield* listVaultsRepo.ensureExists(vaultAddress)

          yield* previewFn({
            payload: {
              manifest,
              flags: {
                assume_all_signature_proofs: true,
                use_free_credit: true,
                skip_epoch_check: true
              }
            }
          }).pipe(
            Effect.catchAll(
              (e) =>
                new ManifestPreviewFailedError({
                  message: `Preview failed: ${e._tag ?? String(e)}`
                })
            )
          )

          return yield* proposalRepo.insert({
            vaultAddress,
            manifest,
            maxProposerTimestamp,
            createdBy
          })
        })

      const list = (
        vaultAddress: VaultAddressType
      ): Effect.Effect<ReadonlyArray<ProposalListItem>, VaultNotFoundError> =>
        Effect.gen(function* () {
          yield* listVaultsRepo.ensureExists(vaultAddress)
          return yield* proposalRepo.listByVault(vaultAddress)
        })

      const getDetail = (
        vaultAddress: VaultAddressType,
        proposalId: number
      ): Effect.Effect<
        ProposalDetail,
        VaultNotFoundError | ProposalNotFoundDbError
      > =>
        Effect.gen(function* () {
          yield* listVaultsRepo.ensureExists(vaultAddress)
          return yield* proposalRepo.getById(vaultAddress, proposalId)
        })

      return { create, list, getDetail } as const
    })
  }
) {}
