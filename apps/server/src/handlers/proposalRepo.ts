import { proposals, proposalSignatures, vaults } from '@radix-vaults/database'
import {
  EntityAddress,
  ProposalId,
  ProposalNotFoundError,
  TeamProposalNotFoundError,
  VaultAddress,
  type EntityAddress as EntityAddressType,
  type ProposalType,
  type VaultAddress as VaultAddressType
} from '@radix-vaults/shared'
import { Data, Effect } from 'effect'
import { and, desc, eq, inArray, lt } from 'drizzle-orm'
import { ORM } from '../db/orm'

const PENDING_STATUSES = ['created', 'signing', 'ready']

export class DuplicateSignatureDbError extends Data.TaggedError(
  'DuplicateSignatureDbError'
)<{
  proposalId: ProposalId
  signerAccountAddress: string
}> {}

const TEAM_TYPES: ProposalType[] = [
  'add_member',
  'remove_member',
  'change_threshold'
]

export class ProposalRepo extends Effect.Service<ProposalRepo>()(
  '@radix-vaults/server/handlers/ProposalRepo',
  {
    effect: Effect.gen(function* () {
      const db = yield* ORM

      const insert = (input: {
        teamId: string
        entityAddress: string
        type: ProposalType
        manifest: string
        maxProposerTimestamp: string
        createdBy: string
        createdAt: Date
        subintentHash: string
        intentDiscriminator: string
        partialTransactionHex: string
        epochMin: number
        epochMax: number
        targetAccountAddress?: string | undefined
      }) =>
        db
          .insert(proposals)
          .values({
            teamId: input.teamId,
            entityAddress: input.entityAddress,
            type: input.type,
            status: 'created',
            manifest: input.manifest,
            maxProposerTimestamp: input.maxProposerTimestamp,
            createdBy: input.createdBy,
            createdAt: input.createdAt,
            subintentHash: input.subintentHash,
            intentDiscriminator: input.intentDiscriminator,
            partialTransactionHex: input.partialTransactionHex,
            epochMin: input.epochMin,
            epochMax: input.epochMax,
            targetAccountAddress: input.targetAccountAddress ?? null
          })
          .returning()
          .pipe(
            Effect.map((rows) => {
              const row = rows[0]!
              return {
                id: ProposalId.make(row.id),
                entityAddress: EntityAddress.make(row.entityAddress),
                type: row.type as ProposalType,
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

      const listByVault = (teamId: string, vaultAddress: VaultAddressType) =>
        db
          .select({
            id: proposals.id,
            entityAddress: proposals.entityAddress,
            status: proposals.status,
            createdBy: proposals.createdBy,
            createdAt: proposals.createdAt
          })
          .from(proposals)
          .where(
            and(
              eq(proposals.teamId, teamId),
              eq(proposals.entityAddress, vaultAddress),
              eq(proposals.type, 'vault')
            )
          )
          .orderBy(desc(proposals.createdAt))
          .pipe(
            Effect.map((rows) =>
              rows.map((row) => ({
                ...row,
                id: ProposalId.make(row.id),
                vaultAddress: VaultAddress.make(row.entityAddress),
                createdAt: row.createdAt.toISOString()
              }))
            ),
            Effect.catchTags({ SqlError: Effect.die })
          )

      const getById = (
        teamId: string,
        vaultAddress: VaultAddressType,
        proposalId: ProposalId
      ) =>
        db
          .select()
          .from(proposals)
          .where(
            and(
              eq(proposals.id, proposalId),
              eq(proposals.teamId, teamId),
              eq(proposals.entityAddress, vaultAddress),
              eq(proposals.type, 'vault')
            )
          )
          .limit(1)
          .pipe(
            Effect.flatMap((rows) => {
              const row = rows[0]
              if (!row) {
                return Effect.fail(new ProposalNotFoundError({ proposalId }))
              }
              return Effect.succeed({
                id: ProposalId.make(row.id),
                vaultAddress: VaultAddress.make(row.entityAddress),
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

      const listByTeam = (teamId: string) =>
        db
          .select({
            id: proposals.id,
            entityAddress: proposals.entityAddress,
            type: proposals.type,
            status: proposals.status,
            createdBy: proposals.createdBy,
            createdAt: proposals.createdAt
          })
          .from(proposals)
          .where(
            and(
              eq(proposals.teamId, teamId),
              inArray(proposals.type, TEAM_TYPES)
            )
          )
          .orderBy(desc(proposals.createdAt))
          .pipe(
            Effect.map((rows) =>
              rows.map((row) => ({
                ...row,
                id: ProposalId.make(row.id),
                entityAddress: EntityAddress.make(row.entityAddress),
                type: row.type as ProposalType,
                createdAt: row.createdAt.toISOString()
              }))
            ),
            Effect.catchTags({ SqlError: Effect.die })
          )

      const getByIdTeam = (teamId: string, proposalId: ProposalId) =>
        db
          .select()
          .from(proposals)
          .where(
            and(
              eq(proposals.id, proposalId),
              eq(proposals.teamId, teamId),
              inArray(proposals.type, TEAM_TYPES)
            )
          )
          .limit(1)
          .pipe(
            Effect.flatMap((rows) => {
              const row = rows[0]
              if (!row) {
                return Effect.fail(
                  new TeamProposalNotFoundError({ proposalId })
                )
              }
              return Effect.succeed({
                id: ProposalId.make(row.id),
                entityAddress: EntityAddress.make(row.entityAddress),
                type: row.type as ProposalType,
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
                targetAccountAddress: row.targetAccountAddress ?? null,
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
        status: 'expired' | 'invalid' | 'failed',
        statusReason: string
      ) =>
        db
          .update(proposals)
          .set({ status, statusReason })
          .where(eq(proposals.id, proposalId))
          .pipe(Effect.catchTags({ SqlError: Effect.die }))

      const listAllPending = (teamId: string) =>
        Effect.gen(function* () {
          yield* db
            .update(proposals)
            .set({
              status: 'expired',
              statusReason: 'Proposal expired: deadline passed'
            })
            .where(
              and(
                eq(proposals.teamId, teamId),
                inArray(proposals.status, PENDING_STATUSES),
                lt(proposals.maxProposerTimestamp, new Date().toISOString())
              )
            )
            .pipe(Effect.catchTags({ SqlError: Effect.die }))

          return yield* db
            .select({
              id: proposals.id,
              entityAddress: proposals.entityAddress,
              entityName: vaults.name,
              type: proposals.type,
              status: proposals.status,
              createdBy: proposals.createdBy,
              createdAt: proposals.createdAt
            })
            .from(proposals)
            .leftJoin(
              vaults,
              and(
                eq(proposals.entityAddress, vaults.accountAddress),
                eq(proposals.teamId, vaults.teamId)
              )
            )
            .where(
              and(
                eq(proposals.teamId, teamId),
                inArray(proposals.status, PENDING_STATUSES)
              )
            )
            .orderBy(desc(proposals.createdAt))
            .pipe(
              Effect.map((rows) =>
                rows.map((row) => ({
                  id: ProposalId.make(row.id),
                  entityAddress: EntityAddress.make(row.entityAddress),
                  entityName: row.entityName ?? null,
                  type: row.type as ProposalType,
                  status: row.status,
                  createdBy: row.createdBy,
                  createdAt: row.createdAt.toISOString()
                }))
              ),
              Effect.catchTags({ SqlError: Effect.die })
            )
        })

      return {
        insert,
        listByVault,
        getById,
        listByTeam,
        getByIdTeam,
        listAllPending,
        addSignature,
        getSignatures,
        updateStatus,
        setSubmitted,
        setTerminalStatus
      } as const
    })
  }
) {}
