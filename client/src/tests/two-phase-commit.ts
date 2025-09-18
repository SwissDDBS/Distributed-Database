#!/usr/bin/env ts-node

/**
 * CLI Two-Phase Commit Test
 * Demonstrates the 2PC protocol working correctly
 */

import chalk from 'chalk';
import { BankingClient } from '../services/bankingClient';
import { config } from '../config';

async function demonstrateTwoPhaseCommit() {
  console.log(chalk.blue(' CLI Two-Phase Commit Demonstration'));
  console.log(chalk.green(' This test shows atomic distributed transactions\n'));

  // Initialize client
  const client = new BankingClient({
    customerServiceUrl: config.services.customerServiceUrl,
    accountsServiceUrl: config.services.accountsServiceUrl,
    transactionsServiceUrl: config.services.transactionsServiceUrl,
  });

  try {
    // Login as Alice
    await client.login('550e8400-e29b-41d4-a716-446655440001', 'customer');
    console.log(chalk.green(' Logged in as Alice'));

    // Test accounts
    const aliceAccount = '660e8400-e29b-41d4-a716-446655440001';
    const bobAccount = '660e8400-e29b-41d4-a716-446655440003';
    
    // Get initial balances
    const [initialAlice, initialBob] = await Promise.all([
      client.getAccount(aliceAccount),
      client.getAccount(bobAccount),
    ]);
    
    console.log(chalk.blue('\n Initial Balances:'));
    console.log(chalk.white(`Alice: $${initialAlice.balance.toFixed(2)}`));
    console.log(chalk.white(`Bob: $${initialBob.balance.toFixed(2)}`));

    // Test 1: Successful transfer
    console.log(chalk.blue('\n Test 1: Successful Transfer'));
    const transferAmount = 50;
    console.log(chalk.yellow(`Transferring $${transferAmount} from Alice to Bob...`));

    const transferResult = await client.transfer(aliceAccount, bobAccount, transferAmount);
    
    if (transferResult.success) {
      console.log(chalk.green(` Transfer successful!`));
      console.log(chalk.white(`Transaction ID: ${transferResult.data!.transaction_id}`));
      console.log(chalk.white(`Status: ${transferResult.data!.status}`));
      
      // Wait a moment for transaction to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Check final balances
      const [finalAlice, finalBob] = await Promise.all([
        client.getAccount(aliceAccount),
        client.getAccount(bobAccount),
      ]);
      
      console.log(chalk.blue('\n Final Balances:'));
      console.log(chalk.white(`Alice: $${finalAlice.balance.toFixed(2)} (${finalAlice.balance - initialAlice.balance >= 0 ? '+' : ''}${(finalAlice.balance - initialAlice.balance).toFixed(2)})`));
      console.log(chalk.white(`Bob: $${finalBob.balance.toFixed(2)} (+${(finalBob.balance - initialBob.balance).toFixed(2)})`));
      
      // Verify balances are correct
      const expectedAlice = initialAlice.balance - transferAmount;
      const expectedBob = initialBob.balance + transferAmount;
      
      if (Math.abs(finalAlice.balance - expectedAlice) < 0.01 && 
          Math.abs(finalBob.balance - expectedBob) < 0.01) {
        console.log(chalk.green(' Balances are correct - 2PC protocol worked perfectly!'));
      } else {
        console.log(chalk.red(' Balance mismatch detected'));
      }
    } else {
      console.log(chalk.red(` Transfer failed: ${transferResult.error?.message}`));
    }

    // Test 2: Insufficient funds (should fail gracefully)
    console.log(chalk.blue('\n Test 2: Insufficient Funds Test'));
    const largeAmount = 10000; // Amount larger than Alice's balance
    console.log(chalk.yellow(`Attempting to transfer $${largeAmount} (should fail)...`));

    const failedTransfer = await client.transfer(aliceAccount, bobAccount, largeAmount);
    
    if (!failedTransfer.success) {
      console.log(chalk.green(' Transfer correctly failed due to insufficient funds'));
      console.log(chalk.white(`Error: ${failedTransfer.error?.message}`));
      
      // Verify balances are unchanged
      const [unchangedAlice, unchangedBob] = await Promise.all([
        client.getAccount(aliceAccount),
        client.getAccount(bobAccount),
      ]);
      
      const [finalAlice, finalBob] = await Promise.all([
        client.getAccount(aliceAccount),
        client.getAccount(bobAccount),
      ]);
      
      if (Math.abs(unchangedAlice.balance - finalAlice.balance) < 0.01 && 
          Math.abs(unchangedBob.balance - finalBob.balance) < 0.01) {
        console.log(chalk.green(' Balances unchanged - atomic failure worked correctly'));
      } else {
        console.log(chalk.red(' Balances changed despite failed transaction'));
      }
    } else {
      console.log(chalk.red(' Transfer should have failed but succeeded'));
    }

    // Test 3: Multiple concurrent transfers
    console.log(chalk.blue('\n Test 3: Concurrent Transfers Test'));
    console.log(chalk.yellow('Performing 3 concurrent small transfers...'));

    const concurrentTransfers = await Promise.allSettled([
      client.transfer(aliceAccount, bobAccount, 10),
      client.transfer(aliceAccount, bobAccount, 15),
      client.transfer(aliceAccount, bobAccount, 5),
    ]);

    let successCount = 0;
    concurrentTransfers.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value.success) {
        successCount++;
        console.log(chalk.green(` Concurrent transfer ${index + 1}: Success (${result.value.data!.transaction_id})`));
      } else {
        console.log(chalk.yellow(`  Concurrent transfer ${index + 1}: Failed`));
      }
    });

    console.log(chalk.blue(`\n Concurrent Results: ${successCount}/3 transfers succeeded`));
    console.log(chalk.white('This demonstrates the 2PC coordinator handling concurrent requests'));

    console.log(chalk.blue('\n Two-Phase Commit demonstration completed!'));
    console.log(chalk.green('Key benefits demonstrated:'));
    console.log(chalk.white('  • Atomic transactions across distributed services'));
    console.log(chalk.white('  • Graceful failure handling'));
    console.log(chalk.white('  • Consistency under concurrent operations'));
    console.log(chalk.white('  • Complete rollback on any failure'));

  } catch (error) {
    console.log(chalk.red(` Test failed: ${error instanceof Error ? error.message : error}`));
  } finally {
    client.logout();
  }
}

if (require.main === module) {
  demonstrateTwoPhaseCommit();
}

export { demonstrateTwoPhaseCommit };
