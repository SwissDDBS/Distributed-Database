import * as dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Service configuration
  serviceName: process.env.SERVICE_NAME || 'CustomerService',
  port: parseInt(process.env.SERVICE_PORT || '3000'),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Database configuration
  database: {
    url: process.env.DATABASE_URL || 'postgresql://banking_user:banking_pass@localhost:5432/customer_db',
  },
  
  // JWT configuration
  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },
  
  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || 'logs/customer.log',
  },
  
  // CORS configuration
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
  },
} as const;
