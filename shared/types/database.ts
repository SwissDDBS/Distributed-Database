// Database-specific types and utilities

export interface DatabaseConnection {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
}

export interface MigrationResult {
  success: boolean;
  message: string;
  error?: Error;
}

// Utility functions for decimal handling in PostgreSQL
export class DecimalUtils {
  /**
   * Convert string decimal to number safely
   */
  static toNumber(decimalString: string | null | undefined): number {
    if (!decimalString) return 0;
    return parseFloat(decimalString);
  }

  /**
   * Convert number to string decimal for database storage
   */
  static toString(value: number): string {
    return value.toFixed(4);
  }

  /**
   * Format currency for display
   */
  static formatCurrency(value: number, currency: string = 'USD'): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(value);
  }
}

// Transaction lock utilities
export class TransactionLockUtils {
  /**
   * Generate a unique transaction ID
   */
  static generateTransactionId(): string {
    return crypto.randomUUID();
  }

  /**
   * Check if a transaction is expired
   */
  static isTransactionExpired(createdAt: Date, timeoutMs: number): boolean {
    const now = new Date();
    const elapsed = now.getTime() - createdAt.getTime();
    return elapsed > timeoutMs;
  }
}
