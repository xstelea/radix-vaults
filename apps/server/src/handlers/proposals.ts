import type {
  AccountAddress,
  VaultAddress as VaultAddressType
} from '@radix-vaults/shared'
import {
  AlreadySignedError,
  NotEligibleSignerError,
  ProposalExpiredError,
  ProposalInvalidError,
  ProposalNotReadyError,
  ProposalNotSignableError,
  ProposalNotSubmittedError,
  ProposalPreviewFailedError,
  ProposalStatusCheckFailedError,
  ProposalSubmitFailedError,
  SignerSourceMissingError
} from '@radix-vaults/shared'
import { PreviewTransaction } from '@radix-effects/gateway'
import { blake2b } from '@noble/hashes/blake2.js'
import { Effect } from 'effect'
import { AccessRuleValidator } from '../gateway/accessRuleValidator'
import { TransactionStatusChecker } from '../gateway/transactionStatusChecker'
import { TransactionSubmitter } from '../gateway/transactionSubmitter'
import { ListVaultsRepo } from './listVaultsRepo'
import { ProposalRepo } from './proposalRepo'
import { SignerSourceRepo } from './signerSourceRepo'

const SIGNABLE_STATUSES = new Set(['created', 'signing'])

const isExpired = (maxProposerTimestamp: string): boolean => {
  const deadline = new Date(maxProposerTimestamp)
  return !isNaN(deadline.getTime()) && deadline.getTime() < Date.now()
}

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
      const transactionSubmitter = yield* TransactionSubmitter
      const transactionStatusChecker = yield* TransactionStatusChecker

      const create = (
        vaultAddress: VaultAddressType,
        manifest: string,
        maxProposerTimestamp: string,
        createdBy: string
      ) =>
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
                new ProposalPreviewFailedError({
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

      const list = (vaultAddress: VaultAddressType) =>
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

      const getDetail = (vaultAddress: VaultAddressType, proposalId: number) =>
        Effect.gen(function* () {
          yield* listVaultsRepo.ensureExists(vaultAddress)
          const proposal = yield* proposalRepo.getById(vaultAddress, proposalId)
          const signatureProgress = yield* getSignatureProgress(
            vaultAddress,
            proposalId
          )

          return {
            ...proposal,
            signatureProgress,
            statusReason: proposal.statusReason
          }
        })

      const sign = (
        vaultAddress: VaultAddressType,
        proposalId: number,
        signerAccountAddress: AccountAddress
      ) =>
        Effect.gen(function* () {
          yield* listVaultsRepo.ensureExists(vaultAddress)
          const proposal = yield* proposalRepo.getById(vaultAddress, proposalId)

          if (!SIGNABLE_STATUSES.has(proposal.status)) {
            return yield* new ProposalNotSignableError({
              message: `Proposal is in '${proposal.status}' status and cannot be signed`
            })
          }

          // Check expiry before allowing signature
          if (isExpired(proposal.maxProposerTimestamp)) {
            const reason = `Proposal expired: max proposer timestamp ${proposal.maxProposerTimestamp} has passed`
            yield* proposalRepo.setTerminalStatus(proposalId, 'expired', reason)
            return yield* new ProposalExpiredError({ message: reason })
          }

          // Look up signer source for authenticated member
          const sources = yield* signerSourceRepo.list()
          const signerSource = sources.find(
            (s) => s.accountAddress === signerAccountAddress
          )
          if (!signerSource) {
            return yield* new SignerSourceMissingError({
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
            return yield* new NotEligibleSignerError({
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
                  new AlreadySignedError({
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

      const submit = (vaultAddress: VaultAddressType, proposalId: number) =>
        Effect.gen(function* () {
          yield* listVaultsRepo.ensureExists(vaultAddress)
          const proposal = yield* proposalRepo.getById(vaultAddress, proposalId)

          // Idempotent: if already submitted, return existing hash
          if (
            proposal.transactionIntentHash &&
            (proposal.status === 'submitted' || proposal.status === 'committed')
          ) {
            return {
              intentHash: proposal.transactionIntentHash,
              status: proposal.status
            }
          }

          if (proposal.status !== 'ready') {
            return yield* new ProposalNotReadyError({
              message: `Proposal is in '${proposal.status}' status and cannot be submitted (must be 'ready')`
            })
          }

          // Check expiry before submitting
          if (isExpired(proposal.maxProposerTimestamp)) {
            const reason = `Proposal expired: max proposer timestamp ${proposal.maxProposerTimestamp} has passed`
            yield* proposalRepo.setTerminalStatus(proposalId, 'expired', reason)
            return yield* new ProposalExpiredError({ message: reason })
          }

          // Re-check signer threshold — mark invalid on drift
          const signatures = yield* proposalRepo.getSignatures(proposalId)
          const accessRule = yield* accessRuleValidator
            .validate(vaultAddress)
            .pipe(Effect.orDie)

          const threshold =
            accessRule.type === 'CountOf'
              ? accessRule.count
              : accessRule.signers.length

          if (signatures.length < threshold) {
            const reason = `Signer/threshold drift: ${signatures.length} signatures collected but ${threshold} now required`
            yield* proposalRepo.setTerminalStatus(proposalId, 'invalid', reason)
            return yield* new ProposalInvalidError({ message: reason })
          }

          // Re-preview manifest — mark invalid on failure
          yield* previewFn({
            payload: {
              manifest: proposal.manifest,
              flags: {
                assume_all_signature_proofs: true,
                use_free_credit: true,
                skip_epoch_check: true
              }
            }
          }).pipe(
            Effect.catchAll((e) => {
              const reason = `Manifest no longer valid: ${e._tag ?? String(e)}`
              return proposalRepo
                .setTerminalStatus(proposalId, 'invalid', reason)
                .pipe(
                  Effect.flatMap(() =>
                    Effect.fail(new ProposalInvalidError({ message: reason }))
                  )
                )
            })
          )

          // Build signer list from collected signatures
          const signerSourceList = yield* signerSourceRepo.list()
          const signers = signatures
            .map((sig) => {
              const source = signerSourceList.find(
                (s) => s.accountAddress === sig.signerAccountAddress
              )
              return source
                ? {
                    publicKey: source.publicKey,
                    keyType: source.keyType as 'ed25519' | 'secp256k1'
                  }
                : null
            })
            .filter((s): s is NonNullable<typeof s> => s !== null)

          // Submit via TransactionSubmitter
          const { intentHash } = yield* transactionSubmitter({
            manifest: proposal.manifest,
            signers
          }).pipe(
            Effect.catchTag('TransactionSubmitError', (e) =>
              Effect.fail(
                new ProposalSubmitFailedError({
                  message: e.message
                })
              )
            )
          )

          // Persist submission
          yield* proposalRepo.setSubmitted(proposalId, intentHash)

          return { intentHash, status: 'submitted' as const }
        })

      const refreshStatus = (
        vaultAddress: VaultAddressType,
        proposalId: number
      ) =>
        Effect.gen(function* () {
          yield* listVaultsRepo.ensureExists(vaultAddress)
          const proposal = yield* proposalRepo.getById(vaultAddress, proposalId)

          // Idempotent: if already in terminal state, return current
          if (proposal.status === 'committed' || proposal.status === 'failed') {
            return {
              status: proposal.status,
              transactionIntentHash: proposal.transactionIntentHash,
              submittedAt: proposal.submittedAt
            }
          }

          if (
            proposal.status !== 'submitted' ||
            !proposal.transactionIntentHash
          ) {
            return yield* new ProposalNotSubmittedError({
              message: `Proposal is in '${proposal.status}' status — only submitted proposals can be refreshed`
            })
          }

          const { intentStatus } = yield* transactionStatusChecker({
            intentHash: proposal.transactionIntentHash
          }).pipe(
            Effect.catchTag('TransactionStatusCheckError', (e) =>
              Effect.fail(
                new ProposalStatusCheckFailedError({
                  message: e.message
                })
              )
            )
          )

          if (intentStatus === 'CommittedSuccess') {
            yield* proposalRepo.updateStatus(proposalId, 'committed')
            return {
              status: 'committed' as const,
              transactionIntentHash: proposal.transactionIntentHash,
              submittedAt: proposal.submittedAt
            }
          }

          if (
            intentStatus === 'CommittedFailure' ||
            intentStatus === 'Rejected'
          ) {
            yield* proposalRepo.updateStatus(proposalId, 'failed')
            return {
              status: 'failed' as const,
              transactionIntentHash: proposal.transactionIntentHash,
              submittedAt: proposal.submittedAt
            }
          }

          // Pending or Unknown — no status change
          return {
            status: proposal.status,
            transactionIntentHash: proposal.transactionIntentHash,
            submittedAt: proposal.submittedAt
          }
        })

      return { create, list, getDetail, sign, submit, refreshStatus } as const
    })
  }
) {}
