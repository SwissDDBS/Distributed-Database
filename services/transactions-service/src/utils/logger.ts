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
    service: config.serviceName,
    coordinator: true, // This service acts as the 2PC coordinator
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

// Helper function to log 2PC coordinator events
export const logCoordinatorEvent = (
  event: string,
  transactionId: string,
  details: Record<string, any> = {}
) => {
  logger.info('2PC Coordinator Event', {
    event,
    transaction_id: transactionId,
    timestamp: new Date().toISOString(),
    service_name: config.serviceName,
    coordinator_role: '2PC_COORDINATOR',
    details,
  });
};

// Helper function to log transaction lifecycle events
export const logTransactionLifecycle = (
  phase: 'INITIATION' | 'PREPARE' | 'COMMIT' | 'ABORT' | 'COMPLETION',
  transactionId: string,
  details: Record<string, any> = {}
) => {
  logger.info('Transaction Lifecycle', {
    phase,
    transaction_id: transactionId,
    timestamp: new Date().toISOString(),
    service_name: config.serviceName,
    details,
  });
};

// Helper function to log participant responses
export const logParticipantResponse = (
  participantService: string,
  transactionId: string,
  operation: 'PREPARE' | 'COMMIT' | 'ABORT',
  response: 'SUCCESS' | 'FAILURE',
  details: Record<string, any> = {}
) => {
  logger.info('Participant Response', {
    participant_service: participantService,
    transaction_id: transactionId,
    operation,
    response,
    timestamp: new Date().toISOString(),
    service_name: config.serviceName,
    details,
  });
};
