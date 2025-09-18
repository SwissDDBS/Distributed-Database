import axios, { AxiosResponse } from 'axios';
import { config } from '../config';
import { logger, logCoordinatorEvent, logTransactionLifecycle, logParticipantResponse } from '../utils/logger';
import { TransactionRepository } from '../models/trasactionRepository';
import jwt from 'jsonwebtoken';

export interface PrepareRequest {
  transaction_id: string;
  account_id: string;
  amount: number;
  operation: 'debit' | 'credit';
}

export interface PrepareResponse {
  success: boolean;
  vote: 'commit' | 'abort';
  message?: string;
  error?: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
}

export interface CommitAbortRequest {
  transaction_id: string;
  account_id: string;
}

export interface TransferRequest {
  source_account_id: string;
  destination_account_id: string;
  amount: number;
}

export interface TransferResult {
  transaction_id: string;
  status: 'committed' | 'aborted';
  message: string;
  retry_attempt?: number;
  total_attempts?: number;
  details?: Record<string, any>;
}

export class TwoPhaseCommitCoordinator {
  private transactionRepo: TransactionRepository;
  private accountsServiceUrl: string;

  constructor() {
    this.transactionRepo = new TransactionRepository();
    this.accountsServiceUrl = config.services.accountsServiceUrl;
  }

  /**
   * Execute a fund transfer with retry mechanism
   */
  async executeTransferWithRetry(
    transferRequest: TransferRequest,
    authToken: string,
    initiatorId: string,
    providedTransactionId?: string
  ): Promise<TransferResult> {
    const maxRetries = config.twoPhaseCommit.maxRetries;
    const retryDelay = config.twoPhaseCommit.retryDelay;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      logger.info(`Transfer attempt ${attempt}/${maxRetries}`, {
        source_account_id: transferRequest.source_account_id,
        destination_account_id: transferRequest.destination_account_id,
        amount: transferRequest.amount,
        provided_transaction_id: providedTransactionId,
        attempt,
        max_retries: maxRetries
      });

      const result = await this.executeTransfer(
        transferRequest,
        authToken,
        initiatorId,
        providedTransactionId
      );

      // Add retry information to the result
      result.retry_attempt = attempt;
      result.total_attempts = maxRetries;

      if (result.status === 'committed') {
        logger.info(`Transfer succeeded on attempt ${attempt}`, {
          transaction_id: result.transaction_id,
          attempt,
          total_attempts: maxRetries
        });
        return result;
      }

      // If this was the last attempt, return the failed result
      if (attempt === maxRetries) {
        logger.error(`Transfer failed after all ${maxRetries} attempts`, {
          transaction_id: result.transaction_id,
          final_attempt: attempt,
          total_attempts: maxRetries
        });
        return result;
      }

      // Wait before retrying (except for the last iteration)
      logger.info(`Transfer attempt ${attempt} failed, retrying in ${retryDelay}ms`, {
        transaction_id: result.transaction_id,
        attempt,
        next_attempt: attempt + 1,
        retry_delay: retryDelay
      });
      
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }

