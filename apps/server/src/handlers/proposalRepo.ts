import { proposals } from '@radix-vaults/database'
import {
  VaultAddress,
  type VaultAddress as VaultAddressType
} from '@radix-vaults/shared'
import { Data, Effect } from 'effect'
import { and, desc, eq } from 'drizzle-orm'
import { ORM } from '../db/orm'

export class ProposalNotFoundDbError extends Data.TaggedError(
  'ProposalNotFoundDbError'
)<{
  proposalId: number
}> {}

export class ProposalRepo extends Effect.Service<ProposalRepo>()(
  '@radix-vaults/server/handlers/ProposalRepo',
  {
    effect: Effect.gen(function* () {
      const db = yield* ORM

      const insert = (input: {
        vaultAddress: VaultAddressType
        manifest: string
        maxProposerTimestamp: string
        createdBy: string
      }) =>
        db
          .insert(proposals)
          .values({
            vaultAddress: input.vaultAddress,
            status: 'created',
            manifest: input.manifest,
            maxProposerTimestamp: input.maxProposerTimestamp,
            createdBy: input.createdBy
          })
          .returning()
          .pipe(
            Effect.map((rows) => {
              const row = rows[0]!
              return {
                id: row.id,
                vaultAddress: VaultAddress.make(row.vaultAddress),
                status: row.status,
                manifest: row.manifest,
                maxProposerTimestamp: row.maxProposerTimestamp,
                createdBy: row.createdBy,
                createdAt: row.createdAt.toISOString()
              }
            }),
            Effect.catchTags({ SqlError: Effect.die })
          )

      const listByVault = (vaultAddress: VaultAddressType) =>
        db
          .select({
            id: proposals.id,
            vaultAddress: proposals.vaultAddress,
            status: proposals.status,
            createdBy: proposals.createdBy,
            createdAt: proposals.createdAt
          })
          .from(proposals)
          .where(eq(proposals.vaultAddress, vaultAddress))
          .orderBy(desc(proposals.createdAt))
          .pipe(
            Effect.map((rows) =>
              rows.map((row) => ({
                ...row,
                vaultAddress: VaultAddress.make(row.vaultAddress),
                createdAt: row.createdAt.toISOString()
              }))
            ),
            Effect.catchTags({ SqlError: Effect.die })
          )

      const getById = (vaultAddress: VaultAddressType, proposalId: number) =>
        db
          .select()
          .from(proposals)
          .where(
            and(
              eq(proposals.id, proposalId),
              eq(proposals.vaultAddress, vaultAddress)
            )
          )
          .limit(1)
          .pipe(
            Effect.flatMap((rows) => {
              const row = rows[0]
              if (!row) {
                return Effect.fail(new ProposalNotFoundDbError({ proposalId }))
              }
              return Effect.succeed({
                id: row.id,
                vaultAddress: VaultAddress.make(row.vaultAddress),
                status: row.status,
                manifest: row.manifest,
                maxProposerTimestamp: row.maxProposerTimestamp,
                createdBy: row.createdBy,
                createdAt: row.createdAt.toISOString()
              })
            }),
            Effect.catchTags({ SqlError: Effect.die })
          )

      return { insert, listByVault, getById } as const
    })
  }
) {}
