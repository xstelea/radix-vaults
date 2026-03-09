import { HttpApiSchema } from '@effect/platform'
import * as Schema from 'effect/Schema'
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
    accountAddress: VaultAddress,
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
