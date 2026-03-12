import { HttpApiSchema } from '@effect/platform'
import * as Schema from 'effect/Schema'
import { ProposalId } from '../proposalId'
import { VaultAddress } from '../vaultAddress'

export const SignerSchema = Schema.Struct({
  signerPublicKey: Schema.String,
  signerKeyType: Schema.Literal('ed25519', 'secp256k1'),
  signerKeyHash: Schema.String
})

export const VaultListItemSchema = Schema.Struct({
  accountAddress: VaultAddress,
  name: Schema.String,
  pendingProposalCount: Schema.Number
})

export const VaultDetailSchema = Schema.Struct({
  accountAddress: VaultAddress,
  name: Schema.String,
  pendingProposalCount: Schema.Number,
  balanceXrd: Schema.String
})

export const VaultSignersSchema = Schema.Struct({
  vaultAddress: VaultAddress,
  threshold: Schema.Number,
  signers: Schema.Array(SignerSchema)
})

export class VaultNotFoundErrorSchema extends Schema.TaggedError<VaultNotFoundErrorSchema>()(
  'VaultNotFoundError',
  {
    vaultAddress: VaultAddress
  },
  HttpApiSchema.annotations({ status: 404 })
) {}

export const ImportVaultRequestSchema = Schema.Struct({
  accountAddress: VaultAddress,
  name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(255))
})

export const ImportVaultResponseSchema = Schema.Struct({
  accountAddress: VaultAddress,
  name: Schema.String
})

export class UnsupportedAccessRuleError extends Schema.TaggedError<UnsupportedAccessRuleError>()(
  'UnsupportedAccessRuleError',
  {
    entityAddress: Schema.String,
    message: Schema.String
  },
  HttpApiSchema.annotations({ status: 422 })
) {}

export class VaultAlreadyExistsError extends Schema.TaggedError<VaultAlreadyExistsError>()(
  'VaultAlreadyExistsError',
  {
    accountAddress: VaultAddress
  },
  HttpApiSchema.annotations({ status: 409 })
) {}

export type VaultListItem = typeof VaultListItemSchema.Type
export type VaultDetail = typeof VaultDetailSchema.Type
export type VaultSigners = typeof VaultSignersSchema.Type
export type Signer = typeof SignerSchema.Type
export type ImportVaultRequest = typeof ImportVaultRequestSchema.Type
export type ImportVaultResponse = typeof ImportVaultResponseSchema.Type

// --- Create vault schemas ---

export const CreateVaultRequestSchema = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(255)),
  threshold: Schema.Number.pipe(Schema.int(), Schema.greaterThan(0))
})

export const CreateVaultResponseSchema = Schema.Struct({
  accountAddress: VaultAddress,
  name: Schema.String
})

export class CreateVaultFailedError extends Schema.TaggedError<CreateVaultFailedError>()(
  'CreateVaultFailedError',
  {
    message: Schema.String
  },
  HttpApiSchema.annotations({ status: 422 })
) {}

export class ThresholdExceedsSignersError extends Schema.TaggedError<ThresholdExceedsSignersError>()(
  'ThresholdExceedsSignersError',
  {
    message: Schema.String
  },
  HttpApiSchema.annotations({ status: 422 })
) {}

export type CreateVaultRequest = typeof CreateVaultRequestSchema.Type
export type CreateVaultResponse = typeof CreateVaultResponseSchema.Type

// --- Team schemas ---

export const BadgeHolderSchema = Schema.Struct({
  holderAddress: Schema.String,
  amount: Schema.String
})

export const TeamOverviewSchema = Schema.Struct({
  teamMemberBadgeAddress: Schema.String,
  threshold: Schema.Number,
  signers: Schema.Array(SignerSchema),
  badgeHolders: Schema.Array(BadgeHolderSchema)
})

export type BadgeHolder = typeof BadgeHolderSchema.Type
export type TeamOverview = typeof TeamOverviewSchema.Type

// --- Proposal schemas ---

export const ProposalStatus = Schema.Literal(
  'created',
  'signing',
  'ready',
  'submitted',
  'committed',
  'failed',
  'expired',
  'invalid'
)

export const CreateProposalRequestSchema = Schema.Struct({
  manifest: Schema.String.pipe(Schema.minLength(1)),
  maxProposerTimestamp: Schema.String.pipe(Schema.minLength(1))
})

export const CreateProposalResponseSchema = Schema.Struct({
  id: ProposalId,
  vaultAddress: VaultAddress,
  status: Schema.String,
  manifest: Schema.String,
  maxProposerTimestamp: Schema.String,
  createdBy: Schema.String,
  createdAt: Schema.String,
  subintentHash: Schema.NullOr(Schema.String),
  intentDiscriminator: Schema.String,
  epochMin: Schema.Number,
  epochMax: Schema.Number
})

export const ProposalListItemSchema = Schema.Struct({
  id: ProposalId,
  vaultAddress: VaultAddress,
  status: Schema.String,
  createdBy: Schema.String,
  createdAt: Schema.String
})

