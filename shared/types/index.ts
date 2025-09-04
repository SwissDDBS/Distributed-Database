// Shared types and interfaces for the distributed banking system

export interface Customer {
  customer_id: string;
  name: string;
  address: string;
  contact_info: {
    phone: string;
    email: string;
  };
  created_at?: Date;
  updated_at?: Date;
}

export interface Account {
  account_id: string;
  customer_id: string;
  balance: number;
  transaction_lock?: string | null;
  pending_change?: number | null;
  created_at?: Date;
  updated_at?: Date;
}

export type TransactionStatus = 'pending' | 'committed' | 'aborted';

export interface Transaction {
  transaction_id: string;
  source_account_id: string;
  destination_account_id: string;
  amount: number;
  status: TransactionStatus;
  created_at?: Date;
  updated_at?: Date;
}

// JWT Payload interface
export interface JWTPayload {
  customer_id: string;
  role: 'customer' | 'teller' | 'admin';
  iat?: number;
  exp?: number;
}

// API Request/Response interfaces
export interface TransferRequest {
  source_account_id: string;
  destination_account_id: string;
  amount: number;
}

export interface TransferResponse {
  transaction_id: string;
  status: TransactionStatus;
  message: string;
}

export interface CreateCustomerRequest {
  name: string;
  address: string;
  contact_info: {
    phone: string;
    email: string;
  };
}

export interface AccountBalanceUpdateRequest {
  amount: number;
  transaction_id: string;
}

// Two-Phase Commit Protocol interfaces
export interface PrepareRequest {
  transaction_id: string;
  account_id: string;
  amount: number; // Positive for credit, negative for debit
  operation: 'debit' | 'credit';
}

export interface PrepareResponse {
  vote: 'commit' | 'abort';
  message?: string;
}

export interface CommitRequest {
  transaction_id: string;
  account_id: string;
}

export interface AbortRequest {
  transaction_id: string;
  account_id: string;
}

// Logging interfaces
export interface LogEntry {
  timestamp: Date;
  transaction_id?: string;
  service_name: string;
  event: LogEvent;
  details: Record<string, any>;
  level: 'info' | 'warn' | 'error' | 'debug';
}

export type LogEvent = 
  | 'TRANSACTION_INITIATED'
  | 'PREPARE_SENT'
  | 'VOTE_COMMIT_RECEIVED'
  | 'VOTE_ABORT_RECEIVED'
  | 'COMMIT_SENT'
  | 'ABORT_SENT'
  | 'TRANSACTION_COMMITTED'
  | 'TRANSACTION_ABORTED'
  | 'ACCOUNT_LOCKED'
  | 'ACCOUNT_UNLOCKED'
  | 'BALANCE_UPDATED'
  | 'CUSTOMER_CREATED'
  | 'CUSTOMER_RETRIEVED'
  | 'AUTHENTICATION_SUCCESS'
  | 'AUTHENTICATION_FAILED'
  | 'AUTHORIZATION_FAILED';

// Error interfaces
export interface APIError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export interface ServiceError extends Error {
  statusCode: number;
  code: string;
  details?: Record<string, any>;
}

// Configuration interfaces
export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
}

export interface ServiceConfig {
  name: string;
  port: number;
  database: DatabaseConfig;
  jwt_secret: string;
  log_level: 'debug' | 'info' | 'warn' | 'error';
}

// HTTP Response interfaces
export interface SuccessResponse<T = any> {
  success: true;
  data: T;
  message?: string;
}

export interface ErrorResponse {
  success: false;
  error: APIError;
}

export type APIResponse<T = any> = SuccessResponse<T> | ErrorResponse;
