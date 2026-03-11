ALTER TABLE "proposals" ADD COLUMN "subintent_hash" varchar(255);--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "intent_discriminator" varchar(64) NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "partial_transaction_hex" text;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "epoch_min" integer;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "epoch_max" integer;--> statement-breakpoint
ALTER TABLE "proposals" ALTER COLUMN "intent_discriminator" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "proposal_signatures" ADD COLUMN "signer_public_key" varchar(255) NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "proposal_signatures" ADD COLUMN "signature_bytes" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "proposal_signatures" ADD COLUMN "signed_partial_transaction_hex" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "proposal_signatures" ALTER COLUMN "signer_public_key" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "proposal_signatures" ALTER COLUMN "signature_bytes" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "proposal_signatures" ALTER COLUMN "signed_partial_transaction_hex" DROP DEFAULT;
