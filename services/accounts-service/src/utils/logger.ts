import winston from 'winston';
import { config } from '../config';

// Create logger instance
export const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { 
    service: config.serviceName 
  },
  transports: [
    // Write to log file
    new winston.transports.File({ 
      filename: config.logging.file,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Write errors to separate file
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// Add console transport in development
if (config.nodeEnv !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// Helper function to log transaction events
export const logTransactionEvent = (
  event: string,
  transactionId: string,
  details: Record<string, any> = {}
) => {
  logger.info('Transaction Event', {
    event,
    transaction_id: transactionId,
    timestamp: new Date().toISOString(),
    service_name: config.serviceName,
    details,
  });
};

// Helper function to log account operations
export const logAccountOperation = (
  operation: string,
  accountId: string,
  details: Record<string, any> = {}
) => {
  logger.info('Account Operation', {
    operation,
    account_id: accountId,
    timestamp: new Date().toISOString(),
    service_name: config.serviceName,
    details,
  });
};
