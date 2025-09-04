import axios, { AxiosInstance, AxiosResponse } from 'axios';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { config } from '../config';

export interface BankingClientConfig {
  customerServiceUrl: string;
  accountsServiceUrl: string;
  transactionsServiceUrl: string;
}

export interface Customer {
  customer_id: string;
  name: string;
  address: string;
  contact_info: {
    phone: string;
    email: string;
  };
  created_at?: string;
  updated_at?: string;
}

export interface Account {
  account_id: string;
  customer_id: string;
  balance: number;
  transaction_lock?: string | null;
  pending_change?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface Transaction {
  transaction_id: string;
  source_account_id: string;
  destination_account_id: string;
  amount: number;
  status: 'pending' | 'committed' | 'aborted';
  created_at?: string;
  updated_at?: string;
}

export interface TransferResult {
  success: boolean;
  data?: {
    transaction_id: string;
    status: string;
    source_account_id: string;
    destination_account_id: string;
    amount: number;
  };
  message?: string;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  details?: any;
}

export interface HealthStatus {
  success: boolean;
  data: {
    status: string;
    service: string;
    timestamp: string;
    uptime?: number;
    database?: {
      connected: boolean;
    };
  };
}

export class BankingClient {
  private customerService: AxiosInstance;
  private accountsService: AxiosInstance;
  private transactionsService: AxiosInstance;
  private currentToken: string | null = null;
  private currentUser: { customer_id: string; role: string } | null = null;
  private tokenFilePath: string;

  constructor(config: BankingClientConfig) {
    this.tokenFilePath = path.join(process.cwd(), '.banking-token');

    // Create axios instances for each service
    this.customerService = axios.create({
      baseURL: config.customerServiceUrl,
      timeout: 10000,
    });

    this.accountsService = axios.create({
      baseURL: config.accountsServiceUrl,
      timeout: 10000,
    });

    this.transactionsService = axios.create({
      baseURL: config.transactionsServiceUrl,
      timeout: 15000, // Longer timeout for 2PC operations
    });

    // Load saved token if exists
    this.loadToken();

    // Add request interceptors to include auth token
    this.setupAuthInterceptors();
  }

  private setupAuthInterceptors() {
    const addAuthHeader = (config: any) => {
      if (this.currentToken) {
        config.headers = config.headers || {};
        config.headers['Authorization'] = `Bearer ${this.currentToken}`;
      }
      return config;
    };

    this.customerService.interceptors.request.use(addAuthHeader);
    this.accountsService.interceptors.request.use(addAuthHeader);
    this.transactionsService.interceptors.request.use(addAuthHeader);
  }

  /**
   * Login with customer credentials
   */
  async login(customerId: string, role: 'customer' | 'teller' | 'admin' = 'customer'): Promise<void> {
    // Generate JWT token for the user
    const token = jwt.sign(
      { customer_id: customerId, role },
      config.auth.jwtSecret,
      { expiresIn: '24h' }
    );

    this.currentToken = token;
    this.currentUser = { customer_id: customerId, role };

    // Save token to file
    this.saveToken();

    // Verify the token works by making a test request
    try {
      await this.getCustomer(customerId);
    } catch (error) {
      // If customer doesn't exist and we're admin/teller, that's ok
      if (role !== 'customer') {
        return;
      }
      throw new Error('Invalid customer ID or customer does not exist');
    }
  }

  /**
   * Logout current user
   */
  logout(): void {
    this.currentToken = null;
    this.currentUser = null;
    this.deleteToken();
  }

  /**
   * Get current user ID
   */
  getCurrentUserId(): string | null {
    return this.currentUser?.customer_id || null;
  }

  /**
   * Get current user role
   */
  getCurrentUserRole(): string | null {
    return this.currentUser?.role || null;
  }

  /**
   * Check if user is logged in
   */
  isLoggedIn(): boolean {
    return !!this.currentToken;
  }

  /**
   * Get customer profile
   */
  async getCustomer(customerId: string): Promise<Customer> {
    const response = await this.customerService.get(`/customers/${customerId}`);
    return response.data.data;
  }

  /**
   * Create new customer
   */
  async createCustomer(customerData: {
    name: string;
    address: string;
    contact_info: { phone: string; email: string };
  }): Promise<Customer> {
    const response = await this.customerService.post('/customers', customerData);
    return response.data.data;
  }

