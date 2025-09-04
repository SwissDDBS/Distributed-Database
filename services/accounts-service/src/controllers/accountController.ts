import { Request, Response, NextFunction } from 'express';
import { AccountRepository } from '../models/accountRepository';
import { notFoundError, validationError, conflictError } from '../middleware/errorHandler';
import { logger, logAccountOperation } from '../utils/logger';

const accountRepo = new AccountRepository();

export class AccountController {
  /**
   * Get account by ID
   */
  async getAccount(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      if (!id) {
        return next(validationError('Account ID is required'));
      }

      const account = await accountRepo.findById(id);
      if (!account) {
        return next(notFoundError('Account', id));
      }

      logAccountOperation('ACCOUNT_RETRIEVED', id, {
        balance: account.balance,
        customer_id: account.customer_id,
      });

      res.json({
        success: true,
        data: account,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all accounts for a customer
   */
  async getAccountsByCustomer(req: Request, res: Response, next: NextFunction) {
    try {
      const { customerId } = req.params;

      if (!customerId) {
        return next(validationError('Customer ID is required'));
      }

      const accounts = await accountRepo.findByCustomerId(customerId);

      logAccountOperation('CUSTOMER_ACCOUNTS_RETRIEVED', 'multiple', {
        customer_id: customerId,
        account_count: accounts.length,
      });

      res.json({
        success: true,
        data: accounts,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create a new account
   */
  async createAccount(req: Request, res: Response, next: NextFunction) {
    try {
      const { customer_id, initial_balance = 0 } = req.body;

      if (!customer_id) {
        return next(validationError('Customer ID is required'));
      }

      if (initial_balance < 0) {
        return next(validationError('Initial balance cannot be negative'));
      }

      const newAccount = await accountRepo.create({
        customer_id,
        balance: initial_balance.toString(),
      });

      logAccountOperation('ACCOUNT_CREATED', newAccount.account_id, {
        customer_id,
        initial_balance,
      });

      res.status(201).json({
        success: true,
        data: newAccount,
        message: 'Account created successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update account balance (regular update, not 2PC)
   * This is for administrative purposes only
   */
  async updateBalance(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { balance } = req.body;

      if (!id) {
        return next(validationError('Account ID is required'));
      }

      if (typeof balance !== 'number' || balance < 0) {
        return next(validationError('Balance must be a non-negative number'));
      }

      // Check if account exists
      const existingAccount = await accountRepo.findById(id);
      if (!existingAccount) {
        return next(notFoundError('Account', id));
      }

      // Check if account is locked
      const lockStatus = await accountRepo.isLocked(id);
      if (lockStatus.locked) {
        return next(conflictError('Account is currently locked by a transaction', {
          transaction_id: lockStatus.transactionId,
        }));
      }

      const updatedAccount = await accountRepo.updateBalance(id, balance);
      if (!updatedAccount) {
        return next(notFoundError('Account', id));
      }

      logAccountOperation('BALANCE_UPDATED', id, {
        old_balance: existingAccount.balance,
        new_balance: balance,
        updated_by: req.user?.customer_id,
      });

      res.json({
        success: true,
        data: updatedAccount,
        message: 'Account balance updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get account effective balance (including pending changes)
   */
  async getEffectiveBalance(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      if (!id) {
        return next(validationError('Account ID is required'));
      }

      const effectiveBalance = await accountRepo.getEffectiveBalance(id);
      if (effectiveBalance === null) {
        return next(notFoundError('Account', id));
      }

      const account = await accountRepo.findById(id);
      const lockStatus = await accountRepo.isLocked(id);

      logAccountOperation('EFFECTIVE_BALANCE_RETRIEVED', id, {
        effective_balance: effectiveBalance,
        is_locked: lockStatus.locked,
      });

      res.json({
        success: true,
        data: {
          account_id: id,
          current_balance: account?.balance,
          pending_change: account?.pending_change,
          effective_balance: effectiveBalance,
          is_locked: lockStatus.locked,
          transaction_id: lockStatus.transactionId,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * UNSAFE: Withdraw money (for demonstrating race conditions)
   * This endpoint intentionally has race conditions
   */
  async unsafeWithdraw(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { amount } = req.body;

      if (!id) {
        return next(validationError('Account ID is required'));
      }

      if (typeof amount !== 'number' || amount <= 0) {
        return next(validationError('Amount must be a positive number'));
      }

      // Check if account exists
      const account = await accountRepo.findById(id);
      if (!account) {
        return next(notFoundError('Account', id));
      }

      // Check if sufficient funds (this check is racy!)
      if (account.balance < amount) {
        return next(validationError('Insufficient funds', {
          current_balance: account.balance,
          requested_amount: amount,
        }));
      }

      // Perform unsafe balance update (race condition possible here)
      const updatedAccount = await accountRepo.unsafeUpdateBalance(id, -amount);
      if (!updatedAccount) {
        return next(notFoundError('Account', id));
      }

      logger.warn('UNSAFE WITHDRAWAL PERFORMED', {
        account_id: id,
        amount,
        old_balance: account.balance,
        new_balance: updatedAccount.balance,
        warning: 'This operation is vulnerable to race conditions',
      });

      res.json({
        success: true,
        data: updatedAccount,
        message: 'Withdrawal completed (UNSAFE - for demonstration only)',
        warning: 'This endpoint is intentionally vulnerable to race conditions',
      });
    } catch (error) {
      next(error);
    }
  }
}
