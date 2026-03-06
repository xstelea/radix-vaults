import { Schema } from 'effect'

const VaultAddressSchema = Schema.String.pipe(Schema.brand('VaultAddress'))

export type VaultAddress = typeof VaultAddressSchema.Type

export const VaultAddress: typeof VaultAddressSchema & {
  readonly make: (value: string) => VaultAddress
} = Object.assign(VaultAddressSchema, {
  make: (value: string) => value as VaultAddress
})
