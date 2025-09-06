#!/usr/bin/env node

/**
 * Database seeding script
 * This script populates the databases with sample data for testing
 */

const { Client } = require('pg');

// Database connections
const databases = [
  {
    name: 'customer_db',
    config: {
      host: 'localhost',
      port: 5432,
      database: 'customer_db',
      user: 'poltergeist',
      password: 'shyama',
    },
  },
  {
    name: 'accounts_db',
    config: {
      host: 'localhost',
      port: 5433,
      database: 'accounts_db',
      user: 'poltergeist',
      password: 'shyama',
    },
  },
  {
    name: 'transactions_db',
    config: {
      host: 'localhost',
      port: 5434,
      database: 'transactions_db',
      user: 'poltergeist',
      password: 'shyama',
    },
  },
];

// Sample data
const sampleCustomers = [
  {
    customer_id: '550e8400-e29b-41d4-a716-446655440001',
    name: 'Alice Johnson',
    address: '123 Main St, Springfield, IL',
    contact_info: JSON.stringify({
      email: 'alice.johnson@example.com',
      phone: '+15551234567'
    }),
  },
  {
    customer_id: '550e8400-e29b-41d4-a716-446655440002',
    name: 'Bob Smith',
    address: '456 Oak Ave, Chicago, IL',
    contact_info: JSON.stringify({
      email: 'bob.smith@example.com',
      phone: '+15559876543'
    }),
  },
  {
    customer_id: '550e8400-e29b-41d4-a716-446655440003',
    name: 'Carol Davis',
    address: '789 Pine Rd, Peoria, IL',
    contact_info: JSON.stringify({
      email: 'carol.davis@example.com',
      phone: '+15555551234'
    }),
  },
];

const sampleAccounts = [
  {
    account_id: '660e8400-e29b-41d4-a716-446655440001',
    customer_id: '550e8400-e29b-41d4-a716-446655440001',
    balance: '1000.0000',
  },
  {
    account_id: '660e8400-e29b-41d4-a716-446655440002',
    customer_id: '550e8400-e29b-41d4-a716-446655440001',
    balance: '500.0000',
  },
  {
    account_id: '660e8400-e29b-41d4-a716-446655440003',
    customer_id: '550e8400-e29b-41d4-a716-446655440002',
    balance: '750.0000',
  },
  {
    account_id: '660e8400-e29b-41d4-a716-446655440004',
    customer_id: '550e8400-e29b-41d4-a716-446655440002',
    balance: '250.0000',
  },
  {
    account_id: '660e8400-e29b-41d4-a716-446655440005',
    customer_id: '550e8400-e29b-41d4-a716-446655440003',
    balance: '1500.0000',
  },
];

async function seedCustomerData() {
  const client = new Client(databases[0].config);
  
  try {
    await client.connect();
    console.log('📦 Seeding customer data...');
    
    // Clear existing data
    await client.query('TRUNCATE TABLE customers CASCADE');
    
    // Insert sample customers
    for (const customer of sampleCustomers) {
      await client.query(
        'INSERT INTO customers (customer_id, name, address, contact_info) VALUES ($1, $2, $3, $4)',
        [customer.customer_id, customer.name, customer.address, customer.contact_info]
      );
    }
    
    console.log(`✅ Inserted ${sampleCustomers.length} customers`);
    
  } catch (error) {
    console.error('❌ Error seeding customer data:', error);
    throw error;
  } finally {
    await client.end();
  }
}

async function seedAccountData() {
  const client = new Client(databases[1].config);
  
  try {
    await client.connect();
    console.log('💰 Seeding account data...');
    
    // Clear existing data
    await client.query('TRUNCATE TABLE accounts CASCADE');
    
    // Insert sample accounts
    for (const account of sampleAccounts) {
      await client.query(
        'INSERT INTO accounts (account_id, customer_id, balance) VALUES ($1, $2, $3)',
        [account.account_id, account.customer_id, account.balance]
      );
    }
    
    console.log(`✅ Inserted ${sampleAccounts.length} accounts`);
    
  } catch (error) {
    console.error('❌ Error seeding account data:', error);
    throw error;
  } finally {
    await client.end();
  }
}

async function seedTransactionData() {
  const client = new Client(databases[2].config);
  
  try {
    await client.connect();
    console.log('💸 Seeding transaction data...');
    
    // Clear existing data
    await client.query('TRUNCATE TABLE transactions CASCADE');
    
    // Insert a few sample completed transactions
    const sampleTransactions = [
      {
        transaction_id: '770e8400-e29b-41d4-a716-446655440001',
        source_account_id: '660e8400-e29b-41d4-a716-446655440001',
        destination_account_id: '660e8400-e29b-41d4-a716-446655440003',
        amount: '50.0000',
        status: 'committed',
      },
      {
        transaction_id: '770e8400-e29b-41d4-a716-446655440002',
        source_account_id: '660e8400-e29b-41d4-a716-446655440003',
        destination_account_id: '660e8400-e29b-41d4-a716-446655440005',
        amount: '25.0000',
        status: 'committed',
      },
    ];
    
    for (const transaction of sampleTransactions) {
      await client.query(
        'INSERT INTO transactions (transaction_id, source_account_id, destination_account_id, amount, status) VALUES ($1, $2, $3, $4, $5)',
        [transaction.transaction_id, transaction.source_account_id, transaction.destination_account_id, transaction.amount, transaction.status]
      );
    }
    
    console.log(`✅ Inserted ${sampleTransactions.length} sample transactions`);
    
  } catch (error) {
    console.error('❌ Error seeding transaction data:', error);
    throw error;
  } finally {
    await client.end();
  }
}

async function seedAllData() {
  console.log('🌱 Starting database seeding...\n');
  
  try {
    await seedCustomerData();
    await seedAccountData();
    await seedTransactionData();
    
    console.log('\n🎉 All data seeded successfully!');
    console.log('\nSample data summary:');
    console.log('- 3 customers with contact information');
    console.log('- 5 accounts with various balances');
    console.log('- 2 sample completed transactions');
    console.log('\nYou can now test the system with the provided sample data.');
    
  } catch (error) {
    console.error('\n❌ Seeding failed:', error.message);
    process.exit(1);
  }
}

// Run seeding if this file is executed directly
if (require.main === module) {
  seedAllData();
}

module.exports = { seedAllData, seedCustomerData, seedAccountData, seedTransactionData };
