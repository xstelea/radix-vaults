import { integer, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core'

export const vaults = pgTable('vaults', {
  accountAddress: varchar('account_address', { length: 255 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
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
