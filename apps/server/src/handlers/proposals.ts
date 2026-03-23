import type {
  AccountAddress,
  ProposalId,
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
  ProposalSubmitFailedError
} from '@radix-vaults/shared'
import {
  GetLedgerStateService,
  PreviewTransaction
} from '@radix-effects/gateway'
import { Config, DateTime, Effect, Option } from 'effect'
import { AccessRuleValidator } from '../gateway/accessRuleValidator'
import {
  buildUnsignedSubintent,
  computePublicKeyHash,
  computeSubintentHashFromSignedPartial,
  extractSignatureFromHex
} from '../gateway/subintentBuilder'
import { TransactionStatusChecker } from '../gateway/transactionStatusChecker'
import { TransactionSubmitter } from '../gateway/transactionSubmitter'
import { ListVaultsRepo } from './listVaultsRepo'
import { ProposalRepo } from './proposalRepo'

const SIGNABLE_STATUSES = new Set(['created', 'signing'])

const isExpired = (maxProposerTimestamp: string): boolean => {
  const deadline = new Date(maxProposerTimestamp)
  return !isNaN(deadline.getTime()) && deadline.getTime() < Date.now()
}

const extractPreviewErrorMessage = (e: { _tag: string; message?: string }) => {
  try {
    const parsed = JSON.parse(e.message ?? '')
    const errors: string[] =
      parsed?.details?.validation_errors?.flatMap(
        (v: { errors?: string[] }) => v.errors ?? []
      ) ?? []
    if (errors.length > 0) return errors.join('; ')
    if (parsed?.message) return String(parsed.message)
  } catch {}
  return e.message ?? String(e)
}