export const ProposalSignatureSchema = Schema.Struct({
  signerAccountAddress: Schema.String,
  signerKeyHash: Schema.String,
  signerKeyType: Schema.Literal('ed25519', 'secp256k1'),
  signedAt: Schema.String
})

export const SignatureProgressSchema = Schema.Struct({
  collected: Schema.Number,
  required: Schema.Number,
  signatures: Schema.Array(ProposalSignatureSchema)
})

export const ProposalDetailSchema = Schema.Struct({
  id: ProposalId,
  vaultAddress: VaultAddress,
  status: Schema.String,
  manifest: Schema.String,
  maxProposerTimestamp: Schema.String,
  createdBy: Schema.String,
  createdAt: Schema.String,
  subintentHash: Schema.NullOr(Schema.String),
  intentDiscriminator: Schema.String,
  epochMin: Schema.Number,
  epochMax: Schema.Number,
  signatureProgress: SignatureProgressSchema,
  transactionIntentHash: Schema.NullOr(Schema.String),
  submittedAt: Schema.NullOr(Schema.String),
  statusReason: Schema.NullOr(Schema.String)
})

export const SignProposalRequestSchema = Schema.Struct({
  signedPartialTransactionHex: Schema.String
})

export const SignProposalResponseSchema = Schema.Struct({
  ok: Schema.Boolean
})

export const SubmitProposalResponseSchema = Schema.Struct({
  intentHash: Schema.String,
  status: Schema.String
})

export class ProposalNotFoundError extends Schema.TaggedError<ProposalNotFoundError>()(
  'ProposalNotFoundError',
  {
    proposalId: ProposalId
  },
  HttpApiSchema.annotations({ status: 404 })
) {}

export class ProposalPreviewFailedError extends Schema.TaggedError<ProposalPreviewFailedError>()(
  'ProposalPreviewFailedError',
  {
    message: Schema.String
  },
  HttpApiSchema.annotations({ status: 422 })
) {}

export class NotEligibleSignerError extends Schema.TaggedError<NotEligibleSignerError>()(
  'NotEligibleSignerError',
  {
    message: Schema.String
  },
  HttpApiSchema.annotations({ status: 403 })
) {}

export class AlreadySignedError extends Schema.TaggedError<AlreadySignedError>()(
  'AlreadySignedError',
  {
    message: Schema.String
  },
  HttpApiSchema.annotations({ status: 409 })
) {}

export class ProposalNotSignableError extends Schema.TaggedError<ProposalNotSignableError>()(
  'ProposalNotSignableError',
  {
    message: Schema.String
  },
  HttpApiSchema.annotations({ status: 422 })
) {}

export class ProposalNotReadyError extends Schema.TaggedError<ProposalNotReadyError>()(
  'ProposalNotReadyError',
  {
    message: Schema.String
  },
  HttpApiSchema.annotations({ status: 422 })
) {}

export class ProposalSubmitFailedError extends Schema.TaggedError<ProposalSubmitFailedError>()(
  'ProposalSubmitFailedError',
  {
    message: Schema.String
  },
  HttpApiSchema.annotations({ status: 422 })
) {}

export class ProposalNotSubmittedError extends Schema.TaggedError<ProposalNotSubmittedError>()(
  'ProposalNotSubmittedError',
  {
    message: Schema.String
  },
  HttpApiSchema.annotations({ status: 422 })
) {}

export class ProposalStatusCheckFailedError extends Schema.TaggedError<ProposalStatusCheckFailedError>()(
  'ProposalStatusCheckFailedError',
  {
    message: Schema.String
  },
  HttpApiSchema.annotations({ status: 422 })
) {}

export class ProposalExpiredError extends Schema.TaggedError<ProposalExpiredError>()(
  'ProposalExpiredError',
  {
    message: Schema.String
  },
  HttpApiSchema.annotations({ status: 422 })
) {}

export class ProposalInvalidError extends Schema.TaggedError<ProposalInvalidError>()(
  'ProposalInvalidError',
  {
    message: Schema.String
  },
  HttpApiSchema.annotations({ status: 422 })
) {}

export const RefreshStatusResponseSchema = Schema.Struct({
  status: Schema.String,
  transactionIntentHash: Schema.NullOr(Schema.String),
  submittedAt: Schema.NullOr(Schema.String)
})

export type CreateProposalRequest = typeof CreateProposalRequestSchema.Type
export type CreateProposalResponse = typeof CreateProposalResponseSchema.Type
export type ProposalListItem = typeof ProposalListItemSchema.Type
export type ProposalDetail = typeof ProposalDetailSchema.Type
export type ProposalSignature = typeof ProposalSignatureSchema.Type
export type SignatureProgress = typeof SignatureProgressSchema.Type
export type SubmitProposalResponse = typeof SubmitProposalResponseSchema.Type
export type RefreshStatusResponse = typeof RefreshStatusResponseSchema.Type
