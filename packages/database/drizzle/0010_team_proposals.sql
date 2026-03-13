ALTER TABLE "proposals" DROP CONSTRAINT "proposals_vault_address_vaults_account_address_fk";--> statement-breakpoint
ALTER TABLE "proposals" RENAME COLUMN "vault_address" TO "entity_address";--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "type" varchar(32) DEFAULT 'vault' NOT NULL;