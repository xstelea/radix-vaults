ALTER TABLE "proposals" ADD COLUMN "manifest" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "max_proposer_timestamp" varchar(64) NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "created_by" varchar(255) NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "proposals" ALTER COLUMN "manifest" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "proposals" ALTER COLUMN "max_proposer_timestamp" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "proposals" ALTER COLUMN "created_by" DROP DEFAULT;
