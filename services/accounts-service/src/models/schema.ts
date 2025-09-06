import { pgTable, uuid, decimal, timestamp, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Account table schema with 2PC support
export const accounts = pgTable('accounts', {
  account_id: uuid('account_id').primaryKey().default(sql`gen_random_uuid()`),
  customer_id: uuid('customer_id').notNull(),
  balance: decimal('balance', { precision: 19, scale: 4 }).notNull(),
  
  // Two-Phase Commit (2PC) columns
  transaction_lock: uuid('transaction_lock'),
  pending_change: decimal('pending_change', { precision: 19, scale: 4 }),
  
  created_at: timestamp('created_at', { withTimezone: true }).notNull().default(sql`NOW()`),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`NOW()`),
});

// Type inference for TypeScript
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;

// Helper type for account with parsed balance
export type AccountWithBalance = Omit<Account, 'balance' | 'pending_change'> & {
  balance: number;
  pending_change?: number | null;
};
