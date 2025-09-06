CREATE TABLE IF NOT EXISTS "accounts" (
	"account_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"balance" numeric(19, 4) NOT NULL,
	"transaction_lock" uuid,
	"pending_change" numeric(19, 4),
	"created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT NOW() NOT NULL,
	CONSTRAINT "unique_transaction_lock" UNIQUE("transaction_lock")
);
