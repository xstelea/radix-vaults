import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar
} from 'drizzle-orm/pg-core'

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

export const memberSignerSources = pgTable('member_signer_sources', {
  accountAddress: varchar('account_address', { length: 255 }).primaryKey(),
  publicKey: varchar('public_key', { length: 255 }).notNull(),
  keyType: varchar('key_type', { length: 32 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow()
})

export const proposals = pgTable('proposals', {
  id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
  vaultAddress: varchar('vault_address', { length: 255 })
    .notNull()
    .references(() => vaults.accountAddress, { onDelete: 'cascade' }),
  status: varchar('status', { length: 32 }).notNull(),
  manifest: text('manifest').notNull(),
  maxProposerTimestamp: varchar('max_proposer_timestamp', {
    length: 64
  }).notNull(),
  createdBy: varchar('created_by', { length: 255 }).notNull(),
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
    signerKeyHash: varchar('signer_key_hash', { length: 255 }).notNull(),
    signerKeyType: varchar('signer_key_type', { length: 32 }).notNull(),
    signedAt: timestamp('signed_at', { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => [unique().on(t.proposalId, t.signerAccountAddress)]
)
