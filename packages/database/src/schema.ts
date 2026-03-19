import {
  boolean,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar
} from 'drizzle-orm/pg-core'

export const teams = pgTable('teams', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  badgeAddress: varchar('badge_address', { length: 255 }).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow()
})

export const teamMembers = pgTable(
  'team_members',
  {
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id),
    accountAddress: varchar('account_address', { length: 255 }).notNull(),
    confirmed: boolean('confirmed').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => [primaryKey({ columns: [t.teamId, t.accountAddress] })]
)

export const vaults = pgTable('vaults', {
  accountAddress: varchar('account_address', { length: 255 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow()
})

export const challenges = pgTable('challenges', {
  id: uuid('id').defaultRandom().primaryKey(),
  challenge: varchar('challenge', { length: 64 }).notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  used: boolean('used').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow()
})

export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  accountAddress: varchar('account_address', { length: 255 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow()
})

export const proposals = pgTable('proposals', {
  id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
  entityAddress: varchar('entity_address', { length: 255 }).notNull(),
  type: varchar('type', { length: 32 }).notNull().default('vault'),
  status: varchar('status', { length: 32 }).notNull(),
  manifest: text('manifest').notNull(),
  maxProposerTimestamp: varchar('max_proposer_timestamp', {
    length: 64
  }).notNull(),
  createdBy: varchar('created_by', { length: 255 }).notNull(),
  subintentHash: varchar('subintent_hash', { length: 255 }),
  intentDiscriminator: varchar('intent_discriminator', {
    length: 64
  }).notNull(),
  partialTransactionHex: text('partial_transaction_hex'),
  epochMin: integer('epoch_min').notNull(),
  epochMax: integer('epoch_max').notNull(),
  transactionIntentHash: varchar('transaction_intent_hash', { length: 255 }),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  statusReason: text('status_reason'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow()
})

export const proposalSignatures = pgTable(
  'proposal_signatures',
  {
    id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
    proposalId: integer('proposal_id')
      .notNull()
      .references(() => proposals.id, { onDelete: 'cascade' }),
    signerAccountAddress: varchar('signer_account_address', {
      length: 255
    }).notNull(),
    signerPublicKey: varchar('signer_public_key', { length: 255 }).notNull(),
    signerKeyHash: varchar('signer_key_hash', { length: 255 }).notNull(),
    signerKeyType: varchar('signer_key_type', { length: 32 }).notNull(),
    signatureBytes: text('signature_bytes').notNull(),
    signedPartialTransactionHex: text(
      'signed_partial_transaction_hex'
    ).notNull(),
    signedAt: timestamp('signed_at', { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => [unique().on(t.proposalId, t.signerAccountAddress)]
)
