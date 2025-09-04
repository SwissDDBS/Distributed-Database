import { Request, Response, NextFunction } from 'express';
import { TransactionRepository } from '../models/trasactionRepository';
import { notFoundError, validationError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

const transactionRepo = new TransactionRepository();

export class TransactionController {
  /**
   * Get transaction by ID
   */
  async getTransaction(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      if (!id) {
        return next(validationError('Transaction ID is required'));
      }

      const transaction = await transactionRepo.findById(id);
      if (!transaction) {
        return next(notFoundError('Transaction', id));
      }

      res.json({
        success: true,
        data: transaction,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get transactions by status
   */
  async getTransactionsByStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { status } = req.params;
      const { limit = 50 } = req.query;

      if (!['pending', 'committed', 'aborted'].includes(status)) {
        return next(validationError('Status must be one of: pending, committed, aborted'));
      }

      const transactions = await transactionRepo.findByStatus(
        status as 'pending' | 'committed' | 'aborted',
        parseInt(limit as string)
      );

      res.json({
        success: true,
        data: {
          status,
          transactions,
          count: transactions.length,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get account transaction history
   */
  async getAccountTransactions(req: Request, res: Response, next: NextFunction) {
    try {
      const { accountId } = req.params;
      const { limit = 100 } = req.query;

      if (!accountId) {
        return next(validationError('Account ID is required'));
      }

      const transactions = await transactionRepo.getAccountHistory(
        accountId,
        parseInt(limit as string)
      );

      res.json({
        success: true,
        data: {
          account_id: accountId,
          transactions,
          count: transactions.length,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get pending transactions (for monitoring)
   */
  async getPendingTransactions(req: Request, res: Response, next: NextFunction) {
    try {
      const { olderThanMinutes = 30 } = req.query;

      const pendingTransactions = await transactionRepo.getPendingTransactions(
        parseInt(olderThanMinutes as string)
      );

      res.json({
        success: true,
        data: {
          pending_transactions: pendingTransactions,
          count: pendingTransactions.length,
          older_than_minutes: parseInt(olderThanMinutes as string),
          warning: pendingTransactions.length > 0 ? 'Some transactions have been pending for a long time' : undefined,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get transaction statistics
   */
  async getTransactionStats(req: Request, res: Response, next: NextFunction) {
    try {
      // Get counts by status
      const [pending, committed, aborted] = await Promise.all([
        transactionRepo.findByStatus('pending', 1000),
        transactionRepo.findByStatus('committed', 1000),
        transactionRepo.findByStatus('aborted', 1000),
      ]);

      const stats = {
        total: pending.length + committed.length + aborted.length,
        by_status: {
          pending: pending.length,
          committed: committed.length,
          aborted: aborted.length,
        },
        success_rate: committed.length + aborted.length > 0 
          ? (committed.length / (committed.length + aborted.length) * 100).toFixed(2) + '%'
          : '0%',
      };

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update transaction status (admin only)
   */
  async updateTransactionStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!id) {
        return next(validationError('Transaction ID is required'));
      }

      if (!['pending', 'committed', 'aborted'].includes(status)) {
        return next(validationError('Status must be one of: pending, committed, aborted'));
      }

      const existingTransaction = await transactionRepo.findById(id);
      if (!existingTransaction) {
        return next(notFoundError('Transaction', id));
      }

      const updatedTransaction = await transactionRepo.updateStatus(id, status);
      if (!updatedTransaction) {
        return next(notFoundError('Transaction', id));
      }

      logger.info('Transaction status updated', {
        transaction_id: id,
        old_status: existingTransaction.status,
        new_status: status,
        updated_by: req.user?.customer_id,
        coordinator: true,
      });

      res.json({
        success: true,
        data: updatedTransaction,
        message: 'Transaction status updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}
