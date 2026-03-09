CREATE TABLE "member_signer_sources" (
	"account_address" varchar(255) PRIMARY KEY NOT NULL,
	"public_key" varchar(255) NOT NULL,
	"key_type" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
