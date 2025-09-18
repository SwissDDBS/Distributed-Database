#!/usr/bin/env node

/**
 * Race Condition Demonstration Script
 * 
 * This script demonstrates the classic race condition problem in distributed systems
 * by making concurrent withdrawal requests to the same account.
 * 
 * Expected behavior:
 * - Account starts with $150
 * - Two concurrent withdrawals of $100 each
 * - Correct result: First succeeds ($50 remaining), second fails (insufficient funds)
 * - Race condition result: Both succeed, leaving negative balance (-$50)
 */

const axios = require('axios');

// Configuration
const ACCOUNTS_SERVICE_URL = process.env.ACCOUNTS_SERVICE_URL || 'http://localhost:3002';
const JWT_SECRET = process.env.JWT_SECRET || 'e681bda1351b31126bdccbfdad0ac6ea887d8276bf9fd86a542e0326c718e24c';

// Test account (Alice's first account from sample data)
const TEST_ACCOUNT_ID = '660e8400-e29b-41d4-a716-446655440001';
const INITIAL_BALANCE = 150.00;
const WITHDRAWAL_AMOUNT = 100.00;

// Generate admin token for testing
const jwt = require('jsonwebtoken');
const ADMIN_TOKEN = jwt.sign(
  { customer_id: 'admin-001', role: 'admin' },
  JWT_SECRET,
  { expiresIn: '1h' }
);

async function setupTestAccount() {
  console.log(' Setting up test account...');
  
  try {
    // Reset account balance to initial amount
    const response = await axios.patch(
      `${ACCOUNTS_SERVICE_URL}/accounts/${TEST_ACCOUNT_ID}/balance`,
      { balance: INITIAL_BALANCE },
      {
        headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
        timeout: 5000,
      }
    );
    
    console.log(` Account ${TEST_ACCOUNT_ID} reset to $${INITIAL_BALANCE}`);
    return true;
  } catch (error) {
    console.error(' Failed to setup test account:', error.response?.data || error.message);
    return false;
  }
}

async function getAccountBalance() {
  try {
    const response = await axios.get(
      `${ACCOUNTS_SERVICE_URL}/accounts/${TEST_ACCOUNT_ID}`,
      {
        headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
        timeout: 5000,
      }
    );
    
    return response.data.data.balance;
  } catch (error) {
    console.error(' Failed to get account balance:', error.response?.data || error.message);
    return null;
  }
}

async function performUnsafeWithdrawal(amount, requestId) {
  const startTime = Date.now();
  
  try {
    const response = await axios.post(
      `${ACCOUNTS_SERVICE_URL}/accounts/${TEST_ACCOUNT_ID}/unsafe-withdraw`,
      { amount },
      {
        headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
        timeout: 10000,
      }
    );
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    return {
      requestId,
      success: true,
      duration,
      newBalance: response.data.data.balance,
      message: response.data.message,
      warning: response.data.warning,
    };
  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    return {
      requestId,
      success: false,
      duration,
      error: error.response?.data?.error || error.message,
    };
  }
}

