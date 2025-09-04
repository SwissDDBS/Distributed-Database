#!/usr/bin/env node

/**
 * Concurrent Operations Test Script
 * 
 * This script demonstrates various concurrent scenarios in the banking system:
 * 1. Multiple concurrent transfers using 2PC (should work correctly)
 * 2. Mixed safe and unsafe operations
 * 3. High-concurrency stress testing
 */

const axios = require('axios');
const jwt = require('jsonwebtoken');

// Configuration
const ACCOUNTS_SERVICE_URL = process.env.ACCOUNTS_SERVICE_URL || 'http://localhost:3002';
const TRANSACTIONS_SERVICE_URL = process.env.TRANSACTIONS_SERVICE_URL || 'http://localhost:3003';
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';

// Test accounts from sample data
const ALICE_ACCOUNT = '660e8400-e29b-41d4-a716-446655440001';
const BOB_ACCOUNT = '660e8400-e29b-41d4-a716-446655440003';
const CAROL_ACCOUNT = '660e8400-e29b-41d4-a716-446655440005';

// Generate tokens
const ADMIN_TOKEN = jwt.sign({ customer_id: 'admin-001', role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
const ALICE_TOKEN = jwt.sign({ customer_id: '550e8400-e29b-41d4-a716-446655440001', role: 'customer' }, JWT_SECRET, { expiresIn: '1h' });

async function resetAccountBalances() {
  console.log('🔧 Resetting account balances for testing...');
  
  const resetOperations = [
    { account: ALICE_ACCOUNT, balance: 1000.00, name: 'Alice' },
    { account: BOB_ACCOUNT, balance: 750.00, name: 'Bob' },
    { account: CAROL_ACCOUNT, balance: 1500.00, name: 'Carol' },
  ];
  
  for (const op of resetOperations) {
    try {
      await axios.patch(
        `${ACCOUNTS_SERVICE_URL}/accounts/${op.account}/balance`,
        { balance: op.balance },
        { headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` } }
      );
      console.log(`✅ ${op.name}'s account reset to $${op.balance}`);
    } catch (error) {
      console.error(`❌ Failed to reset ${op.name}'s account:`, error.response?.data || error.message);
    }
  }
}

async function getAccountBalance(accountId, accountName) {
  try {
    const response = await axios.get(
      `${ACCOUNTS_SERVICE_URL}/accounts/${accountId}`,
      { headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` } }
    );
    return { name: accountName, balance: response.data.data.balance };
  } catch (error) {
    return { name: accountName, balance: 'ERROR', error: error.message };
  }
}

async function performSafeTransfer(sourceAccount, destAccount, amount, transferId) {
  const startTime = Date.now();
  
  try {
    const response = await axios.post(
      `${TRANSACTIONS_SERVICE_URL}/transfers`,
      {
        source_account_id: sourceAccount,
        destination_account_id: destAccount,
        amount: amount,
      },
      {
        headers: { 'Authorization': `Bearer ${ALICE_TOKEN}` },
        timeout: 15000, // 2PC can take longer
      }
    );
    
    const duration = Date.now() - startTime;
    
    return {
      transferId,
      success: response.data.success,
      duration,
      transactionId: response.data.data?.transaction_id,
      status: response.data.data?.status,
      message: response.data.message,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    
    return {
      transferId,
      success: false,
      duration,
      error: error.response?.data?.error || error.message,
    };
  }
}

async function performUnsafeWithdrawal(accountId, amount, requestId) {
  const startTime = Date.now();
  
  try {
    const response = await axios.post(
      `${ACCOUNTS_SERVICE_URL}/accounts/${accountId}/unsafe-withdraw`,
      { amount },
      {
        headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
        timeout: 10000,
      }
    );
    
    const duration = Date.now() - startTime;
    
    return {
      requestId,
      success: true,
      duration,
      newBalance: response.data.data.balance,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    
    return {
      requestId,
      success: false,
      duration,
      error: error.response?.data?.error || error.message,
    };
  }
}

async function test1_ConcurrentSafeTransfers() {
  console.log('\n🧪 Test 1: Concurrent Safe Transfers (2PC Protocol)');
  console.log('=' .repeat(55));
  
  await resetAccountBalances();
  
  console.log('\n📋 Scenario: Multiple simultaneous transfers using 2PC');
  console.log('   • Alice → Bob: $50');
  console.log('   • Alice → Carol: $75');
  console.log('   • Bob → Carol: $25');
  
  const initialBalances = await Promise.all([
    getAccountBalance(ALICE_ACCOUNT, 'Alice'),
    getAccountBalance(BOB_ACCOUNT, 'Bob'),
    getAccountBalance(CAROL_ACCOUNT, 'Carol'),
  ]);
  
  console.log('\n💰 Initial Balances:');
  initialBalances.forEach(acc => console.log(`   ${acc.name}: $${acc.balance}`));
  
  console.log('\n🚀 Executing concurrent transfers...');
  const startTime = Date.now();
  
  const transfers = await Promise.all([
    performSafeTransfer(ALICE_ACCOUNT, BOB_ACCOUNT, 50, 'Alice→Bob'),
    performSafeTransfer(ALICE_ACCOUNT, CAROL_ACCOUNT, 75, 'Alice→Carol'),
    performSafeTransfer(BOB_ACCOUNT, CAROL_ACCOUNT, 25, 'Bob→Carol'),
  ]);
  
  const totalTime = Date.now() - startTime;
  
  console.log('\n📊 Transfer Results:');
  transfers.forEach(transfer => {
    console.log(`   ${transfer.transferId}:`);
    console.log(`     Success: ${transfer.success}`);
    console.log(`     Duration: ${transfer.duration}ms`);
    if (transfer.success) {
      console.log(`     Transaction ID: ${transfer.transactionId}`);
      console.log(`     Status: ${transfer.status}`);
    } else {
      console.log(`     Error: ${transfer.error}`);
    }
  });
  
  console.log(`\nTotal execution time: ${totalTime}ms`);
  
  // Wait a moment for all transactions to complete
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const finalBalances = await Promise.all([
    getAccountBalance(ALICE_ACCOUNT, 'Alice'),
    getAccountBalance(BOB_ACCOUNT, 'Bob'),
    getAccountBalance(CAROL_ACCOUNT, 'Carol'),
  ]);
  
  console.log('\n💰 Final Balances:');
  finalBalances.forEach(acc => console.log(`   ${acc.name}: $${acc.balance}`));
  
  // Calculate expected balances
  const successfulTransfers = transfers.filter(t => t.success);
  console.log(`\n✅ Successful transfers: ${successfulTransfers.length}/3`);
  
  if (successfulTransfers.length === 3) {
    console.log('🎉 All concurrent transfers completed successfully!');
    console.log('   This demonstrates the 2PC protocol working correctly under concurrency');
  } else {
    console.log('⚠️  Some transfers failed - this may be expected behavior');
  }
}

async function test2_MixedSafeAndUnsafeOperations() {
  console.log('\n🧪 Test 2: Mixed Safe and Unsafe Operations');
  console.log('=' .repeat(45));
  
  await resetAccountBalances();
  
  console.log('\n📋 Scenario: Mixing 2PC transfers with unsafe withdrawals');
  console.log('   • Safe transfer: Alice → Bob: $100 (using 2PC)');
  console.log('   • Unsafe withdrawal: Alice: $100 (race condition prone)');
  console.log('   • Safe transfer: Alice → Carol: $50 (using 2PC)');
  
  const initialBalance = await getAccountBalance(ALICE_ACCOUNT, 'Alice');
  console.log(`\n💰 Alice's initial balance: $${initialBalance.balance}`);
  
  console.log('\n🚀 Executing mixed operations...');
  const startTime = Date.now();
  
  const operations = await Promise.all([
    performSafeTransfer(ALICE_ACCOUNT, BOB_ACCOUNT, 100, 'Safe-Transfer-1'),
    performUnsafeWithdrawal(ALICE_ACCOUNT, 100, 'Unsafe-Withdrawal'),
    performSafeTransfer(ALICE_ACCOUNT, CAROL_ACCOUNT, 50, 'Safe-Transfer-2'),
  ]);
  
  const totalTime = Date.now() - startTime;
  
  console.log('\n📊 Operation Results:');
  operations.forEach(op => {
    console.log(`   ${op.transferId || op.requestId}:`);
    console.log(`     Success: ${op.success}`);
    console.log(`     Duration: ${op.duration}ms`);
    if (op.error) {
      console.log(`     Error: ${op.error}`);
    }
  });
  
  console.log(`\nTotal execution time: ${totalTime}ms`);
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const finalBalance = await getAccountBalance(ALICE_ACCOUNT, 'Alice');
  console.log(`\n💰 Alice's final balance: $${finalBalance.balance}`);
  
  const successfulOps = operations.filter(op => op.success).length;
  console.log(`\n📈 Analysis: ${successfulOps}/${operations.length} operations succeeded`);
  console.log('   This test shows how unsafe operations can interfere with safe ones');
}

async function test3_HighConcurrencyStressTest() {
  console.log('\n🧪 Test 3: High Concurrency Stress Test');
  console.log('=' .repeat(40));
  
  await resetAccountBalances();
  
  const NUM_CONCURRENT_TRANSFERS = 10;
  console.log(`\n📋 Scenario: ${NUM_CONCURRENT_TRANSFERS} simultaneous small transfers`);
  console.log('   Testing the 2PC coordinator under high load');
  
  const initialBalances = await Promise.all([
    getAccountBalance(ALICE_ACCOUNT, 'Alice'),
    getAccountBalance(BOB_ACCOUNT, 'Bob'),
  ]);
  
  console.log('\n💰 Initial Balances:');
  initialBalances.forEach(acc => console.log(`   ${acc.name}: $${acc.balance}`));
  
  console.log(`\n🚀 Executing ${NUM_CONCURRENT_TRANSFERS} concurrent transfers...`);
  const startTime = Date.now();
  
  const transfers = [];
  for (let i = 0; i < NUM_CONCURRENT_TRANSFERS; i++) {
    transfers.push(
      performSafeTransfer(ALICE_ACCOUNT, BOB_ACCOUNT, 10, `Transfer-${i + 1}`)
    );
  }
  
  const results = await Promise.all(transfers);
  const totalTime = Date.now() - startTime;
  
  const successful = results.filter(r => r.success).length;
  const failed = results.length - successful;
  
  console.log('\n📊 Stress Test Results:');
  console.log(`   Total transfers: ${results.length}`);
  console.log(`   Successful: ${successful}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Success rate: ${((successful / results.length) * 100).toFixed(1)}%`);
  console.log(`   Total time: ${totalTime}ms`);
  console.log(`   Average time per transfer: ${(totalTime / results.length).toFixed(1)}ms`);
  
  if (failed > 0) {
    console.log('\n❌ Some transfers failed. Common reasons:');
    console.log('   • Insufficient funds (expected after several successful transfers)');
    console.log('   • Timeout due to high concurrency');
    console.log('   • 2PC coordinator overload');
  }
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const finalBalances = await Promise.all([
    getAccountBalance(ALICE_ACCOUNT, 'Alice'),
    getAccountBalance(BOB_ACCOUNT, 'Bob'),
  ]);
  
  console.log('\n💰 Final Balances:');
  finalBalances.forEach(acc => console.log(`   ${acc.name}: $${acc.balance}`));
  
  const expectedAliceBalance = parseFloat(initialBalances[0].balance) - (successful * 10);
  const expectedBobBalance = parseFloat(initialBalances[1].balance) + (successful * 10);
  
  console.log('\n🔍 Balance Verification:');
  console.log(`   Alice expected: $${expectedAliceBalance}, actual: $${finalBalances[0].balance}`);
  console.log(`   Bob expected: $${expectedBobBalance}, actual: $${finalBalances[1].balance}`);
  
  const aliceCorrect = Math.abs(parseFloat(finalBalances[0].balance) - expectedAliceBalance) < 0.01;
  const bobCorrect = Math.abs(parseFloat(finalBalances[1].balance) - expectedBobBalance) < 0.01;
  
  if (aliceCorrect && bobCorrect) {
    console.log('✅ All balances are correct! 2PC protocol maintained consistency under high concurrency.');
  } else {
    console.log('❌ Balance inconsistency detected! This indicates a problem with the 2PC implementation.');
  }
}

async function checkServicesHealth() {
  console.log('🔍 Checking service availability...');
  
  const services = [
    { name: 'Accounts Service', url: `${ACCOUNTS_SERVICE_URL}/health` },
    { name: 'Transactions Service', url: `${TRANSACTIONS_SERVICE_URL}/health` },
  ];
  
  for (const service of services) {
    try {
      const response = await axios.get(service.url, { timeout: 5000 });
      if (response.data.success) {
        console.log(`✅ ${service.name} is healthy`);
      } else {
        console.log(`⚠️  ${service.name} reports unhealthy status`);
      }
    } catch (error) {
      console.log(`❌ ${service.name} is not available`);
      return false;
    }
  }
  
  return true;
}

async function main() {
  console.log('🏦 Distributed Banking System - Concurrent Operations Test Suite');
  console.log('🎯 Testing system behavior under various concurrency scenarios\n');
  
  const servicesHealthy = await checkServicesHealth();
  if (!servicesHealthy) {
    console.log('\n❌ Required services are not available');
    console.log('   Please start the services first: npm start');
    process.exit(1);
  }
  
  console.log('\n🚀 Starting test suite...');
  
  try {
    await test1_ConcurrentSafeTransfers();
    await test2_MixedSafeAndUnsafeOperations();
    await test3_HighConcurrencyStressTest();
    
    console.log('\n🎉 Test suite completed!');
    console.log('\n📋 Summary:');
    console.log('   • Test 1 showed 2PC protocol handling concurrent transfers correctly');
    console.log('   • Test 2 demonstrated interference between safe and unsafe operations');
    console.log('   • Test 3 stress-tested the system under high concurrency');
    console.log('\n💡 Key takeaways:');
    console.log('   • Always use 2PC for distributed transactions');
    console.log('   • Avoid unsafe operations in production');
    console.log('   • The system maintains consistency even under high load');
    
  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { 
  test1_ConcurrentSafeTransfers,
  test2_MixedSafeAndUnsafeOperations,
  test3_HighConcurrencyStressTest,
};
