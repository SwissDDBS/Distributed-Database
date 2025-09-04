import { Request, Response, NextFunction } from 'express';
import { AccountRepository } from '../models/accountRepository';
import { notFoundError, validationError, conflictError } from '../middleware/errorHandler';
import { logger, logTransactionEvent } from '../utils/logger';

const accountRepo = new AccountRepository();

export class TwoPhaseCommitController {
  /**
   * Phase 1: Prepare - Lock account and validate transaction
   */
  async prepare(req: Request, res: Response, next: NextFunction) {
    try {
      const { transaction_id, account_id, amount, operation } = req.body;

      // Validate required fields
      if (!transaction_id || !account_id || amount === undefined || !operation) {
        return next(validationError('Missing required fields: transaction_id, account_id, amount, operation'));
      }

      if (!['debit', 'credit'].includes(operation)) {
        return next(validationError('Operation must be either "debit" or "credit"'));
      }

      if (typeof amount !== 'number') {
        return next(validationError('Amount must be a number'));
      }

      // Check if account exists
      const account = await accountRepo.findById(account_id);
      if (!account) {
        logTransactionEvent('PREPARE_FAILED_ACCOUNT_NOT_FOUND', transaction_id, {
          account_id,
          operation,
          amount,
        });
        return next(notFoundError('Account', account_id));
      }

      // Check if account is already locked
      const lockStatus = await accountRepo.isLocked(account_id);
      if (lockStatus.locked && lockStatus.transactionId !== transaction_id) {
        logTransactionEvent('PREPARE_FAILED_ACCOUNT_LOCKED', transaction_id, {
          account_id,
          existing_transaction_id: lockStatus.transactionId,
        });
        return next(conflictError('Account is locked by another transaction', {
          existing_transaction_id: lockStatus.transactionId,
        }));
      }

      // For debit operations, check if sufficient funds
      if (operation === 'debit' && !await accountRepo.canDebit(account_id, Math.abs(amount))) {
        logTransactionEvent('PREPARE_FAILED_INSUFFICIENT_FUNDS', transaction_id, {
          account_id,
          current_balance: account.balance,
          requested_amount: Math.abs(amount),
        });
        
        res.status(409).json({
          success: false,
          vote: 'abort',
          error: {
            code: 'INSUFFICIENT_FUNDS',
            message: 'Insufficient funds for debit operation',
            details: {
              current_balance: account.balance,
              requested_amount: Math.abs(amount),
            },
          },
        });
        return;
      }

      // Calculate pending change (negative for debit, positive for credit)
      const pendingChange = operation === 'debit' ? -Math.abs(amount) : Math.abs(amount);

      // Lock the account with pending change
      const lockSuccess = await accountRepo.lockForTransaction(account_id, transaction_id, pendingChange);
      if (!lockSuccess) {
        logTransactionEvent('PREPARE_FAILED_LOCK_FAILED', transaction_id, {
          account_id,
          operation,
          amount,
        });
        return next(conflictError('Failed to lock account for transaction'));
      }

      logTransactionEvent('PREPARE_SUCCESS_VOTE_COMMIT', transaction_id, {
        account_id,
        operation,
        amount,
        pending_change: pendingChange,
        current_balance: account.balance,
      });

      res.json({
        success: true,
        vote: 'commit',
        message: 'Account prepared for transaction',
        details: {
          account_id,
          current_balance: account.balance,
          pending_change: pendingChange,
          operation,
        },
      });
    } catch (error) {
      logger.error('Prepare phase error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        transaction_id: req.body.transaction_id,
        account_id: req.body.account_id,
      });
      next(error);
    }
  }

  /**
   * Phase 2: Commit - Apply the prepared changes
   */
  async commit(req: Request, res: Response, next: NextFunction) {
    try {
      const { transaction_id, account_id } = req.body;

      if (!transaction_id || !account_id) {
        return next(validationError('Missing required fields: transaction_id, account_id'));
      }

      // Commit the transaction
      const commitSuccess = await accountRepo.commitTransaction(account_id, transaction_id);
      if (!commitSuccess) {
        logTransactionEvent('COMMIT_FAILED', transaction_id, {
          account_id,
          reason: 'Failed to commit transaction',
        });
        return next(conflictError('Failed to commit transaction', {
          transaction_id,
          account_id,
        }));
      }

      // Get updated account info
      const updatedAccount = await accountRepo.findById(account_id);

      logTransactionEvent('COMMIT_SUCCESS', transaction_id, {
        account_id,
        new_balance: updatedAccount?.balance,
      });

      res.json({
        success: true,
        message: 'Transaction committed successfully',
        details: {
          account_id,
          new_balance: updatedAccount?.balance,
        },
      });
    } catch (error) {
      logger.error('Commit phase error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        transaction_id: req.body.transaction_id,
        account_id: req.body.account_id,
      });
      next(error);
    }
  }

  /**
   * Phase 2: Abort - Discard the prepared changes
   */
  async abort(req: Request, res: Response, next: NextFunction) {
    try {
      const { transaction_id, account_id } = req.body;

      if (!transaction_id || !account_id) {
        return next(validationError('Missing required fields: transaction_id, account_id'));
      }

      // Abort the transaction
      const abortSuccess = await accountRepo.abortTransaction(account_id, transaction_id);
      if (!abortSuccess) {
        logTransactionEvent('ABORT_FAILED', transaction_id, {
          account_id,
          reason: 'Failed to abort transaction',
        });
        return next(conflictError('Failed to abort transaction', {
          transaction_id,
          account_id,
        }));
      }

      logTransactionEvent('ABORT_SUCCESS', transaction_id, {
        account_id,
      });

      res.json({
        success: true,
        message: 'Transaction aborted successfully',
        details: {
          account_id,
        },
      });
    } catch (error) {
      logger.error('Abort phase error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        transaction_id: req.body.transaction_id,
        account_id: req.body.account_id,
      });
      next(error);
    }
  }

  /**
   * Get transaction status for an account
   */
  async getTransactionStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { account_id, transaction_id } = req.params;

      if (!account_id) {
        return next(validationError('Account ID is required'));
      }

      const account = await accountRepo.findById(account_id);
      if (!account) {
        return next(notFoundError('Account', account_id));
      }

      const lockStatus = await accountRepo.isLocked(account_id);
      
      res.json({
        success: true,
        data: {
          account_id,
          is_locked: lockStatus.locked,
          transaction_id: lockStatus.transactionId,
          pending_change: account.pending_change,
          current_balance: account.balance,
          effective_balance: await accountRepo.getEffectiveBalance(account_id),
          matches_transaction: transaction_id ? lockStatus.transactionId === transaction_id : true,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Health check for 2PC functionality
   */
  async healthCheck(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({
        success: true,
        data: {
          service: 'AccountsService-2PC',
          status: 'healthy',
          capabilities: [
            'prepare',
            'commit',
            'abort',
            'transaction_status',
          ],
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
