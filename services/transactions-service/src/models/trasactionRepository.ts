import { eq, and, desc } from 'drizzle-orm';
import { db } from '../utils/db';
import { transactions, type Transaction, type NewTransaction, type TransactionWithAmount } from './schema';

export class TransactionRepository {
  /**
   * Create a new transaction
   */
  async create(transactionData: Omit<NewTransaction, 'transaction_id' | 'created_at' | 'updated_at'>): Promise<TransactionWithAmount> {
    const [transaction] = await db
      .insert(transactions)
      .values(transactionData)
      .returning();
    
    return this.parseTransaction(transaction);
  }

  /**
   * Create a new transaction with a specific ID (for retry scenarios)
   */
  async createWithId(transactionData: Omit<NewTransaction, 'created_at' | 'updated_at'>): Promise<TransactionWithAmount> {
    const [transaction] = await db
      .insert(transactions)
      .values(transactionData)
      .returning();
    
    return this.parseTransaction(transaction);
  }

  /**
   * Find transaction by ID
   */
  async findById(transactionId: string): Promise<TransactionWithAmount | null> {
    const [transaction] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.transaction_id, transactionId))
      .limit(1);
    
    return transaction ? this.parseTransaction(transaction) : null;
  }

  /**
   * Update transaction status
   */
  async updateStatus(transactionId: string, status: 'pending' | 'committed' | 'aborted'): Promise<TransactionWithAmount | null> {
    const [updatedTransaction] = await db
      .update(transactions)
      .set({
        status,
        updated_at: new Date(),
      })
      .where(eq(transactions.transaction_id, transactionId))
      .returning();
    
    return updatedTransaction ? this.parseTransaction(updatedTransaction) : null;
  }

  /**
   * Find transactions by account ID (either source or destination)
   */
  async findByAccountId(accountId: string, limit: number = 50, offset: number = 0): Promise<TransactionWithAmount[]> {
    const transactionList = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.source_account_id, accountId)
        )
      )
      .union(
        db
          .select()
          .from(transactions)
          .where(eq(transactions.destination_account_id, accountId))
      )
      .orderBy(desc(transactions.created_at))
      .limit(limit)
      .offset(offset);
    
    return transactionList.map(this.parseTransaction);
  }

  /**
   * Find transactions by status
   */
  async findByStatus(status: 'pending' | 'committed' | 'aborted', limit: number = 50): Promise<TransactionWithAmount[]> {
    const transactionList = await db
      .select()
      .from(transactions)
      .where(eq(transactions.status, status))
      .orderBy(desc(transactions.created_at))
      .limit(limit);
    
    return transactionList.map(this.parseTransaction);
  }

  /**
   * Get transaction history for an account
   */
  async getAccountHistory(accountId: string, limit: number = 100): Promise<TransactionWithAmount[]> {
    return this.findByAccountId(accountId, limit);
  }

  /**
   * Check if transaction exists
   */
  async exists(transactionId: string): Promise<boolean> {
    const [result] = await db
      .select({ transaction_id: transactions.transaction_id })
      .from(transactions)
      .where(eq(transactions.transaction_id, transactionId))
      .limit(1);
    
    return !!result;
  }

  /**
   * Helper method to parse decimal strings to numbers
   */
  private parseTransaction(transaction: Transaction): TransactionWithAmount {
    return {
      ...transaction,
      amount: parseFloat(transaction.amount),
    };
  }

  /**
   * Get pending transactions (for cleanup/monitoring)
   */
  async getPendingTransactions(olderThanMinutes: number = 30): Promise<TransactionWithAmount[]> {
    const cutoffTime = new Date(Date.now() - olderThanMinutes * 60 * 1000);
    
    const transactionList = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.status, 'pending'),
          // Add timestamp comparison here if needed
        )
      )
      .orderBy(transactions.created_at);
    
    return transactionList.map(this.parseTransaction);
  }
}