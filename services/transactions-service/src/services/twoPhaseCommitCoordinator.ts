import axios, { AxiosResponse } from 'axios';
import { config } from '../config';
import { logger, logCoordinatorEvent, logTransactionLifecycle, logParticipantResponse } from '../utils/logger';
import { TransactionRepository } from '../models/trasactionRepository';

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
   * Execute a fund transfer using the Two-Phase Commit protocol
   */
  async executeTransfer(
    transferRequest: TransferRequest,
    authToken: string,
    initiatorId: string
  ): Promise<TransferResult> {
    const { source_account_id, destination_account_id, amount } = transferRequest;

    // Step 1: Create transaction record
    const transaction = await this.transactionRepo.create({
      source_account_id,
      destination_account_id,
      amount: amount.toString(),
      status: 'pending',
    });

    const transactionId = transaction.transaction_id;

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

      const prepareResults = await this.preparePhase(transactionId, transferRequest, authToken);
      
      // Check if all participants voted to commit
      const allCommit = prepareResults.every(result => result.vote === 'commit');

      if (!allCommit) {
        // At least one participant voted abort
        logCoordinatorEvent('PREPARE_PHASE_FAILED', transactionId, {
          prepare_results: prepareResults,
          reason: 'One or more participants voted abort',
        });

        // Step 3a: Phase 2 - Abort
        await this.abortPhase(transactionId, transferRequest, authToken);
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

      const commitResults = await this.commitPhase(transactionId, transferRequest, authToken);
      
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
        await this.abortPhase(transactionId, transferRequest, authToken);
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
    authToken: string
  ): Promise<Array<{ success: boolean; account_id: string; error?: any }>> {
    const { source_account_id, destination_account_id } = transferRequest;

    const commitRequests = [
      this.sendCommitRequest({
        transaction_id: transactionId,
        account_id: source_account_id,
      }, authToken).then(() => ({ success: true, account_id: source_account_id }))
        .catch(error => ({ success: false, account_id: source_account_id, error })),
      
      this.sendCommitRequest({
        transaction_id: transactionId,
        account_id: destination_account_id,
      }, authToken).then(() => ({ success: true, account_id: destination_account_id }))
        .catch(error => ({ success: false, account_id: destination_account_id, error })),
    ];

    const results = await Promise.allSettled(commitRequests);
    
    return results.map((result, index) => {
      const accountId = index === 0 ? source_account_id : destination_account_id;
      
      if (result.status === 'fulfilled') {
        logParticipantResponse('AccountsService', transactionId, 'COMMIT', 
          result.value.success ? 'SUCCESS' : 'FAILURE', {
          account_id: accountId,
          error: result.value.error,
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
    authToken: string
  ): Promise<void> {
    const { source_account_id, destination_account_id } = transferRequest;

    const abortRequests = [
      this.sendAbortRequest({
        transaction_id: transactionId,
        account_id: source_account_id,
      }, authToken).catch(error => {
        logParticipantResponse('AccountsService', transactionId, 'ABORT', 'FAILURE', {
          account_id: source_account_id,
          error: error.message,
        });
      }),
      
      this.sendAbortRequest({
        transaction_id: transactionId,
        account_id: destination_account_id,
      }, authToken).catch(error => {
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
    authToken: string
  ): Promise<PrepareResponse> {
    try {
      const response: AxiosResponse = await axios.post(
        `${this.accountsServiceUrl}/2pc/prepare`,
        request,
        {
          headers: {
            'Authorization': `Bearer ${authToken}`,
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
    authToken: string
  ): Promise<void> {
    const response = await axios.post(
      `${this.accountsServiceUrl}/2pc/commit`,
      request,
      {
        headers: {
          'Authorization': `Bearer ${authToken}`,
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
    authToken: string
  ): Promise<void> {
    const response = await axios.post(
      `${this.accountsServiceUrl}/2pc/abort`,
      request,
      {
        headers: {
          'Authorization': `Bearer ${authToken}`,
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
