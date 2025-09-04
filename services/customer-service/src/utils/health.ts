import { db, client } from './db';
import { config } from '../config';

export interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  service: string;
  timestamp: string;
  database: {
    connected: boolean;
    error?: string;
  };
  uptime: number;
}

export class HealthChecker {
  private startTime = Date.now();

  async checkHealth(): Promise<HealthStatus> {
    const timestamp = new Date().toISOString();
    const uptime = Date.now() - this.startTime;

    // Check database connection
    const databaseStatus = await this.checkDatabase();

    const overallStatus: HealthStatus = {
      status: databaseStatus.connected ? 'healthy' : 'unhealthy',
      service: config.serviceName,
      timestamp,
      database: databaseStatus,
      uptime,
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
}
