import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { unauthorizedError, forbiddenError } from './errorHandler';
import { logger } from '../utils/logger';

// Extend Request type to include user info
declare global {
  namespace Express {
    interface Request {
      user?: {
        customer_id: string;
        role: 'customer' | 'teller' | 'admin';
      };
    }
  }
}

interface JWTPayload {
  customer_id: string;
  role: 'customer' | 'teller' | 'admin';
  iat?: number;
  exp?: number;
}

export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    logger.warn('Authentication failed: No token provided', {
      path: req.path,
      method: req.method,
      ip: req.ip,
      coordinator: true,
    });
    return next(unauthorizedError('Access token required'));
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret) as JWTPayload;
    req.user = {
      customer_id: decoded.customer_id,
      role: decoded.role,
    };

    logger.info('Authentication successful', {
      customer_id: decoded.customer_id,
      role: decoded.role,
      path: req.path,
      method: req.method,
      coordinator: true,
    });

    next();
  } catch (error) {
    logger.warn('Authentication failed: Invalid token', {
      error: error instanceof Error ? error.message : 'Unknown error',
      path: req.path,
      method: req.method,
      ip: req.ip,
      coordinator: true,
    });
    return next(unauthorizedError('Invalid or expired token'));
  }
};

export const requireRole = (allowedRoles: Array<'customer' | 'teller' | 'admin'>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(unauthorizedError('Authentication required'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn('Authorization failed: Insufficient role', {
        customer_id: req.user.customer_id,
        user_role: req.user.role,
        required_roles: allowedRoles,
        path: req.path,
        coordinator: true,
      });
      return next(forbiddenError(`Access denied. Required roles: ${allowedRoles.join(', ')}`));
    }

    next();
  };
};

// Special authorization for transaction operations
export const authorizeTransactionAccess = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return next(unauthorizedError('Authentication required'));
  }

  const transactionId = req.params.id || req.params.transactionId;
  if (!transactionId) {
    return next(forbiddenError('Transaction ID required'));
  }

  // Admin and teller can access any transaction
  if (req.user.role === 'admin' || req.user.role === 'teller') {
    return next();
  }

  // For customers, we need to verify they are involved in the transaction
  try {
    const { TransactionRepository } = await import('../models/trasactionRepository');
    const transactionRepo = new TransactionRepository();
    
    const transaction = await transactionRepo.findById(transactionId);
    if (!transaction) {
      return next(forbiddenError('Transaction not found'));
    }

    // Check if customer is involved in this transaction
    // We would need to verify account ownership, but for now we'll allow access
    // In a real system, we'd check if the customer owns either source or destination account
    
    next();
  } catch (error) {
    logger.error('Authorization error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      customer_id: req.user.customer_id,
      transaction_id: transactionId,
      coordinator: true,
    });
    next(error);
  }
};