  /**
   * Update customer profile
   */
  async updateCustomer(customerId: string, updates: Partial<{
    name: string;
    address: string;
    contact_info: { phone: string; email: string };
  }>): Promise<Customer> {
    const response = await this.customerService.patch(`/customers/${customerId}`, updates);
    return response.data.data;
  }

  /**
   * Get account details
   */
  async getAccount(accountId: string): Promise<Account> {
    const response = await this.accountsService.get(`/accounts/${accountId}`);
    return response.data.data;
  }

  /**
   * Get all accounts for a customer
   */
  async getCustomerAccounts(customerId: string): Promise<Account[]> {
    const response = await this.accountsService.get(`/accounts/customer/${customerId}`);
    return response.data.data;
  }

  /**
   * Create new account
   */
  async createAccount(customerId: string, initialBalance: number = 0): Promise<Account> {
    const response = await this.accountsService.post('/accounts', {
      customer_id: customerId,
      initial_balance: initialBalance,
    });
    return response.data.data;
  }

  /**
   * Transfer money between accounts using 2PC protocol
   */
  async transfer(sourceAccountId: string, destinationAccountId: string, amount: number): Promise<TransferResult> {
    try {
      const response = await this.transactionsService.post('/transfers', {
        source_account_id: sourceAccountId,
        destination_account_id: destinationAccountId,
        amount,
      });

      return {
        success: response.data.success,
        data: response.data.data,
        message: response.data.message,
      };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        return {
          success: false,
          error: error.response.data.error,
          details: error.response.data.details,
        };
      }
      
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  /**
   * Get transaction details
   */
  async getTransaction(transactionId: string): Promise<Transaction> {
    const response = await this.transactionsService.get(`/transactions/${transactionId}`);
    return response.data.data;
  }

  /**
   * Get transfer status
   */
  async getTransferStatus(transactionId: string): Promise<Transaction> {
    const response = await this.transactionsService.get(`/transfers/status/${transactionId}`);
    return response.data.data;
  }

  /**
   * Get transaction history for an account
   */
  async getAccountTransactions(accountId: string, limit: number = 50): Promise<Transaction[]> {
    const response = await this.transactionsService.get(`/transfers/history/${accountId}?limit=${limit}`);
    return response.data.data.transactions;
  }

  /**
   * Perform unsafe withdrawal (for demonstration purposes)
   */
  async unsafeWithdraw(accountId: string, amount: number): Promise<Account> {
    const response = await this.accountsService.post(`/accounts/${accountId}/unsafe-withdraw`, { amount });
    return response.data.data;
  }

  /**
   * Check service health
   */
  async checkHealth(serviceUrl: string): Promise<HealthStatus> {
    const response = await axios.get(`${serviceUrl}/health`, { timeout: 5000 });
    return response.data;
  }

  /**
   * Get all services health
   */
  async getAllServicesHealth(): Promise<{
    customer: HealthStatus;
    accounts: HealthStatus;
    transactions: HealthStatus;
  }> {
    const [customer, accounts, transactions] = await Promise.all([
      this.checkHealth(this.customerService.defaults.baseURL!),
      this.checkHealth(this.accountsService.defaults.baseURL!),
      this.checkHealth(this.transactionsService.defaults.baseURL!),
    ]);

    return { customer, accounts, transactions };
  }

  /**
   * Save token to file
   */
  private saveToken(): void {
    if (this.currentToken && this.currentUser) {
      const tokenData = {
        token: this.currentToken,
        user: this.currentUser,
        expires: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
      };
      
      try {
        fs.writeFileSync(this.tokenFilePath, JSON.stringify(tokenData, null, 2));
      } catch (error) {
        // Ignore file save errors
      }
    }
  }

  /**
   * Load token from file
   */
  private loadToken(): void {
    try {
      if (fs.existsSync(this.tokenFilePath)) {
        const tokenData = JSON.parse(fs.readFileSync(this.tokenFilePath, 'utf8'));
        
        // Check if token is expired
        if (tokenData.expires > Date.now()) {
          this.currentToken = tokenData.token;
          this.currentUser = tokenData.user;
        } else {
          // Token expired, delete file
          this.deleteToken();
        }
      }
    } catch (error) {
      // Ignore file read errors
      this.deleteToken();
    }
  }

  /**
   * Delete token file
   */
  private deleteToken(): void {
    try {
      if (fs.existsSync(this.tokenFilePath)) {
        fs.unlinkSync(this.tokenFilePath);
      }
    } catch (error) {
      // Ignore file delete errors
    }
  }
}