async function demonstrateRaceCondition() {
  console.log('\n Starting Race Condition Demonstration');
  console.log('=' .repeat(50));
  
  // Step 1: Setup
  const setupSuccess = await setupTestAccount();
  if (!setupSuccess) {
    console.log(' Cannot proceed without proper account setup');
    return;
  }
  
  const initialBalance = await getAccountBalance();
  console.log(` Initial balance: $${initialBalance}`);
  
  // Step 2: Explain the test
  console.log('\n Test Scenario:');
  console.log(`   • Account starts with: $${initialBalance}`);
  console.log(`   • Two concurrent withdrawals of: $${WITHDRAWAL_AMOUNT} each`);
  console.log(`   • Expected correct result: One succeeds ($${initialBalance - WITHDRAWAL_AMOUNT}), one fails`);
  console.log(`   • Race condition result: Both succeed (negative balance)`);
  
  // Step 3: Execute concurrent withdrawals
  console.log('\n Executing concurrent unsafe withdrawals...');
  
  const startTime = Date.now();
  
  // Fire both requests simultaneously
  const [result1, result2] = await Promise.all([
    performUnsafeWithdrawal(WITHDRAWAL_AMOUNT, 'Request-1'),
    performUnsafeWithdrawal(WITHDRAWAL_AMOUNT, 'Request-2'),
  ]);
  
  const totalTime = Date.now() - startTime;
  
  // Step 4: Analyze results
  console.log('\n Results:');
  console.log('-'.repeat(30));
  
  console.log(`${result1.requestId}:`);
  console.log(`   Success: ${result1.success}`);
  console.log(`   Duration: ${result1.duration}ms`);
  if (result1.success) {
    console.log(`   New Balance: $${result1.newBalance}`);
    if (result1.warning) {
      console.log(`     Warning: ${result1.warning}`);
    }
  } else {
    console.log(`   Error: ${result1.error}`);
  }
  
  console.log(`\n${result2.requestId}:`);
  console.log(`   Success: ${result2.success}`);
  console.log(`   Duration: ${result2.duration}ms`);
  if (result2.success) {
    console.log(`   New Balance: $${result2.newBalance}`);
    if (result2.warning) {
      console.log(`     Warning: ${result2.warning}`);
    }
  } else {
    console.log(`   Error: ${result2.error}`);
  }
  
  console.log(`\nTotal execution time: ${totalTime}ms`);
  
  // Step 5: Get final balance and analyze
  const finalBalance = await getAccountBalance();
  console.log(`\n Final balance: $${finalBalance}`);
  
  const totalWithdrawn = (result1.success ? WITHDRAWAL_AMOUNT : 0) + (result2.success ? WITHDRAWAL_AMOUNT : 0);
  const expectedBalance = initialBalance - totalWithdrawn;
  
  console.log('\n Analysis:');
  console.log('-'.repeat(20));
  console.log(`Initial balance: $${initialBalance}`);
  console.log(`Successful withdrawals: ${(result1.success ? 1 : 0) + (result2.success ? 1 : 0)}`);
  console.log(`Total withdrawn: $${totalWithdrawn}`);
  console.log(`Expected balance: $${expectedBalance}`);
  console.log(`Actual balance: $${finalBalance}`);
  
  if (Math.abs(finalBalance - expectedBalance) < 0.01) {
    console.log(' No race condition detected - operations were serialized correctly');
  } else {
    console.log(' RACE CONDITION DETECTED!');
    console.log(`   Balance discrepancy: $${(finalBalance - expectedBalance).toFixed(2)}`);
    console.log('   This demonstrates why atomic operations are crucial in banking systems!');
  }
  
  // Step 6: Demonstrate the correct way
  console.log('\n The correct approach:');
  console.log('   Use the 2PC protocol via the Transactions Service:');
  console.log('   POST /transfers with proper coordination ensures atomicity');
  console.log('   This prevents race conditions and maintains data consistency');
  
  console.log('\n' + '='.repeat(50));
}

async function checkServiceHealth() {
  try {
    const response = await axios.get(`${ACCOUNTS_SERVICE_URL}/health`, { timeout: 5000 });
    return response.data.success;
  } catch (error) {
    return false;
  }
}

// Main execution
async function main() {
  console.log(' Distributed Banking System - Race Condition Demo');
  console.log('  This demonstration shows why proper concurrency control is essential');
  
  // Check if service is available
  console.log('\n Checking service availability...');
  const serviceHealthy = await checkServiceHealth();
  
  if (!serviceHealthy) {
    console.log(' Accounts Service is not available');
    console.log('   Please start the service first: npm run dev:accounts');
    console.log('   Or run the full system: npm start');
    process.exit(1);
  }
  
  console.log(' Accounts Service is available');
  
  await demonstrateRaceCondition();
}

if (require.main === module) {
  main().catch(error => {
    console.error('\n Demo failed:', error.message);
    process.exit(1);
  });
}

module.exports = { demonstrateRaceCondition };
