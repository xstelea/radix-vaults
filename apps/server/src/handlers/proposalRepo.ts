import { proposals, proposalSignatures } from '@radix-vaults/database'
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

export class DuplicateSignatureDbError extends Data.TaggedError(
  'DuplicateSignatureDbError'
)<{
  proposalId: number
  signerAccountAddress: string
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

      const addSignature = (input: {
        proposalId: number
        signerAccountAddress: string
        signerKeyHash: string
        signerKeyType: 'ed25519' | 'secp256k1'
      }) =>
        db
          .insert(proposalSignatures)
          .values({
            proposalId: input.proposalId,
            signerAccountAddress: input.signerAccountAddress,
            signerKeyHash: input.signerKeyHash,
            signerKeyType: input.signerKeyType
          })
          .returning()
          .pipe(
            Effect.map((rows) => rows[0]!),
            Effect.catchTag('SqlError', (e) => {
              if (
                String(e).includes('unique') ||
                String(e).includes('duplicate')
              ) {
                return Effect.fail(
                  new DuplicateSignatureDbError({
                    proposalId: input.proposalId,
                    signerAccountAddress: input.signerAccountAddress
                  })
                )
              }
              return Effect.die(e)
            })
          )

      const getSignatures = (proposalId: number) =>
        db
          .select({
            signerAccountAddress: proposalSignatures.signerAccountAddress,
            signerKeyHash: proposalSignatures.signerKeyHash,
            signerKeyType: proposalSignatures.signerKeyType,
            signedAt: proposalSignatures.signedAt
          })
          .from(proposalSignatures)
          .where(eq(proposalSignatures.proposalId, proposalId))
          .pipe(
            Effect.map((rows) =>
              rows.map((row) => ({
                ...row,
                signedAt: row.signedAt.toISOString()
              }))
            ),
            Effect.catchTags({ SqlError: Effect.die })
          )

      const updateStatus = (proposalId: number, status: string) =>
        db
          .update(proposals)
          .set({ status })
          .where(eq(proposals.id, proposalId))
          .pipe(Effect.catchTags({ SqlError: Effect.die }))

      return {
        insert,
        listByVault,
        getById,
        addSignature,
        getSignatures,
        updateStatus
      } as const
    })
  }
) {}