    // This should never be reached, but included for completeness
    throw new Error('Unexpected retry loop exit');
  }

  /**
   * Execute a fund transfer using the Two-Phase Commit protocol
   */
  async executeTransfer(
    transferRequest: TransferRequest,
    authToken: string,
    initiatorId: string,
    providedTransactionId?: string
  ): Promise<TransferResult> {
    const { source_account_id, destination_account_id, amount } = transferRequest;
    const serviceAdminToken = jwt.sign({ customer_id: 'service-coordinator', role: 'admin' }, config.jwt.secret, { expiresIn: '1h' });
    
    // Step 1: Create or use existing transaction record
    let transaction;
    let transactionId: string;
    
    if (providedTransactionId) {
      // Reuse the existing transaction ID for retry
      transactionId = providedTransactionId;
      // Try to get existing transaction or create new one with the same ID
      try {
        transaction = await this.transactionRepo.findById(transactionId);
        if (!transaction) {
          transaction = await this.transactionRepo.createWithId({
            transaction_id: transactionId, // Use provided ID
            source_account_id,
            destination_account_id,
            amount: amount.toString(),
            status: 'pending',
          });
        }
      } catch (error) {
        // If transaction already exists, fetch it
        transaction = await this.transactionRepo.findById(transactionId);
        if (!transaction) {
          throw new Error(`Failed to handle transaction with ID ${transactionId}`);
        }
      }
    } else {
      // Create new transaction record
      transaction = await this.transactionRepo.create({
        source_account_id,
        destination_account_id,
        amount: amount.toString(),
        status: 'pending',
      });
      transactionId = transaction.transaction_id;
    }

    logTransactionLifecycle('INITIATION', transactionId, {
      source_account_id,
      destination_account_id,
      amount,
      initiator: initiatorId,
    });

    try {
      // Step 2: Phase 1 - Prepare
      logTransactionLifecycle('PREPARE', transactionId, {
        phase: 'PREPARE_START',
      });

      const prepareResults = await this.preparePhase(transactionId, transferRequest, serviceAdminToken);
      
      // Check if all participants voted to commit
      const allCommit = prepareResults.every(result => result.vote === 'commit');

      if (!allCommit) {
        // At least one participant voted abort
        logCoordinatorEvent('PREPARE_PHASE_FAILED', transactionId, {
          prepare_results: prepareResults,
          reason: 'One or more participants voted abort',
        });

        // Step 3a: Phase 2 - Abort
        await this.abortPhase(transactionId, transferRequest, serviceAdminToken);
        await this.transactionRepo.updateStatus(transactionId, 'aborted');

        logTransactionLifecycle('ABORT', transactionId, {
          reason: 'Prepare phase failed',
          prepare_results: prepareResults,
        });

        return {
          transaction_id: transactionId,
          status: 'aborted',
          message: 'Transaction aborted: Prepare phase failed',
          details: {
            prepare_results: prepareResults,
          },
        };
      }

      // Step 3b: Phase 2 - Commit
      logTransactionLifecycle('COMMIT', transactionId, {
        phase: 'COMMIT_START',
      });

      const commitResults = await this.commitPhase(transactionId, transferRequest, serviceAdminToken);

      // Check if all commits succeeded
      const allCommitSuccess = commitResults.every(result => result.success);

      if (!allCommitSuccess) {
        // This is a critical error - some participants committed, others didn't
        logger.error('CRITICAL: Inconsistent commit state', {
          transaction_id: transactionId,
          commit_results: commitResults,
          severity: 'CRITICAL',
          requires_manual_intervention: true,
        });

        // Update transaction status to committed anyway (manual intervention needed)
        await this.transactionRepo.updateStatus(transactionId, 'committed');

        return {
          transaction_id: transactionId,
          status: 'committed',
          message: 'Transaction committed with warnings - manual verification required',
          details: {
            commit_results: commitResults,
            warning: 'Some participants may not have committed successfully',
          },
        };
      }

      // Success! Update transaction status
      await this.transactionRepo.updateStatus(transactionId, 'committed');

      logTransactionLifecycle('COMPLETION', transactionId, {
        status: 'SUCCESS',
        final_status: 'committed',
      });

      return {
        transaction_id: transactionId,
        status: 'committed',
        message: 'Transfer completed successfully',
      };

    } catch (error) {
      // Unexpected error during 2PC protocol
      logger.error('2PC Coordinator Error', {
        transaction_id: transactionId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Try to abort the transaction
      try {
        await this.abortPhase(transactionId, transferRequest, serviceAdminToken);
        await this.transactionRepo.updateStatus(transactionId, 'aborted');
      } catch (abortError) {
        logger.error('Failed to abort transaction after error', {
          transaction_id: transactionId,
          original_error: error instanceof Error ? error.message : 'Unknown error',
          abort_error: abortError instanceof Error ? abortError.message : 'Unknown abort error',
          severity: 'CRITICAL',
        });
      }

      return {
        transaction_id: transactionId,
        status: 'aborted',
        message: 'Transaction aborted due to coordinator error',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  /**
   * Phase 1: Prepare - Send prepare requests to all participants
   */
  private async preparePhase(
    transactionId: string,
    transferRequest: TransferRequest,
    authToken: string
  ): Promise<PrepareResponse[]> {
    const { source_account_id, destination_account_id, amount } = transferRequest;

    const prepareRequests: Promise<PrepareResponse>[] = [
      // Prepare debit from source account
      this.sendPrepareRequest({
        transaction_id: transactionId,
        account_id: source_account_id,
        amount: -amount, // Negative for debit
        operation: 'debit',
      }, authToken),
      
      // Prepare credit to destination account
      this.sendPrepareRequest({
        transaction_id: transactionId,
        account_id: destination_account_id,
        amount: amount, // Positive for credit
        operation: 'credit',
      }, authToken),
    ];

    const results = await Promise.allSettled(prepareRequests);
    
    return results.map((result, index) => {
      const accountId = index === 0 ? source_account_id : destination_account_id;
      const operation = index === 0 ? 'debit' : 'credit';

      if (result.status === 'fulfilled') {
        logParticipantResponse('AccountsService', transactionId, 'PREPARE', 'SUCCESS', {
          account_id: accountId,
          operation,
          vote: result.value.vote,
        });
        return result.value;
      } else {
        logParticipantResponse('AccountsService', transactionId, 'PREPARE', 'FAILURE', {
          account_id: accountId,
          operation,
          error: result.reason,
        });
        return {
          success: false,
          vote: 'abort' as const,
          message: 'Prepare request failed',
          error: {
            code: 'PREPARE_REQUEST_FAILED',
            message: result.reason instanceof Error ? result.reason.message : 'Unknown error',
          },
        };
      }
    });
  }

  /**
   * Phase 2: Commit - Send commit requests to all participants
   */
  private async commitPhase(
    transactionId: string,
    transferRequest: TransferRequest,
    serviceAdminToken: string
  ): Promise<Array<{ success: boolean; account_id: string; error?: any }>> {
    const { source_account_id, destination_account_id } = transferRequest;

    const commitRequests = [
      this.sendCommitRequest({
        transaction_id: transactionId,
        account_id: source_account_id,
      }, serviceAdminToken).then(() => ({ success: true, account_id: source_account_id }))
        .catch(error => ({ success: false, account_id: source_account_id, error })),
      
      this.sendCommitRequest({
        transaction_id: transactionId,
        account_id: destination_account_id,
      }, serviceAdminToken).then(() => ({ success: true, account_id: destination_account_id }))
        .catch(error => ({ success: false, account_id: destination_account_id, error })),
    ];

    const results = await Promise.allSettled(commitRequests);
    
    return results.map((result, index) => {
      const accountId = index === 0 ? source_account_id : destination_account_id;
      
      if (result.status === 'fulfilled') {
        logParticipantResponse('AccountsService', transactionId, 'COMMIT', 
          result.value.success ? 'SUCCESS' : 'FAILURE', {
          account_id: accountId,
          error: 'error' in result.value ? result.value.error : undefined,
        });
        return result.value;
      } else {
        logParticipantResponse('AccountsService', transactionId, 'COMMIT', 'FAILURE', {
          account_id: accountId,
          error: result.reason,
        });
        return {
          success: false,
          account_id: accountId,
          error: result.reason,
        };
      }
    });
  }

  /**
   * Phase 2: Abort - Send abort requests to all participants
   */
  private async abortPhase(
    transactionId: string,
    transferRequest: TransferRequest,
    serviceAdminToken: string
  ): Promise<void> {
    const { source_account_id, destination_account_id } = transferRequest;

    const abortRequests = [
      this.sendAbortRequest({
        transaction_id: transactionId,
        account_id: source_account_id,
      }, serviceAdminToken).catch(error => {
        logParticipantResponse('AccountsService', transactionId, 'ABORT', 'FAILURE', {
          account_id: source_account_id,
          error: error.message,
        });
      }),
      
      this.sendAbortRequest({
        transaction_id: transactionId,
        account_id: destination_account_id,
      }, serviceAdminToken).catch(error => {
        logParticipantResponse('AccountsService', transactionId, 'ABORT', 'FAILURE', {
          account_id: destination_account_id,
          error: error.message,
        });
      }),
    ];

    await Promise.allSettled(abortRequests);
  }

  /**
   * Send prepare request to Accounts Service
   */
  private async sendPrepareRequest(
    request: PrepareRequest,
    serviceAdminToken: string
  ): Promise<PrepareResponse> {
    try {
      const response: AxiosResponse = await axios.post(
        `${this.accountsServiceUrl}/2pc/prepare`,
        request,
        {
          headers: {
            'Authorization': `Bearer ${serviceAdminToken}`,
            'Content-Type': 'application/json',
          },
          timeout: config.twoPhaseCommit.prepareTimeout,
        }
      );

      if (response.data.success) {
        return {
          success: true,
          vote: response.data.vote,
          message: response.data.message,
        };
      } else {
        return {
          success: false,
          vote: response.data.vote || 'abort',
          message: response.data.message,
          error: response.data.error,
        };
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return {
          success: false,
          vote: 'abort',
          message: 'Prepare request failed',
          error: {
            code: 'NETWORK_ERROR',
            message: error.message,
            details: error.response?.data,
          },
        };
      }
      throw error;
    }
  }

  /**
   * Send commit request to Accounts Service
   */
  private async sendCommitRequest(
    request: CommitAbortRequest,
    serviceAdminToken: string
  ): Promise<void> {
    const response = await axios.post(
      `${this.accountsServiceUrl}/2pc/commit`,
      request,
      {
        headers: {
          'Authorization': `Bearer ${serviceAdminToken}`,
          'Content-Type': 'application/json',
        },
        timeout: config.twoPhaseCommit.commitTimeout,
      }
    );

    if (!response.data.success) {
      throw new Error(`Commit failed: ${response.data.error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Send abort request to Accounts Service
   */
  private async sendAbortRequest(
    request: CommitAbortRequest,
    serviceAdminToken: string
  ): Promise<void> {
    const response = await axios.post(
      `${this.accountsServiceUrl}/2pc/abort`,
      request,
      {
        headers: {
          'Authorization': `Bearer ${serviceAdminToken}`,
          'Content-Type': 'application/json',
        },
        timeout: config.twoPhaseCommit.commitTimeout,
      }
    );

    if (!response.data.success) {
      throw new Error(`Abort failed: ${response.data.error?.message || 'Unknown error'}`);
    }
  }
}
