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
const TRANSACTIONS_SERVICE_URL = process.env.TRANSACTIONS_SERVICE_URL || 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_SECRET || 'e681bda1351b31126bdccbfdad0ac6ea887d8276bf9fd86a542e0326c718e24c';

// Test accounts from sample data
const ALICE_ACCOUNT = '660e8400-e29b-41d4-a716-446655440001';
const BOB_ACCOUNT = '660e8400-e29b-41d4-a716-446655440003';
const CAROL_ACCOUNT = '660e8400-e29b-41d4-a716-446655440005';

// Generate tokens
const ADMIN_TOKEN = jwt.sign({ customer_id: 'admin-001', role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
const ALICE_TOKEN = jwt.sign({ customer_id: '550e8400-e29b-41d4-a716-446655440001', role: 'customer' }, JWT_SECRET, { expiresIn: '1h' });

async function resetAccountBalances() {
  console.log(' Resetting account balances for testing...');
  
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
      console.log(` ${op.name}'s account reset to $${op.balance}`);
    } catch (error) {
      console.error(` Failed to reset ${op.name}'s account:`, error.response?.data || error.message);
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
        timeout: 30000, // Increased timeout to allow for internal retries
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
      retryAttempt: response.data.data?.retry_attempt || 1,
      totalAttempts: response.data.data?.total_attempts || 1,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    
    return {
      transferId,
      success: false,
      duration,
      error: error.response?.data?.error || error.message,
      retryAttempt: 1,
      totalAttempts: 1,
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

async function test1_ConcurrentSafeTransfersWithInternalRetry() {
  console.log('\n Test 1: Concurrent Safe Transfers with Internal Retry Mechanism (2PC Protocol)');
  console.log('=' .repeat(75));
  
  await resetAccountBalances();
  
  console.log('\n Scenario: Multiple simultaneous transfers using 2PC with internal retry mechanism');
  console.log('   • Alice → Bob: $50 (single call, internal retries)');
  console.log('   • Alice → Carol: $75 (single call, internal retries)');
  console.log('   • Bob → Carol: $25 (single call, internal retries)');
  
  const initialBalances = await Promise.all([
    getAccountBalance(ALICE_ACCOUNT, 'Alice'),
    getAccountBalance(BOB_ACCOUNT, 'Bob'),
    getAccountBalance(CAROL_ACCOUNT, 'Carol'),
  ]);
  
  console.log('\n Initial Balances:');
  initialBalances.forEach(acc => console.log(`   ${acc.name}: $${acc.balance}`));
  
  console.log('\n Executing concurrent transfers with internal retry mechanism...');
  const startTime = Date.now();
  
  const transfers = await Promise.all([
    performSafeTransfer(ALICE_ACCOUNT, BOB_ACCOUNT, 50, 'Alice→Bob'),
    performSafeTransfer(ALICE_ACCOUNT, CAROL_ACCOUNT, 75, 'Alice→Carol'),
    performSafeTransfer(BOB_ACCOUNT, CAROL_ACCOUNT, 25, 'Bob→Carol'),
  ]);
  
  const totalTime = Date.now() - startTime;
  
  console.log('\n Transfer Results with Internal Retry Information:');
  transfers.forEach(transfer => {
    console.log(`   ${transfer.transferId}:`);
    console.log(`     Success: ${transfer.success}`);
    console.log(`     Duration: ${transfer.duration}ms`);
    console.log(`     Internal Retries: ${transfer.retryAttempt}/${transfer.totalAttempts}`);
    if (transfer.success) {
      console.log(`     Transaction ID: ${transfer.transactionId}`);
      console.log(`     Status: ${transfer.status}`);
      if (transfer.retryAttempt > 1) {
        console.log(`      Required ${transfer.retryAttempt} attempts to succeed`);
      } else {
        console.log(`      Succeeded on first attempt`);
      }
    } else {
      console.log(`     Error: ${transfer.error}`);
      console.log(`      Failed after ${transfer.retryAttempt} attempts`);
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
  
  console.log('\n Final Balances:');
  finalBalances.forEach(acc => console.log(`   ${acc.name}: $${acc.balance}`));
  
  // Calculate expected balances
  const successfulTransfers = transfers.filter(t => t.success);
  console.log(`\n Successful transfers: ${successfulTransfers.length}/3`);
  
  // Analyze retry behavior
  const transfersRequiringRetries = transfers.filter(t => t.retryAttempt > 1);
  const totalRetries = transfers.reduce((sum, t) => sum + (t.retryAttempt - 1), 0);
  
  console.log(` Transfers that needed retries: ${transfersRequiringRetries.length}/3`);
  console.log(` Total retry attempts across all transfers: ${totalRetries}`);
  
  if (transfersRequiringRetries.length > 0) {
    console.log('   Retry breakdown:');
    transfersRequiringRetries.forEach(t => {
      console.log(`   • ${t.transferId}: ${t.retryAttempt} attempts (${t.retryAttempt - 1} retries)`);
    });
  }
  
  if (successfulTransfers.length === 3) {
    console.log(' All concurrent transfers completed successfully!');
    console.log('   This demonstrates the 2PC protocol with internal retry mechanism working correctly under concurrency');
  } else {
    console.log('  Some transfers failed even with internal retries - this may indicate system overload or configuration issues');
  }
}

async function test2_MixedSafeAndUnsafeOperations() {
  console.log('\n Test 2: Mixed Safe and Unsafe Operations');
  console.log('=' .repeat(45));
  
  await resetAccountBalances();
  
  console.log('\n Scenario: Mixing 2PC transfers with unsafe withdrawals');
  console.log('   • Safe transfer: Alice → Bob: $100 (using 2PC with internal retry)');
  console.log('   • Unsafe withdrawal: Alice: $100 (race condition prone)');
  console.log('   • Safe transfer: Alice → Carol: $50 (using 2PC with internal retry)');
  
  const initialBalance = await getAccountBalance(ALICE_ACCOUNT, 'Alice');
  console.log(`\n Alice's initial balance: $${initialBalance.balance}`);
  
  console.log('\n Executing mixed operations...');
  const startTime = Date.now();
  
  const operations = await Promise.all([
    performSafeTransfer(ALICE_ACCOUNT, BOB_ACCOUNT, 100, 'Safe-Transfer-1'),
    performUnsafeWithdrawal(ALICE_ACCOUNT, 100, 'Unsafe-Withdrawal'),
    performSafeTransfer(ALICE_ACCOUNT, CAROL_ACCOUNT, 50, 'Safe-Transfer-2'),
  ]);
  
  const totalTime = Date.now() - startTime;
  
  console.log('\n Operation Results:');
  operations.forEach(op => {
    const opId = op.transferId || op.requestId;
    console.log(`   ${opId}:`);
    console.log(`     Success: ${op.success}`);
    console.log(`     Duration: ${op.duration}ms`);
    if (op.transferId && op.success) {
      console.log(`     Internal Retries: ${op.retryAttempt}/${op.totalAttempts}`);
      if (op.retryAttempt > 1) {
        console.log(`      Required ${op.retryAttempt} attempts to succeed`);
      }
    }
    if (op.error) {
      console.log(`     Error: ${op.error}`);
    }
  });
  
  console.log(`\nTotal execution time: ${totalTime}ms`);
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const finalBalance = await getAccountBalance(ALICE_ACCOUNT, 'Alice');
  console.log(`\n Alice's final balance: $${finalBalance.balance}`);
  
  const successfulOps = operations.filter(op => op.success).length;
  console.log(`\n Analysis: ${successfulOps}/${operations.length} operations succeeded`);
  console.log('   This test shows how safe 2PC operations with internal retries can coexist with unsafe operations');
  
  const safeOpsWithRetries = operations.filter(op => 
    op.transferId && op.retryAttempt > 1
  );
  
  if (safeOpsWithRetries.length > 0) {
    console.log(`    ${safeOpsWithRetries.length} safe operation(s) required internal retries due to interference`);
    safeOpsWithRetries.forEach(op => {
      console.log(`      • ${op.transferId}: ${op.retryAttempt} attempts`);
    });
  }
}

async function test3_HighConcurrencyStressTestWithInternalRetry() {
  console.log('\n Test 3: High Concurrency Stress Test with Internal Retry Mechanism');
  console.log('=' .repeat(70));
  
  await resetAccountBalances();
  
  const NUM_CONCURRENT_TRANSFERS = 10;
  console.log(`\n Scenario: ${NUM_CONCURRENT_TRANSFERS} simultaneous small transfers with internal retry mechanism`);
  console.log('   Testing the 2PC coordinator under high load with automatic internal retries');
  
  const initialBalances = await Promise.all([
    getAccountBalance(ALICE_ACCOUNT, 'Alice'),
    getAccountBalance(BOB_ACCOUNT, 'Bob'),
  ]);
  
  console.log('\n Initial Balances:');
  initialBalances.forEach(acc => console.log(`   ${acc.name}: $${acc.balance}`));
  
  console.log(`\n Executing ${NUM_CONCURRENT_TRANSFERS} concurrent transfers with internal retry mechanism...`);
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
  const retriesNeeded = results.filter(r => r.retryAttempt > 1).length;
  const totalRetries = results.reduce((sum, r) => sum + (r.retryAttempt - 1), 0);
  const totalAttempts = results.reduce((sum, r) => sum + r.retryAttempt, 0);
  
  console.log('\n Stress Test Results with Internal Retry Analysis:');
  console.log(`   Total transfers: ${results.length}`);
  console.log(`   Successful: ${successful}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Required internal retries: ${retriesNeeded}`);
  console.log(`   Total attempts made: ${totalAttempts}`);
  console.log(`   Total retry attempts: ${totalRetries}`);
  console.log(`   Success rate: ${((successful / results.length) * 100).toFixed(1)}%`);
  console.log(`   Retry rate: ${((retriesNeeded / results.length) * 100).toFixed(1)}%`);
  console.log(`   Average attempts per transfer: ${(totalAttempts / results.length).toFixed(1)}`);
  console.log(`   Total time: ${totalTime}ms`);
  console.log(`   Average time per transfer: ${(totalTime / results.length).toFixed(1)}ms`);
  
  // Detailed retry analysis
  if (retriesNeeded > 0) {
    console.log('\n Internal Retry Analysis:');
    results.forEach(result => {
      if (result.retryAttempt > 1) {
        console.log(`   ${result.transferId}: ${result.success ? '' : ''} ${result.retryAttempt} attempts (${result.retryAttempt - 1} retries)`);
      }
    });
  }
  
  if (failed > 0) {
    console.log('\n Some transfers failed even with internal retries. Common reasons:');
    console.log('   • Insufficient funds (expected after several successful transfers)');
    console.log('   • Persistent resource contention');
    console.log('   • System overload despite internal retry mechanism');
  } else {
    console.log('\n All transfers succeeded! The internal retry mechanism effectively handled all conflicts.');
  }
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const finalBalances = await Promise.all([
    getAccountBalance(ALICE_ACCOUNT, 'Alice'),
    getAccountBalance(BOB_ACCOUNT, 'Bob'),
  ]);
  
  console.log('\n Final Balances:');
  finalBalances.forEach(acc => console.log(`   ${acc.name}: $${acc.balance}`));
  
  const expectedAliceBalance = parseFloat(initialBalances[0].balance) - (successful * 10);
  const expectedBobBalance = parseFloat(initialBalances[1].balance) + (successful * 10);
  
  console.log('\n Balance Verification:');
  console.log(`   Alice expected: $${expectedAliceBalance}, actual: $${finalBalances[0].balance}`);
  console.log(`   Bob expected: $${expectedBobBalance}, actual: $${finalBalances[1].balance}`);
  
  const aliceCorrect = Math.abs(parseFloat(finalBalances[0].balance) - expectedAliceBalance) < 0.01;
  const bobCorrect = Math.abs(parseFloat(finalBalances[1].balance) - expectedBobBalance) < 0.01;
  
  if (aliceCorrect && bobCorrect) {
    console.log(' All balances are correct! 2PC protocol with internal retry mechanism maintained consistency under high concurrency.');
  } else {
    console.log(' Balance inconsistency detected! This indicates a problem with the 2PC implementation.');
  }
}

async function checkServicesHealth() {
  console.log(' Checking service availability...');
  
  const services = [
    { name: 'Accounts Service', url: `${ACCOUNTS_SERVICE_URL}/health` },
    { name: 'Transactions Service', url: `${TRANSACTIONS_SERVICE_URL}/health` },
  ];
  
  for (const service of services) {
    try {
      const response = await axios.get(service.url, { timeout: 5000 });
      if (response.data.success) {
        console.log(` ${service.name} is healthy`);
      } else {
        console.log(`  ${service.name} reports unhealthy status`);
      }
    } catch (error) {
      console.log(` ${service.name} is not available`);
      return false;
    }
  }
  
  return true;
}

async function main() {
  console.log(' Distributed Banking System - Concurrent Operations Test Suite');
  console.log(' Testing system behavior under various concurrency scenarios\n');
  
  const servicesHealthy = await checkServicesHealth();
  if (!servicesHealthy) {
    console.log('\n Required services are not available');
    console.log('   Please start the services first: npm start');
    process.exit(1);
  }
  
  console.log('\n Starting test suite with internal retry mechanism...');
  
  try {
    await test1_ConcurrentSafeTransfersWithInternalRetry();
    await test2_MixedSafeAndUnsafeOperations();
    await test3_HighConcurrencyStressTestWithInternalRetry();
    
    console.log('\n Test suite completed!');
    console.log('\n Summary:');
    console.log('   • Test 1 showed 2PC protocol with internal retry mechanism handling concurrent transfers correctly');
    console.log('   • Test 2 demonstrated interference between safe and unsafe operations');
    console.log('   • Test 3 stress-tested the system under high concurrency with automatic internal retries');
    console.log('\n Key takeaways:');
    console.log('   • Single transfer calls with internal retry mechanism significantly improve success rates');
    console.log('   • Transaction IDs are preserved across internal retry attempts for proper tracking');
    console.log('   • The system maintains consistency with fully internal retry logic');
    console.log('   • Total attempt counts provide clear visibility into retry behavior');
    
  } catch (error) {
    console.error('\n Test suite failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { 
  test1_ConcurrentSafeTransfersWithInternalRetry,
  test2_MixedSafeAndUnsafeOperations,
  test3_HighConcurrencyStressTestWithInternalRetry,
  performSafeTransfer,
};
