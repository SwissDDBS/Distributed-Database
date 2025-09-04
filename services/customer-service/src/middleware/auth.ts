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
    });

    next();
  } catch (error) {
    logger.warn('Authentication failed: Invalid token', {
      error: error instanceof Error ? error.message : 'Unknown error',
      path: req.path,
      method: req.method,
      ip: req.ip,
    });
    return next(unauthorizedError('Invalid or expired token'));
  }
};

export const authorizeCustomerAccess = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return next(unauthorizedError('Authentication required'));
  }

  const customerId = req.params.id || req.params.customerId;
  if (!customerId) {
    return next(forbiddenError('Customer ID required'));
  }

  // Admin and teller can access any customer
  if (req.user.role === 'admin' || req.user.role === 'teller') {
    return next();
  }

  // Customers can only access their own data
  if (req.user.customer_id !== customerId) {
    logger.warn('Authorization failed: Customer access denied', {
      requesting_customer_id: req.user.customer_id,
      requested_customer_id: customerId,
      path: req.path,
    });
    return next(forbiddenError('Access denied to customer data'));
  }

  next();
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
      });
      return next(forbiddenError(`Access denied. Required roles: ${allowedRoles.join(', ')}`));
    }

    next();
  };
};
