import { proposals, proposalSignatures } from '@radix-vaults/database'
import {
  ProposalId,
  VaultAddress,
  type VaultAddress as VaultAddressType
} from '@radix-vaults/shared'
import { Data, Effect } from 'effect'
import { and, desc, eq } from 'drizzle-orm'
import { ORM } from '../db/orm'

export class ProposalNotFoundDbError extends Data.TaggedError(
  'ProposalNotFoundDbError'
)<{
  proposalId: ProposalId
}> {}

export class DuplicateSignatureDbError extends Data.TaggedError(
  'DuplicateSignatureDbError'
)<{
  proposalId: ProposalId
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
        subintentHash: string
        intentDiscriminator: string
        partialTransactionHex: string
        epochMin: number
        epochMax: number
      }) =>
        db
          .insert(proposals)
          .values({
            vaultAddress: input.vaultAddress,
            status: 'created',
            manifest: input.manifest,
            maxProposerTimestamp: input.maxProposerTimestamp,
            createdBy: input.createdBy,
            subintentHash: input.subintentHash,
            intentDiscriminator: input.intentDiscriminator,
            partialTransactionHex: input.partialTransactionHex,
            epochMin: input.epochMin,
            epochMax: input.epochMax
          })
          .returning()
          .pipe(
            Effect.map((rows) => {
              const row = rows[0]!
              return {
                id: ProposalId.make(row.id),
                vaultAddress: VaultAddress.make(row.vaultAddress),
                status: row.status,
                manifest: row.manifest,
                maxProposerTimestamp: row.maxProposerTimestamp,
                createdBy: row.createdBy,
                createdAt: row.createdAt.toISOString(),
                subintentHash: row.subintentHash,
                intentDiscriminator: row.intentDiscriminator,
                epochMin: row.epochMin,
                epochMax: row.epochMax
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
                id: ProposalId.make(row.id),
                vaultAddress: VaultAddress.make(row.vaultAddress),
                createdAt: row.createdAt.toISOString()
              }))
            ),
            Effect.catchTags({ SqlError: Effect.die })
          )

      const getById = (
        vaultAddress: VaultAddressType,
        proposalId: ProposalId
      ) =>
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
                id: ProposalId.make(row.id),
                vaultAddress: VaultAddress.make(row.vaultAddress),
                status: row.status,
                manifest: row.manifest,
                maxProposerTimestamp: row.maxProposerTimestamp,
                createdBy: row.createdBy,
                subintentHash: row.subintentHash,
                intentDiscriminator: row.intentDiscriminator,
                partialTransactionHex: row.partialTransactionHex,
                epochMin: row.epochMin,
                epochMax: row.epochMax,
                transactionIntentHash: row.transactionIntentHash,
                submittedAt: row.submittedAt?.toISOString() ?? null,
                statusReason: row.statusReason ?? null,
                createdAt: row.createdAt.toISOString()
              })
            }),
            Effect.catchTags({ SqlError: Effect.die })
          )

      const addSignature = (input: {
        proposalId: ProposalId
        signerAccountAddress: string
        signerPublicKey: string
        signerKeyHash: string
        signerKeyType: 'ed25519' | 'secp256k1'
        signatureBytes: string
        signedPartialTransactionHex: string
      }) =>
        db
          .insert(proposalSignatures)
          .values({
            proposalId: input.proposalId,
            signerAccountAddress: input.signerAccountAddress,
            signerPublicKey: input.signerPublicKey,
            signerKeyHash: input.signerKeyHash,
            signerKeyType: input.signerKeyType,
            signatureBytes: input.signatureBytes,
            signedPartialTransactionHex: input.signedPartialTransactionHex
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

      const getSignatures = (proposalId: ProposalId) =>
        db
          .select({
            signerAccountAddress: proposalSignatures.signerAccountAddress,
            signerPublicKey: proposalSignatures.signerPublicKey,
            signerKeyHash: proposalSignatures.signerKeyHash,
            signerKeyType: proposalSignatures.signerKeyType,
            signatureBytes: proposalSignatures.signatureBytes,
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

      const updateStatus = (proposalId: ProposalId, status: string) =>
        db
          .update(proposals)
          .set({ status })
          .where(eq(proposals.id, proposalId))
          .pipe(Effect.catchTags({ SqlError: Effect.die }))

      const setSubmitted = (
        proposalId: ProposalId,
        transactionIntentHash: string
      ) =>
        db
          .update(proposals)
          .set({
            status: 'submitted',
            transactionIntentHash,
            submittedAt: new Date()
          })
          .where(eq(proposals.id, proposalId))
          .pipe(Effect.catchTags({ SqlError: Effect.die }))

      const setTerminalStatus = (
        proposalId: ProposalId,
        status: 'expired' | 'invalid',
        statusReason: string
      ) =>
        db
          .update(proposals)
          .set({ status, statusReason })
          .where(eq(proposals.id, proposalId))
          .pipe(Effect.catchTags({ SqlError: Effect.die }))

      return {
        insert,
        listByVault,
        getById,
        addSignature,
        getSignatures,
        updateStatus,
        setSubmitted,
        setTerminalStatus
      } as const
    })
  }
) {}
