import { Schema } from 'effect'

const EntityAddressSchema = Schema.String.pipe(Schema.brand('EntityAddress'))

export type EntityAddress = typeof EntityAddressSchema.Type

export const EntityAddress: typeof EntityAddressSchema & {
  readonly make: (value: string) => EntityAddress
} = Object.assign(EntityAddressSchema, {
  make: (value: string) => value as EntityAddress
})
