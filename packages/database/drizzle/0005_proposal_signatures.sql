CREATE TABLE "proposal_signatures" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "proposal_signatures_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"proposal_id" integer NOT NULL,
	"signer_account_address" varchar(255) NOT NULL,
	"signer_key_hash" varchar(255) NOT NULL,
	"signer_key_type" varchar(32) NOT NULL,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposal_signatures_proposal_id_signer_account_address_unique" UNIQUE("proposal_id","signer_account_address")
);
--> statement-breakpoint
ALTER TABLE "proposal_signatures" ADD CONSTRAINT "proposal_signatures_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;
