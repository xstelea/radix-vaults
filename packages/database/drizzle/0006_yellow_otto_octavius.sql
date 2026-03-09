ALTER TABLE "proposals" ADD COLUMN "transaction_intent_hash" varchar(255);--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "submitted_at" timestamp with time zone;