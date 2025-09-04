#!/usr/bin/env node

/**
 * Database setup script
 * This script helps set up the PostgreSQL databases for all services
 */

const { execSync } = require('child_process');
const path = require('path');

const services = [
  {
    name: 'customer-service',
    dbName: 'customer_db',
    port: 5432,
  },
  {
    name: 'accounts-service', 
    dbName: 'accounts_db',
    port: 5433,
  },
  {
    name: 'transactions-service',
    dbName: 'transactions_db', 
    port: 5434,
  },
];

async function setupDatabases() {
  console.log('🚀 Setting up databases for distributed banking system...\n');

  for (const service of services) {
    console.log(`📦 Setting up ${service.name}...`);
    
    try {
      // Navigate to service directory
      const servicePath = path.join(__dirname, '..', 'services', service.name);
      process.chdir(servicePath);
      
      console.log(`  📁 Working in: ${servicePath}`);
      
      // Generate migrations
      console.log('  🔄 Generating migrations...');
      execSync('npm run db:generate', { stdio: 'inherit' });
      
      // Run migrations
      console.log('  🏃 Running migrations...');
      execSync('npm run db:migrate', { stdio: 'inherit' });
      
      console.log(`  ✅ ${service.name} database setup complete!\n`);
      
    } catch (error) {
      console.error(`  ❌ Error setting up ${service.name}:`, error.message);
      process.exit(1);
    }
  }
  
  console.log('🎉 All databases setup successfully!');
  console.log('\nNext steps:');
  console.log('1. Start the services: npm start');
  console.log('2. Test the APIs: npm run test:2pc');
}

// Run the setup if this file is executed directly
if (require.main === module) {
  setupDatabases().catch(console.error);
}

module.exports = { setupDatabases };
