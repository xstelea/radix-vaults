ALTER TABLE "vaults" DROP CONSTRAINT "vaults_pkey";--> statement-breakpoint
ALTER TABLE "vaults" ADD COLUMN "team_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "vaults" ADD CONSTRAINT "vaults_team_id_account_address_pk" PRIMARY KEY("team_id","account_address");--> statement-breakpoint
ALTER TABLE "vaults" ADD CONSTRAINT "vaults_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "team_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;
