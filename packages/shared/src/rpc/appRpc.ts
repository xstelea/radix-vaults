import { Rpc, RpcGroup } from '@effect/rpc'
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

export const VaultNotFoundErrorSchema = Schema.TaggedStruct(
  'VaultNotFoundError',
  {
    vaultAddress: VaultAddress
  }
)

export const ListVaultsErrorSchema = Schema.Never

export const GetVaultDetailErrorSchema = VaultNotFoundErrorSchema

export const GetVaultSignersErrorSchema = VaultNotFoundErrorSchema

export const ListVaults = Rpc.make('ListVaults', {
  payload: {},
  success: Schema.Array(VaultListItemSchema),
  error: ListVaultsErrorSchema
})

export const GetVaultDetail = Rpc.make('GetVaultDetail', {
  payload: {
    vaultAddress: VaultAddress
  },
  success: VaultDetailSchema,
  error: GetVaultDetailErrorSchema
})

export const GetVaultSigners = Rpc.make('GetVaultSigners', {
  payload: {
    vaultAddress: VaultAddress
  },
  success: VaultSignersSchema,
  error: GetVaultSignersErrorSchema
})

export const AppRpc = RpcGroup.make(ListVaults, GetVaultDetail, GetVaultSigners)

export type VaultListItem = typeof VaultListItemSchema.Type
export type VaultDetail = typeof VaultDetailSchema.Type
export type VaultSigners = typeof VaultSignersSchema.Type
export type Signer = typeof SignerSchema.Type
export type ListVaultsError = typeof ListVaultsErrorSchema.Type
export type GetVaultDetailError = typeof GetVaultDetailErrorSchema.Type
export type GetVaultSignersError = typeof GetVaultSignersErrorSchema.Type