export class ProposalsHandler extends Effect.Service<ProposalsHandler>()(
  '@radix-vaults/server/handlers/ProposalsHandler',
  {
    effect: Effect.gen(function* () {
      const listVaultsRepo = yield* ListVaultsRepo
      const proposalRepo = yield* ProposalRepo
      const previewFn = yield* PreviewTransaction
      const accessRuleValidator = yield* AccessRuleValidator
      const transactionSubmitter = yield* TransactionSubmitter
      const transactionStatusChecker = yield* TransactionStatusChecker
      const getLedgerState = yield* GetLedgerStateService
      const networkId = yield* Config.number('NETWORK_ID')

      const create = (
        teamId: string,
        vaultAddress: VaultAddressType,
        manifest: string,
        maxProposerTimestamp: string,
        createdBy: string
      ) =>
        Effect.gen(function* () {
          yield* listVaultsRepo.ensureExists(teamId, vaultAddress)

          yield* previewFn({
            payload: {
              manifest,
              start_epoch_inclusive: 1,
              end_epoch_exclusive: 2,
              nonce: 1,
              signer_public_keys: [],
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
                  message: extractPreviewErrorMessage(e)
                })
            )
          )

          // Fetch current epoch for subintent header bounds
          const ledgerState = yield* getLedgerState({}).pipe(Effect.orDie)
          const currentEpoch = ledgerState.epoch

          // Capture creation time once — used for both subintent header and DB record
          const createdAt = yield* DateTime.now
          const createdAtDate = DateTime.toDateUtc(createdAt)

          const toEpochSec = (dt: DateTime.DateTime) =>
            Math.floor(DateTime.toEpochMillis(dt) / 1000)

          // Parse maxProposerTimestamp to seconds for subintent header
          const maxProposerTimestampSec = Option.map(
            DateTime.make(maxProposerTimestamp),
            toEpochSec
          ).pipe(Option.getOrUndefined)

          // Compute epoch range that outlasts maxProposerTimestamp
          const nowSec = toEpochSec(createdAt)
          const secondsUntilExpiry =
            (maxProposerTimestampSec ?? nowSec) - nowSec
          const epochsNeeded = Math.ceil(secondsUntilExpiry / 300)
          const computedEpochMax =
            currentEpoch + Math.max(epochsNeeded * 2, 100)

          // Build unsigned subintent
          const subintent = yield* buildUnsignedSubintent(
            manifest,
            networkId,
            currentEpoch,
            computedEpochMax,
            maxProposerTimestampSec,
            toEpochSec(createdAt)
          ).pipe(Effect.orDie)

          const result = yield* proposalRepo.insert({
            teamId,
            entityAddress: vaultAddress,
            type: 'vault',
            manifest,
            maxProposerTimestamp,
            createdBy,
            createdAt: createdAtDate,
            subintentHash: subintent.subintentHash,
            intentDiscriminator: subintent.intentDiscriminator,
            partialTransactionHex: subintent.partialTransactionHex,
            epochMin: subintent.epochMin,
            epochMax: subintent.epochMax
          })
          return { ...result, vaultAddress }
        })

      const list = (teamId: string, vaultAddress: VaultAddressType) =>
        Effect.gen(function* () {
          yield* listVaultsRepo.ensureExists(teamId, vaultAddress)
          return yield* proposalRepo.listByVault(teamId, vaultAddress)
        })

      const getSignatureProgress = (
        teamId: string,
        vaultAddress: VaultAddressType,
        proposalId: ProposalId
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
        teamId: string,
        vaultAddress: VaultAddressType,
        proposalId: ProposalId
      ) =>
        Effect.gen(function* () {
          yield* listVaultsRepo.ensureExists(teamId, vaultAddress)
          const proposal = yield* proposalRepo.getById(
            teamId,
            vaultAddress,
            proposalId
          )
          const signatureProgress = yield* getSignatureProgress(
            teamId,
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
        teamId: string,
        vaultAddress: VaultAddressType,
        proposalId: ProposalId,
        signerAccountAddress: AccountAddress,
        signedPartialTransactionHex: string
      ) =>
        Effect.gen(function* () {
          yield* listVaultsRepo.ensureExists(teamId, vaultAddress)
          const proposal = yield* proposalRepo.getById(
            teamId,
            vaultAddress,
            proposalId
          )

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

          // Verify the subintent hash from the signed partial matches our stored hash
          const walletSubintentHash =
            yield* computeSubintentHashFromSignedPartial(
              signedPartialTransactionHex,
              networkId
            ).pipe(
              Effect.catchAll(() =>
                Effect.fail(
                  new NotEligibleSignerError({
                    message: 'Failed to decode signed partial transaction'
                  })
                )
              )
            )

          if (walletSubintentHash !== proposal.subintentHash) {
            return yield* new NotEligibleSignerError({
              message:
                'Signed subintent hash does not match the proposal subintent hash'
            })
          }

          // Extract signature + public key from wallet response
          const extracted = yield* extractSignatureFromHex(
            signedPartialTransactionHex,
            networkId
          ).pipe(
            Effect.catchAll((e) =>
              Effect.fail(
                new NotEligibleSignerError({
                  message: `Failed to extract signature from signed partial: ${e.message}`
                })
              )
            )
          )

          // Compute key hash and validate against vault access rule
          const signerKeyHash = computePublicKeyHash(extracted.publicKeyHex)

          const accessRule = yield* accessRuleValidator
            .validate(vaultAddress)
            .pipe(Effect.orDie)

          const matchingSigner = accessRule.signers.find(
            (s) => s.localId === `[${signerKeyHash}]`
          )
          if (!matchingSigner) {
            return yield* new NotEligibleSignerError({
              message: 'The signing key does not match any vault signer'
            })
          }

          const signerKeyType = extracted.keyType

          // Persist signature with full cryptographic data
          yield* proposalRepo
            .addSignature({
              proposalId,
              signerAccountAddress,
              signerPublicKey: extracted.publicKeyHex,
              signerKeyHash,
              signerKeyType,
              signatureBytes: extracted.signatureHex,
              signedPartialTransactionHex
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

      const submit = (
        teamId: string,
        vaultAddress: VaultAddressType,
        proposalId: ProposalId
      ) =>
        Effect.gen(function* () {
          yield* listVaultsRepo.ensureExists(teamId, vaultAddress)
          const proposal = yield* proposalRepo.getById(
            teamId,
            vaultAddress,
            proposalId
          )

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

          if (!proposal.partialTransactionHex) {
            return yield* new ProposalSubmitFailedError({
              message: 'Proposal missing partial transaction data'
            })
          }

          // Compose V2 transaction from collected signatures and submit
          const { intentHash } = yield* transactionSubmitter
            .submitWithSubintent({
              partialTransactionHex: proposal.partialTransactionHex,
              signatures: signatures.map((s) => ({
                publicKeyHex: s.signerPublicKey,
                signatureHex: s.signatureBytes,
                keyType: s.signerKeyType as 'ed25519' | 'secp256k1'
              }))
            })
            .pipe(
              Effect.catchTag('TransactionSubmitError', (e) =>
                Effect.fail(
                  new ProposalSubmitFailedError({ message: e.message })
                )
              )
            )

          yield* proposalRepo.setSubmitted(proposalId, intentHash)

          return { intentHash, status: 'submitted' as const }
        })

      const refreshStatus = (
        teamId: string,
        vaultAddress: VaultAddressType,
        proposalId: ProposalId
      ) =>
        Effect.gen(function* () {
          yield* listVaultsRepo.ensureExists(teamId, vaultAddress)
          const proposal = yield* proposalRepo.getById(
            teamId,
            vaultAddress,
            proposalId
          )

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

      return {
        create,
        list,
        getDetail,
        sign,
        submit,
        refreshStatus
      } as const
    })
  }
) {}
