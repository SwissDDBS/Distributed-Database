import { db, client } from './db';
import { config } from '../config';
import axios from 'axios';

export interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  service: string;
  timestamp: string;
  database: {
    connected: boolean;
    error?: string;
  };
  externalServices: {
    accountsService: boolean;
    customerService: boolean;
  };
  uptime: number;
  twoPhaseCommit: {
    enabled: boolean;
    timeoutMs: number;
    coordinator: boolean;
  };
}

export class HealthChecker {
  private startTime = Date.now();

  async checkHealth(): Promise<HealthStatus> {
    const timestamp = new Date().toISOString();
    const uptime = Date.now() - this.startTime;

    // Check database connection
    const databaseStatus = await this.checkDatabase();
    
    // Check external services
    const externalServices = await this.checkExternalServices();

    const overallStatus: HealthStatus = {
      status: databaseStatus.connected && 
               externalServices.accountsService && 
               externalServices.customerService ? 'healthy' : 'unhealthy',
      service: config.serviceName,
      timestamp,
      database: databaseStatus,
      externalServices,
      uptime,
      twoPhaseCommit: {
        enabled: true,
        timeoutMs: config.twoPhaseCommit.transactionTimeout,
        coordinator: true, // This service acts as the 2PC coordinator
      },
    };

    return overallStatus;
  }

  private async checkDatabase(): Promise<{ connected: boolean; error?: string }> {
    try {
      // Simple query to test database connection
      await client`SELECT 1 as test`;
      return { connected: true };
    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown database error',
      };
    }
  }

  private async checkExternalServices(): Promise<{ accountsService: boolean; customerService: boolean }> {
    const results = {
      accountsService: false,
      customerService: false,
    };

    // Check Accounts Service
    try {
      const response = await axios.get(`${config.services.accountsServiceUrl}/health`, {
        timeout: 3000,
      });
      results.accountsService = response.status === 200;
    } catch (error) {
      results.accountsService = false;
    }

    // Check Customer Service
    try {
      const response = await axios.get(`${config.services.customerServiceUrl}/health`, {
        timeout: 3000,
      });
      results.customerService = response.status === 200;
    } catch (error) {
      results.customerService = false;
    }

    return results;
  }
}
