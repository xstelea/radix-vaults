import type {
  AccountAddress,
  CreateProposalResponse,
  ProposalDetail,
  ProposalListItem,
  VaultAddress as VaultAddressType
} from '@radix-vaults/shared'
import { PreviewTransaction } from '@radix-effects/gateway'
import { blake2b } from '@noble/hashes/blake2.js'
import { Data, Effect } from 'effect'
import { AccessRuleValidator } from '../gateway/accessRuleValidator'
import { ListVaultsRepo, type VaultNotFoundError } from './listVaultsRepo'
import { ProposalRepo, type ProposalNotFoundDbError } from './proposalRepo'
import { SignerSourceRepo } from './signerSourceRepo'

export class ManifestPreviewFailedError extends Data.TaggedError(
  'ManifestPreviewFailedError'
)<{
  message: string
}> {}

export class SignerSourceMissingHandlerError extends Data.TaggedError(
  'SignerSourceMissingHandlerError'
)<{
  message: string
}> {}

export class NotEligibleSignerHandlerError extends Data.TaggedError(
  'NotEligibleSignerHandlerError'
)<{
  message: string
}> {}

export class AlreadySignedHandlerError extends Data.TaggedError(
  'AlreadySignedHandlerError'
)<{
  message: string
}> {}

export class ProposalNotSignableHandlerError extends Data.TaggedError(
  'ProposalNotSignableHandlerError'
)<{
  message: string
}> {}

const SIGNABLE_STATUSES = new Set(['created', 'signing'])

const ED25519_RESOURCE_SUFFIX = 'ed25sg'

const keyTypeFromResource = (
  resourceAddress: string
): 'ed25519' | 'secp256k1' =>
  resourceAddress.endsWith(ED25519_RESOURCE_SUFFIX) ? 'ed25519' : 'secp256k1'

export const createPublicKeyHash = (publicKeyHex: string): string => {
  const hash = blake2b(Buffer.from(publicKeyHex, 'hex'), { dkLen: 32 })
  const last29 = hash.subarray(-29)
  return Buffer.from(last29).toString('hex')
}

export class ProposalsHandler extends Effect.Service<ProposalsHandler>()(
  '@radix-vaults/server/handlers/ProposalsHandler',
  {
    effect: Effect.gen(function* () {
      const listVaultsRepo = yield* ListVaultsRepo
      const proposalRepo = yield* ProposalRepo
      const previewFn = yield* PreviewTransaction
      const accessRuleValidator = yield* AccessRuleValidator
      const signerSourceRepo = yield* SignerSourceRepo

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

      const getSignatureProgress = (
        vaultAddress: VaultAddressType,
        proposalId: number
      ) =>
        Effect.gen(function* () {
          const signatures = yield* proposalRepo.getSignatures(proposalId)

          const accessRule = yield* accessRuleValidator
            .validate(vaultAddress)
            .pipe(Effect.orDie)

          const threshold =
            accessRule.type === 'CountOf'
              ? accessRule.count
              : accessRule.signers.length

          return {
            collected: signatures.length,
            required: threshold,
            signatures: signatures.map((s) => ({
              signerAccountAddress: s.signerAccountAddress,
              signerKeyHash: s.signerKeyHash,
              signerKeyType: s.signerKeyType as 'ed25519' | 'secp256k1',
              signedAt: s.signedAt
            }))
          }
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
          const proposal = yield* proposalRepo.getById(vaultAddress, proposalId)
          const signatureProgress = yield* getSignatureProgress(
            vaultAddress,
            proposalId
          )

          return { ...proposal, signatureProgress }
        })

      const sign = (
        vaultAddress: VaultAddressType,
        proposalId: number,
        signerAccountAddress: AccountAddress
      ): Effect.Effect<
        { ok: true },
        | VaultNotFoundError
        | ProposalNotFoundDbError
        | ProposalNotSignableHandlerError
        | SignerSourceMissingHandlerError
        | NotEligibleSignerHandlerError
        | AlreadySignedHandlerError
      > =>
        Effect.gen(function* () {
          yield* listVaultsRepo.ensureExists(vaultAddress)
          const proposal = yield* proposalRepo.getById(vaultAddress, proposalId)

          if (!SIGNABLE_STATUSES.has(proposal.status)) {
            return yield* new ProposalNotSignableHandlerError({
              message: `Proposal is in '${proposal.status}' status and cannot be signed`
            })
          }

          // Look up signer source for authenticated member
          const sources = yield* signerSourceRepo.list()
          const signerSource = sources.find(
            (s) => s.accountAddress === signerAccountAddress
          )
          if (!signerSource) {
            return yield* new SignerSourceMissingHandlerError({
              message:
                'You must register a signer source before signing proposals'
            })
          }

          // Validate signer key against vault access rule
          const accessRule = yield* accessRuleValidator
            .validate(vaultAddress)
            .pipe(Effect.orDie)

          const signerKeyHash = createPublicKeyHash(signerSource.publicKey)
          const matchingSigner = accessRule.signers.find(
            (s) => s.localId === `<${signerKeyHash}>`
          )
          if (!matchingSigner) {
            return yield* new NotEligibleSignerHandlerError({
              message:
                'Your registered signer source does not match any vault signer'
            })
          }

          const signerKeyType = keyTypeFromResource(
            matchingSigner.resourceAddress
          )

          // Persist signature
          yield* proposalRepo
            .addSignature({
              proposalId,
              signerAccountAddress,
              signerKeyHash,
              signerKeyType
            })
            .pipe(
              Effect.catchTag('DuplicateSignatureDbError', () =>
                Effect.fail(
                  new AlreadySignedHandlerError({
                    message: 'You have already signed this proposal'
                  })
                )
              )
            )

          // Update status based on threshold
          const signatures = yield* proposalRepo.getSignatures(proposalId)
          const threshold =
            accessRule.type === 'CountOf'
              ? accessRule.count
              : accessRule.signers.length

          if (signatures.length >= threshold) {
            yield* proposalRepo.updateStatus(proposalId, 'ready')
          } else if (proposal.status === 'created') {
            yield* proposalRepo.updateStatus(proposalId, 'signing')
          }

          return { ok: true as const }
        })

      return { create, list, getDetail, sign } as const
    })
  }
) {}
