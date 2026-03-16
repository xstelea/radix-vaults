import type {
  AccountAddress,
  AddMemberRequest,
  ChangeThresholdRequest,
  ProposalId,
  RemoveMemberRequest
} from '@radix-vaults/shared'
import {
  AlreadySignedError,
  AuthConfig,
  BadgeVaultNotFoundError,
  MemberAlreadyExistsError,
  MemberNotFoundError,
  NotEligibleSignerError,
  ProposalExpiredError,
  ProposalInvalidError,
  ProposalNotReadyError,
  ProposalNotSignableError,
  ProposalNotSubmittedError,
  ProposalPreviewFailedError,
  ProposalStatusCheckFailedError,
  ProposalSubmitFailedError,
  ThresholdExceedsSignersError
} from '@radix-vaults/shared'
import {
  GetEntityDetailsVaultAggregated,
  GetLedgerStateService,
  PreviewTransaction
} from '@radix-effects/gateway'
import { Config, DateTime, Effect, Option } from 'effect'
import type { ParsedSigner } from '../gateway/accessRuleValidator'
import { AccessRuleValidator } from '../gateway/accessRuleValidator'
import {
  buildAddMemberManifest,
  buildChangeThresholdManifest,
  buildRemoveMemberManifest
} from '../gateway/manifests'
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

/**
 * Parse a NonFungibleGlobalId string like "resource_sim1...ed25sg...:[ hex ]"
 * into a ParsedSigner { resourceAddress, localId }.
 */
const parseVirtualBadge = (
  virtualBadge: string
): { resourceAddress: string; localId: string } => {
  const colonIdx = virtualBadge.indexOf(':')
  if (colonIdx === -1) throw new Error(`Invalid virtualBadge: ${virtualBadge}`)
  return {
    resourceAddress: virtualBadge.slice(0, colonIdx),
    localId: virtualBadge.slice(colonIdx + 1)
  }
}

