DO $$ BEGIN
 CREATE TYPE "transaction_status" AS ENUM('pending', 'committed', 'aborted');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transactions" (
	"transaction_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_account_id" uuid NOT NULL,
	"destination_account_id" uuid NOT NULL,
	"amount" numeric(19, 4) NOT NULL,
	"status" "transaction_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT NOW() NOT NULL
);
