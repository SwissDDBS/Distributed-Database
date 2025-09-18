import { Request, Response, NextFunction } from 'express';
import { TwoPhaseCommitCoordinator } from '../services/twoPhaseCommitCoordinator';
import { validationError, coordinatorError } from '../middleware/errorHandler';
import { logger, logCoordinatorEvent } from '../utils/logger';

const coordinator = new TwoPhaseCommitCoordinator();

export class TransferController {
  /**
   * Execute a fund transfer using 2PC protocol
   * This is the main endpoint for initiating transfers
   */
  async executeTransfer(req: Request, res: Response, next: NextFunction) {
    try {
      const { source_account_id, destination_account_id, amount, transaction_id } = req.body;

      // Validate required fields
      if (!source_account_id || !destination_account_id || amount === undefined) {
        return next(validationError('Missing required fields: source_account_id, destination_account_id, amount'));
      }

      // Validate amount
      if (typeof amount !== 'number' || amount <= 0) {
        return next(validationError('Amount must be a positive number'));
      }

      // Validate that source and destination are different
      if (source_account_id === destination_account_id) {
        return next(validationError('Source and destination accounts must be different'));
      }

      // Get authorization token from request
      const authHeader = req.headers['authorization'];
      if (!authHeader) {
        return next(validationError('Authorization token required'));
      }

      const initiatorId = req.user?.customer_id || 'unknown';

      logCoordinatorEvent('TRANSFER_REQUEST_RECEIVED', transaction_id || 'pending', {
        source_account_id,
        destination_account_id,
        amount,
        initiator: initiatorId,
        retry_with_transaction_id: !!transaction_id,
      });

      // Execute the transfer using 2PC protocol with retry mechanism
      const result = await coordinator.executeTransferWithRetry(
        { source_account_id, destination_account_id, amount },
        authHeader,
        initiatorId,
        transaction_id // Pass provided transaction ID for retry
      );

      logCoordinatorEvent('TRANSFER_REQUEST_COMPLETED', result.transaction_id, {
        status: result.status,
        message: result.message,
        retry_attempt: result.retry_attempt,
        total_attempts: result.total_attempts,
      });

      const statusCode = result.status === 'committed' ? 200 : 409;

      res.status(statusCode).json({
        success: result.status === 'committed',
        data: {
          transaction_id: result.transaction_id,
          status: result.status,
          source_account_id,
          destination_account_id,
          amount,
          retry_attempt: result.retry_attempt,
          total_attempts: result.total_attempts,
        },
        message: result.message,
        ...(result.details && { details: result.details }),
      });

    } catch (error) {
      logger.error('Transfer execution error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        body: req.body,
        user: req.user,
      });
      
      next(coordinatorError(
        error instanceof Error ? error.message : 'Unknown transfer error',
        { body: req.body }
      ));
    }
  }

  /**
   * Get transfer status by transaction ID
   */
  async getTransferStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { transactionId } = req.params;

      if (!transactionId) {
        return next(validationError('Transaction ID is required'));
      }

      // Import here to avoid circular dependency issues
      const { TransactionRepository } = await import('../models/trasactionRepository');
      const transactionRepo = new TransactionRepository();

      const transaction = await transactionRepo.findById(transactionId);
      if (!transaction) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Transaction not found',
          },
        });
      }

      res.json({
        success: true,
        data: {
          transaction_id: transaction.transaction_id,
          source_account_id: transaction.source_account_id,
          destination_account_id: transaction.destination_account_id,
          amount: transaction.amount,
          status: transaction.status,
          created_at: transaction.created_at,
          updated_at: transaction.updated_at,
        },
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Get transfer history for an account
   */
  async getTransferHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const { accountId } = req.params;
      const { limit = 50, offset = 0 } = req.query;

      if (!accountId) {
        return next(validationError('Account ID is required'));
      }

      // Import here to avoid circular dependency issues
      const { TransactionRepository } = await import('../models/trasactionRepository');
      const transactionRepo = new TransactionRepository();

      const transactions = await transactionRepo.findByAccountId(
        accountId,
        parseInt(limit as string),
        parseInt(offset as string)
      );

      res.json({
        success: true,
        data: {
          account_id: accountId,
          transactions,
          pagination: {
            limit: parseInt(limit as string),
            offset: parseInt(offset as string),
            count: transactions.length,
          },
        },
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Health check for transfer functionality
   */
  async healthCheck(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({
        success: true,
        data: {
          service: 'TransactionsService-Transfer',
          status: 'healthy',
          coordinator: true,
          capabilities: [
            'fund_transfers',
            '2pc_coordination',
            'transaction_history',
            'status_tracking',
          ],
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
