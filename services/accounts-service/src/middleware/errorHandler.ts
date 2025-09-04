import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  details?: Record<string, any>;
}

export const errorHandler = (
  error: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Log the error
  logger.error('API Error', {
    error: error.message,
    stack: error.stack,
    statusCode: error.statusCode,
    code: error.code,
    details: error.details,
    method: req.method,
    path: req.path,
    body: req.body,
    params: req.params,
    query: req.query,
  });

  // Default error response
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal Server Error';
  const code = error.code || 'INTERNAL_ERROR';

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      ...(error.details && { details: error.details }),
    },
  });
};

// Helper function to create standardized errors
export const createError = (
  message: string,
  statusCode: number = 500,
  code?: string,
  details?: Record<string, any>
): AppError => {
  const error = new Error(message) as AppError;
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  return error;
};

// Common error creators
export const notFoundError = (resource: string, id: string) =>
  createError(`${resource} not found`, 404, 'NOT_FOUND', { resource, id });

export const validationError = (message: string, details?: Record<string, any>) =>
  createError(message, 400, 'VALIDATION_ERROR', details);

export const conflictError = (message: string, details?: Record<string, any>) =>
  createError(message, 409, 'CONFLICT_ERROR', details);

export const unauthorizedError = (message: string = 'Unauthorized') =>
  createError(message, 401, 'UNAUTHORIZED');

export const forbiddenError = (message: string = 'Forbidden') =>
  createError(message, 403, 'FORBIDDEN');
