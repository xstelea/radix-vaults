import {
  boolean,
  integer,
  pgTable,
  timestamp,
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
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow()
})
