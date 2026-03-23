import { Schema } from 'effect'

const TeamIdSchema = Schema.String.pipe(Schema.brand('TeamId'))

export type TeamId = typeof TeamIdSchema.Type

export const TeamId: typeof TeamIdSchema & {
  readonly make: (value: string) => TeamId
} = Object.assign(TeamIdSchema, {
  make: (value: string) => value as TeamId
})