export class TeamProposalsHandler extends Effect.Service<TeamProposalsHandler>()(
  '@radix-vaults/server/handlers/TeamProposalsHandler',
  {
    effect: Effect.gen(function* () {
      const authConfig = yield* AuthConfig
      const listVaultsRepo = yield* ListVaultsRepo
      const proposalRepo = yield* ProposalRepo
      const previewFn = yield* PreviewTransaction
      const accessRuleValidator = yield* AccessRuleValidator
      const transactionSubmitter = yield* TransactionSubmitter
      const transactionStatusChecker = yield* TransactionStatusChecker
      const getLedgerState = yield* GetLedgerStateService
      const getEntityDetails = yield* GetEntityDetailsVaultAggregated
      const networkId = yield* Config.number('NETWORK_ID')

      const badgeAddress = authConfig.teamMemberBadgeAddress

      const buildSubintentAndStore = (
        manifest: string,
        entityAddress: string,
        type: 'add_member' | 'remove_member' | 'change_threshold',
        createdBy: string,
        maxProposerTimestamp: string
      ) =>
        Effect.gen(function* () {
          // Preview the manifest
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

          const ledgerState = yield* getLedgerState({}).pipe(Effect.orDie)
          const currentEpoch = ledgerState.epoch

          const createdAt = yield* DateTime.now
          const createdAtDate = DateTime.toDateUtc(createdAt)

          const toEpochSec = (dt: DateTime.DateTime) =>
            Math.floor(DateTime.toEpochMillis(dt) / 1000)

          const maxProposerTimestampSec = Option.map(
            DateTime.make(maxProposerTimestamp),
            toEpochSec
          ).pipe(Option.getOrUndefined)

          const nowSec = toEpochSec(createdAt)
          const secondsUntilExpiry =
            (maxProposerTimestampSec ?? nowSec) - nowSec
          const epochsNeeded = Math.ceil(secondsUntilExpiry / 300)
          const computedEpochMax =
            currentEpoch + Math.max(epochsNeeded * 2, 100)

          const subintent = yield* buildUnsignedSubintent(
            manifest,
            networkId,
            currentEpoch,
            computedEpochMax,
            maxProposerTimestampSec,
            toEpochSec(createdAt)
          ).pipe(Effect.orDie)

          return yield* proposalRepo.insert({
            entityAddress,
            type,
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
        })

      const createAddMember = (input: AddMemberRequest, createdBy: string) =>
        Effect.gen(function* () {
          // 1. Fetch current signers from badge resource
          const accessRule = yield* accessRuleValidator
            .validate(badgeAddress)
            .pipe(Effect.orDie)

          // 2. Parse new signer identity
          const newSigner = parseVirtualBadge(input.virtualBadge)

          // 3. Validate new signer not already in set
          const alreadyExists = accessRule.signers.some(
            (s) =>
              s.resourceAddress === newSigner.resourceAddress &&
              s.localId === newSigner.localId
          )
          if (alreadyExists) {
            return yield* new MemberAlreadyExistsError({
              message: 'This signer is already in the team'
            })
          }

          // 4. New signer set = existing + new
          const newSigners: ParsedSigner[] = [...accessRule.signers, newSigner]

          // 5. Validate badge threshold
          if (input.badgeThreshold > newSigners.length) {
            return yield* new ThresholdExceedsSignersError({
              message: `Badge threshold ${input.badgeThreshold} exceeds new signer count ${newSigners.length}`
            })
          }

          // 6. Fetch all vaults from DB and validate vault thresholds
          const vaults = yield* listVaultsRepo.list()
          const vaultMap = new Map(vaults.map((v) => [v.accountAddress, v]))
          for (const vt of input.vaultThresholds) {
            if (!vaultMap.has(vt.vaultAddress)) {
              return yield* new ThresholdExceedsSignersError({
                message: `Vault ${vt.vaultAddress} not found`
              })
            }
            if (vt.threshold > newSigners.length) {
              return yield* new ThresholdExceedsSignersError({
                message: `Vault threshold ${vt.threshold} for ${vt.vaultAddress} exceeds new signer count ${newSigners.length}`
              })
            }
          }

          // 7. Build manifest
          const maxProposerTimestamp = new Date(
            Date.now() + 24 * 60 * 60 * 1000
          )
            .toISOString()
            .slice(0, 19)

          const manifest = yield* Effect.promise(() =>
            buildAddMemberManifest({
              badgeResource: badgeAddress,
              recipientAccount: input.accountAddress,
              name: input.name,
              virtualBadge: input.virtualBadge,
              badgeRoleEntry: {
                entityAddress: badgeAddress,
                signers: newSigners,
                threshold: input.badgeThreshold
              },
              vaultRoleEntries: input.vaultThresholds.map((vt) => ({
                entityAddress: vt.vaultAddress,
                signers: newSigners,
                threshold: vt.threshold
              })),
              networkId
            })
          )

          // 8. Preview, build subintent, store
          return yield* buildSubintentAndStore(
            manifest,
            badgeAddress,
            'add_member',
            createdBy,
            maxProposerTimestamp
          )
        })

      const createRemoveMember = (
        input: RemoveMemberRequest,
        createdBy: string
      ) =>
        Effect.gen(function* () {
          // 1. Fetch current signers
          const accessRule = yield* accessRuleValidator
            .validate(badgeAddress)
            .pipe(Effect.orDie)

          // 2. Parse signer to remove
          const removeSigner = parseVirtualBadge(input.virtualBadge)

          // 3. Validate signer exists
          const exists = accessRule.signers.some(
            (s) =>
              s.resourceAddress === removeSigner.resourceAddress &&
              s.localId === removeSigner.localId
          )
          if (!exists) {
            return yield* new MemberNotFoundError({
              message: 'This signer is not in the team'
            })
          }

          // 4. New signer set = existing - removed
          const newSigners = accessRule.signers.filter(
            (s) =>
              !(
                s.resourceAddress === removeSigner.resourceAddress &&
                s.localId === removeSigner.localId
              )
          )

          if (newSigners.length === 0) {
            return yield* new ThresholdExceedsSignersError({
              message: 'Cannot remove the last signer'
            })
          }

          // 5. Validate thresholds
          if (input.badgeThreshold > newSigners.length) {
            return yield* new ThresholdExceedsSignersError({
              message: `Badge threshold ${input.badgeThreshold} exceeds remaining signer count ${newSigners.length}`
            })
          }

          const vaults = yield* listVaultsRepo.list()
          const vaultMap = new Map(vaults.map((v) => [v.accountAddress, v]))
          for (const vt of input.vaultThresholds) {
            if (!vaultMap.has(vt.vaultAddress)) {
              return yield* new ThresholdExceedsSignersError({
                message: `Vault ${vt.vaultAddress} not found`
              })
            }
            if (vt.threshold > newSigners.length) {
              return yield* new ThresholdExceedsSignersError({
                message: `Vault threshold ${vt.threshold} for ${vt.vaultAddress} exceeds remaining signer count ${newSigners.length}`
              })
            }
          }

          // 6. Look up member's internal badge vault
          const memberDetails = yield* getEntityDetails(
            [input.memberAddress],
            undefined,
            undefined
          ).pipe(
            Effect.catchAll(() =>
              Effect.fail(
                new BadgeVaultNotFoundError({
                  message: `Could not fetch entity details for ${input.memberAddress}`
                })
              )
            )
          )

          const memberEntity = memberDetails[0]
          if (!memberEntity) {
            return yield* new BadgeVaultNotFoundError({
              message: `Entity not found: ${input.memberAddress}`
            })
          }

          // Find the non-fungible vault holding the badge resource
          const nfResource = (
            memberEntity.non_fungible_resources?.items ?? []
          ).find(
            (r: { resource_address?: string }) =>
              r.resource_address === badgeAddress
          )

          const vaultItems = (
            nfResource as {
              vaults?: { items?: Array<{ vault_address?: string }> }
            }
          )?.vaults?.items
          const internalVaultAddress = vaultItems?.[0]?.vault_address

          if (!internalVaultAddress) {
            return yield* new BadgeVaultNotFoundError({
              message: `No badge vault found for ${input.memberAddress}`
            })
          }

          // Extract NFT local ID from virtualBadge
          const nftLocalId = input.virtualBadge.slice(
            input.virtualBadge.indexOf(':') + 1
          )

          // 7. Build manifest
          const maxProposerTimestamp = new Date(
            Date.now() + 24 * 60 * 60 * 1000
          )
            .toISOString()
            .slice(0, 19)

          const manifest = yield* Effect.promise(() =>
            buildRemoveMemberManifest({
              badgeResource: badgeAddress,
              memberInternalVaultAddress: internalVaultAddress,
              nftLocalId,
              badgeRoleEntry: {
                entityAddress: badgeAddress,
                signers: newSigners,
                threshold: input.badgeThreshold
              },
              vaultRoleEntries: input.vaultThresholds.map((vt) => ({
                entityAddress: vt.vaultAddress,
                signers: newSigners,
                threshold: vt.threshold
              })),
              networkId
            })
          )

          // 8. Preview, build subintent, store
          return yield* buildSubintentAndStore(
            manifest,
            badgeAddress,
            'remove_member',
            createdBy,
            maxProposerTimestamp
          )
        })

      const createChangeThreshold = (
        input: ChangeThresholdRequest,
        createdBy: string
      ) =>
        Effect.gen(function* () {
          // 1. Validate vault exists
          yield* listVaultsRepo.ensureExists(input.vaultAddress)

          // 2. Fetch current signers from vault
          const accessRule = yield* accessRuleValidator
            .validate(input.vaultAddress)
            .pipe(Effect.orDie)

          const signers = accessRule.signers

          // 3. Validate threshold
          if (input.threshold > signers.length) {
            return yield* new ThresholdExceedsSignersError({
              message: `Threshold ${input.threshold} exceeds signer count ${signers.length}`
            })
          }

          // 4. Build manifest
          const maxProposerTimestamp = new Date(
            Date.now() + 24 * 60 * 60 * 1000
          )
            .toISOString()
            .slice(0, 19)

          const manifest = yield* Effect.promise(() =>
            buildChangeThresholdManifest({
              vaultAddress: input.vaultAddress,
              signers,
              threshold: input.threshold,
              networkId
            })
          )

          // 5. Preview, build subintent, store
          return yield* buildSubintentAndStore(
            manifest,
            input.vaultAddress,
            'change_threshold',
            createdBy,
            maxProposerTimestamp
          )
        })

      const list = () => proposalRepo.listByTeam()

      const getSignatureProgress = (
        entityAddress: string,
        proposalId: ProposalId
      ) =>
        Effect.gen(function* () {
          const signatures = yield* proposalRepo.getSignatures(proposalId)

          const accessRule = yield* accessRuleValidator
            .validate(entityAddress)
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

      const getDetail = (proposalId: ProposalId) =>
        Effect.gen(function* () {
          const proposal = yield* proposalRepo.getByIdTeam(proposalId)
          const signatureProgress = yield* getSignatureProgress(
            proposal.entityAddress,
            proposalId
          )

          return {
            ...proposal,
            signatureProgress,
            statusReason: proposal.statusReason
          }
        })

      const sign = (
        proposalId: ProposalId,
        signerAccountAddress: AccountAddress,
        signedPartialTransactionHex: string
      ) =>
        Effect.gen(function* () {
          const proposal = yield* proposalRepo.getByIdTeam(proposalId)

          if (!SIGNABLE_STATUSES.has(proposal.status)) {
            return yield* new ProposalNotSignableError({
              message: `Proposal is in '${proposal.status}' status and cannot be signed`
            })
          }

          if (isExpired(proposal.maxProposerTimestamp)) {
            const reason = `Proposal expired: max proposer timestamp ${proposal.maxProposerTimestamp} has passed`
            yield* proposalRepo.setTerminalStatus(proposalId, 'expired', reason)
            return yield* new ProposalExpiredError({ message: reason })
          }

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

          // Debug: compare stored vs wallet hex lengths
          const storedHexLen = proposal.partialTransactionHex?.length ?? 0
          const walletHexLen = signedPartialTransactionHex.length
          yield* Effect.logInfo(
            `Sign debug: storedHexLen=${storedHexLen}, walletHexLen=${walletHexLen}, diff=${walletHexLen - storedHexLen}`
          )

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

          const signerKeyHash = computePublicKeyHash(extracted.publicKeyHex)

          // Validate against the entity's access rule (badge resource for add/remove, vault for change_threshold)
          const accessRule = yield* accessRuleValidator
            .validate(proposal.entityAddress)
            .pipe(Effect.orDie)

          const matchingSigner = accessRule.signers.find(
            (s) => s.localId === `[${signerKeyHash}]`
          )
          if (!matchingSigner) {
            return yield* new NotEligibleSignerError({
              message: 'The signing key does not match any authorized signer'
            })
          }

          yield* proposalRepo
            .addSignature({
              proposalId,
              signerAccountAddress,
              signerPublicKey: extracted.publicKeyHex,
              signerKeyHash,
              signerKeyType: extracted.keyType,
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

      const submit = (proposalId: ProposalId) =>
        Effect.gen(function* () {
          const proposal = yield* proposalRepo.getByIdTeam(proposalId)

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

          if (isExpired(proposal.maxProposerTimestamp)) {
            const reason = `Proposal expired: max proposer timestamp ${proposal.maxProposerTimestamp} has passed`
            yield* proposalRepo.setTerminalStatus(proposalId, 'expired', reason)
            return yield* new ProposalExpiredError({ message: reason })
          }

          const signatures = yield* proposalRepo.getSignatures(proposalId)
          const accessRule = yield* accessRuleValidator
            .validate(proposal.entityAddress)
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

      const refreshStatus = (proposalId: ProposalId) =>
        Effect.gen(function* () {
          const proposal = yield* proposalRepo.getByIdTeam(proposalId)

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

          return {
            status: proposal.status,
            transactionIntentHash: proposal.transactionIntentHash,
            submittedAt: proposal.submittedAt
          }
        })

      return {
        createAddMember,
        createRemoveMember,
        createChangeThreshold,
        list,
        getDetail,
        sign,
        submit,
        refreshStatus
      } as const
    })
  }
) {}
