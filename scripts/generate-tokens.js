#!/usr/bin/env node

/**
 * Token generation script
 * This script generates JWT tokens for testing the banking system
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';

// Sample customer data
const sampleUsers = [
  {
    customer_id: '550e8400-e29b-41d4-a716-446655440001',
    name: 'Alice Johnson',
    role: 'customer',
  },
  {
    customer_id: '550e8400-e29b-41d4-a716-446655440002',
    name: 'Bob Smith',
    role: 'customer',
  },
  {
    customer_id: '550e8400-e29b-41d4-a716-446655440003',
    name: 'Carol Davis',
    role: 'customer',
  },
  {
    customer_id: 'teller-001',
    name: 'Bank Teller',
    role: 'teller',
  },
  {
    customer_id: 'admin-001',
    name: 'System Admin',
    role: 'admin',
  },
];

function generateToken(payload, expiresIn = '24h') {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

function generateAllTokens() {
  console.log('\n JWT Tokens for Distributed Banking System');
  console.log('='.repeat(60));
  console.log(` JWT Secret: ${JWT_SECRET}`);
  console.log(` Expires: 24 hours\n`);

  const tokens = {};

  sampleUsers.forEach(user => {
    const token = generateToken({
      customer_id: user.customer_id,
      role: user.role,
    });
    
    tokens[user.name.toLowerCase().replace(' ', '_')] = token;
    
    console.log(` ${user.name} (${user.role.toUpperCase()})`);
    console.log(`   Customer ID: ${user.customer_id}`);
    console.log(`   Token: ${token}`);
    console.log('');
  });

  console.log(' Quick Test Commands:');
  console.log('-'.repeat(40));
  
  console.log('\n Health Checks:');
  console.log('curl http://localhost:3001/health  # Customer Service');
  console.log('curl http://localhost:3002/health  # Accounts Service');
  console.log('curl http://localhost:3003/health  # Transactions Service');
  
  console.log('\n Get Customer Info (Alice):');
  console.log(`curl -H "Authorization: Bearer ${tokens.alice_johnson}" http://localhost:3001/customers/550e8400-e29b-41d4-a716-446655440001`);
  
  console.log('\n Get Account Info (Alice\'s first account):');
  console.log(`curl -H "Authorization: Bearer ${tokens.alice_johnson}" http://localhost:3002/accounts/660e8400-e29b-41d4-a716-446655440001`);
  
  console.log('\n Transfer Money (Alice to Bob):');
  console.log(`curl -X POST -H "Content-Type: application/json" -H "Authorization: Bearer ${tokens.alice_johnson}" \\`);
  console.log('     -d \'{"source_account_id":"660e8400-e29b-41d4-a716-446655440001","destination_account_id":"660e8400-e29b-41d4-a716-446655440003","amount":50}\' \\');
  console.log('     http://localhost:3003/transfers');
  
  console.log('\n Check Transaction Status:');
  console.log(`curl -H "Authorization: Bearer ${tokens.alice_johnson}" http://localhost:3003/transfers/status/<transaction_id>`);
  
  console.log('\n  Test Race Condition (UNSAFE - Admin only):');
  console.log(`curl -X POST -H "Content-Type: application/json" -H "Authorization: Bearer ${tokens.system_admin}" \\`);
  console.log('     -d \'{"amount":-100}\' \\');
  console.log('     http://localhost:3002/accounts/660e8400-e29b-41d4-a716-446655440001/unsafe-withdraw');
  
  console.log('\n' + '='.repeat(60));
  console.log(' Tip: Save these tokens in environment variables for easier testing!');
  console.log(' Use the admin token for administrative operations');
  console.log(' Use customer tokens for regular banking operations');
  console.log('='.repeat(60) + '\n');

  return tokens;
}

function saveTokensToFile(tokens) {
  const fs = require('fs');
  const path = require('path');
  
  const tokenFile = path.join(__dirname, '..', 'test-tokens.json');
  
  fs.writeFileSync(tokenFile, JSON.stringify(tokens, null, 2));
  console.log(` Tokens saved to: ${tokenFile}`);
}

// Main execution
if (require.main === module) {
  try {
    const tokens = generateAllTokens();
    saveTokensToFile(tokens);
  } catch (error) {
    console.error(' Error generating tokens:', error.message);
    process.exit(1);
  }
}

module.exports = { generateToken, generateAllTokens };
