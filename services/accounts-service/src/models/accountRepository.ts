import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../utils/db';
import { accounts, type Account, type NewAccount, type AccountWithBalance } from './schema';

export class AccountRepository {
  /**
   * Create a new account
   */
  async create(accountData: Omit<NewAccount, 'account_id' | 'created_at' | 'updated_at'>): Promise<AccountWithBalance> {
    const [account] = await db
      .insert(accounts)
      .values(accountData)
      .returning();
    
    return this.parseAccount(account);
  }

  /**
   * Find account by ID
   */
  async findById(accountId: string): Promise<AccountWithBalance | null> {
    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.account_id, accountId))
      .limit(1);
    
    return account ? this.parseAccount(account) : null;
  }

  /**
   * Find all accounts for a customer
   */
  async findByCustomerId(customerId: string): Promise<AccountWithBalance[]> {
    const accountList = await db
      .select()
      .from(accounts)
      .where(eq(accounts.customer_id, customerId))
      .orderBy(accounts.created_at);
    
    return accountList.map(this.parseAccount);
  }

  /**
   * Update account balance (regular update, not 2PC)
   */
  async updateBalance(accountId: string, newBalance: number): Promise<AccountWithBalance | null> {
    const [updatedAccount] = await db
      .update(accounts)
      .set({
        balance: newBalance.toString(),
        updated_at: new Date(),
      })
      .where(eq(accounts.account_id, accountId))
      .returning();
    
    return updatedAccount ? this.parseAccount(updatedAccount) : null;
  }

  /**
   * Lock account for 2PC transaction
   */
  async lockForTransaction(accountId: string, transactionId: string, pendingChange: number): Promise<boolean> {
    const result = await db
      .update(accounts)
      .set({
        transaction_lock: transactionId,
        pending_change: pendingChange.toString(),
        updated_at: new Date(),
      })
      .where(and(
        eq(accounts.account_id, accountId),
        isNull(accounts.transaction_lock) // Only lock if not already locked
      ));
    
    return result.rowCount > 0;
  }

  /**
   * Check if account can support a debit (has sufficient balance)
   */
  async canDebit(accountId: string, amount: number): Promise<boolean> {
    const account = await this.findById(accountId);
    if (!account) return false;
    
    return account.balance >= amount;
  }

  /**
   * Commit 2PC transaction - apply pending changes
   */
  async commitTransaction(accountId: string, transactionId: string): Promise<boolean> {
    const account = await db
      .select()
      .from(accounts)
      .where(and(
        eq(accounts.account_id, accountId),
        eq(accounts.transaction_lock, transactionId)
      ))
      .limit(1);
    
    if (!account[0] || !account[0].pending_change) {
      return false;
    }

    const currentBalance = parseFloat(account[0].balance);
    const pendingChange = parseFloat(account[0].pending_change);
    const newBalance = currentBalance + pendingChange;

    const result = await db
      .update(accounts)
      .set({
        balance: newBalance.toString(),
        transaction_lock: null,
        pending_change: null,
        updated_at: new Date(),
      })
      .where(and(
        eq(accounts.account_id, accountId),
        eq(accounts.transaction_lock, transactionId)
      ));
    
    return result.rowCount > 0;
  }

  /**
   * Abort 2PC transaction - discard pending changes
   */
  async abortTransaction(accountId: string, transactionId: string): Promise<boolean> {
    const result = await db
      .update(accounts)
      .set({
        transaction_lock: null,
        pending_change: null,
        updated_at: new Date(),
      })
      .where(and(
        eq(accounts.account_id, accountId),
        eq(accounts.transaction_lock, transactionId)
      ));
    
    return result.rowCount > 0;
  }

  /**
   * Check if account is locked by a transaction
   */
  async isLocked(accountId: string): Promise<{ locked: boolean; transactionId?: string }> {
    const [account] = await db
      .select({ 
        transaction_lock: accounts.transaction_lock 
      })
      .from(accounts)
      .where(eq(accounts.account_id, accountId))
      .limit(1);
    
    if (!account) {
      return { locked: false };
    }

    return {
      locked: !!account.transaction_lock,
      transactionId: account.transaction_lock || undefined,
    };
  }

  /**
   * Get account balance with pending changes considered
   */
  async getEffectiveBalance(accountId: string): Promise<number | null> {
    const account = await this.findById(accountId);
    if (!account) return null;
    
    let effectiveBalance = account.balance;
    if (account.pending_change !== null && account.pending_change !== undefined) {
      effectiveBalance += account.pending_change;
    }
    
    return effectiveBalance;
  }

  /**
   * Helper method to parse decimal strings to numbers
   */
  private parseAccount(account: Account): AccountWithBalance {
    return {
      ...account,
      balance: parseFloat(account.balance),
      pending_change: account.pending_change ? parseFloat(account.pending_change) : null,
    };
  }

  /**
   * Check if account exists
   */
  async exists(accountId: string): Promise<boolean> {
    const [result] = await db
      .select({ account_id: accounts.account_id })
      .from(accounts)
      .where(eq(accounts.account_id, accountId))
      .limit(1);
    
    return !!result;
  }

  /**
   * Unsafe balance update (for demonstrating race conditions)
   */
  async unsafeUpdateBalance(accountId: string, amount: number): Promise<AccountWithBalance | null> {
    // This method intentionally has a race condition
    // Step 1: Read current balance
    const account = await this.findById(accountId);
    if (!account) return null;
    
    // Simulate some processing time
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Step 2: Calculate new balance
    const newBalance = account.balance + amount;
    
    // Step 3: Update balance (this can cause race conditions)
    const [updatedAccount] = await db
      .update(accounts)
      .set({
        balance: newBalance.toString(),
        updated_at: new Date(),
      })
      .where(eq(accounts.account_id, accountId))
      .returning();
    
    return updatedAccount ? this.parseAccount(updatedAccount) : null;
  }
}
