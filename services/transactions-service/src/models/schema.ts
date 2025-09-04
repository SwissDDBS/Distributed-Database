import { pgTable, uuid, decimal, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Transaction status enum
export const transactionStatusEnum = pgEnum('transaction_status', [
  'pending',
  'committed', 
  'aborted'
]);

// Transaction table schema
export const transactions = pgTable('transactions', {
  transaction_id: uuid('transaction_id').primaryKey().default(sql`gen_random_uuid()`),
  source_account_id: uuid('source_account_id').notNull(),
  destination_account_id: uuid('destination_account_id').notNull(),
  amount: decimal('amount', { precision: 19, scale: 4 }).notNull(),
  status: transactionStatusEnum('status').notNull().default('pending'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().default(sql`NOW()`),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`NOW()`),
});

// Type inference for TypeScript
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;

// Helper type for transaction with parsed amount
export type TransactionWithAmount = Omit<Transaction, 'amount'> & {
  amount: number;
};

// Transaction status type
export type TransactionStatus = Transaction['status'];
