import { Schema } from 'effect'

const ProposalIdSchema = Schema.Number.pipe(Schema.brand('ProposalId'))

export type ProposalId = typeof ProposalIdSchema.Type

export const ProposalId: typeof ProposalIdSchema & {
  readonly make: (value: number) => ProposalId
} = Object.assign(ProposalIdSchema, {
  make: (value: number) => value as ProposalId
})
