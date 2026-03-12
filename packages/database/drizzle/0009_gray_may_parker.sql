ALTER TABLE "member_signer_sources" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "member_signer_sources" CASCADE;--> statement-breakpoint
ALTER TABLE "proposals" ALTER COLUMN "epoch_min" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "proposals" ALTER COLUMN "epoch_max" SET NOT NULL;