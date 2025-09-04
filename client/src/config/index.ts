import * as dotenv from 'dotenv';

dotenv.config();

export const config = {
  services: {
    customerServiceUrl: process.env.CUSTOMER_SERVICE_URL || 'http://localhost:3001',
    accountsServiceUrl: process.env.ACCOUNTS_SERVICE_URL || 'http://localhost:3002',
    transactionsServiceUrl: process.env.TRANSACTIONS_SERVICE_URL || 'http://localhost:3003',
  },
  
  auth: {
    jwtSecret: process.env.JWT_SECRET || 'your-super-secret-jwt-key',
    tokenFile: process.env.TOKEN_FILE || '.banking-token',
  },
  
  cli: {
    timeout: parseInt(process.env.CLI_TIMEOUT || '10000'), // 10 seconds
    retries: parseInt(process.env.CLI_RETRIES || '3'),
  },
} as const;
