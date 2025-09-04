#!/usr/bin/env ts-node

/**
 * CLI Race Condition Test
 * Demonstrates race conditions using the CLI client
 */

import chalk from 'chalk';
import { BankingClient } from '../services/bankingClient';
import { config } from '../config';

async function demonstrateRaceCondition() {
  console.log(chalk.blue('🏁 CLI Race Condition Demonstration'));
  console.log(chalk.yellow('⚠️  This test shows why atomic operations are crucial\n'));

  // Initialize client
  const client = new BankingClient({
    customerServiceUrl: config.services.customerServiceUrl,
    accountsServiceUrl: config.services.accountsServiceUrl,
    transactionsServiceUrl: config.services.transactionsServiceUrl,
  });

  try {
    // Login as admin
    await client.login('admin-001', 'admin');
    console.log(chalk.green('✅ Logged in as admin'));

    // Test account (Alice's account)
    const testAccountId = '660e8400-e29b-41d4-a716-446655440001';
    
    // Get initial balance
    const initialAccount = await client.getAccount(testAccountId);
    console.log(chalk.blue(`💰 Initial balance: $${initialAccount.balance.toFixed(2)}`));

    // Perform two concurrent unsafe withdrawals
    const withdrawalAmount = 100;
    console.log(chalk.yellow(`\n🚀 Performing two concurrent withdrawals of $${withdrawalAmount} each...`));

    const startTime = Date.now();
    
    const [result1, result2] = await Promise.allSettled([
      client.unsafeWithdraw(testAccountId, withdrawalAmount),
      client.unsafeWithdraw(testAccountId, withdrawalAmount),
    ]);

    const endTime = Date.now();
    
    console.log(`\n📊 Results (completed in ${endTime - startTime}ms):`);
    
    if (result1.status === 'fulfilled') {
      console.log(chalk.green(`✅ Withdrawal 1: Success - New balance: $${result1.value.balance.toFixed(2)}`));
    } else {
      console.log(chalk.red(`❌ Withdrawal 1: Failed - ${result1.reason}`));
    }
    
    if (result2.status === 'fulfilled') {
      console.log(chalk.green(`✅ Withdrawal 2: Success - New balance: $${result2.value.balance.toFixed(2)}`));
    } else {
      console.log(chalk.red(`❌ Withdrawal 2: Failed - ${result2.reason}`));
    }

    // Get final balance
    const finalAccount = await client.getAccount(testAccountId);
    console.log(chalk.blue(`\n💰 Final balance: $${finalAccount.balance.toFixed(2)}`));

    // Analysis
    const expectedBalance = initialAccount.balance - (withdrawalAmount * 2);
    const actualBalance = finalAccount.balance;
    
    console.log(chalk.white(`\n🔍 Analysis:`));
    console.log(chalk.white(`Expected balance: $${expectedBalance.toFixed(2)}`));
    console.log(chalk.white(`Actual balance: $${actualBalance.toFixed(2)}`));
    
    if (Math.abs(actualBalance - expectedBalance) < 0.01) {
      console.log(chalk.green('✅ No race condition detected - operations were properly serialized'));
    } else {
      console.log(chalk.red('🚨 RACE CONDITION DETECTED!'));
      console.log(chalk.red(`   Difference: $${(actualBalance - expectedBalance).toFixed(2)}`));
      console.log(chalk.yellow('   This demonstrates why the 2PC protocol is necessary!'));
    }

    console.log(chalk.blue('\n💡 The correct approach:'));
    console.log(chalk.white('   Use the transfer command which implements 2PC protocol'));
    console.log(chalk.white('   This ensures atomicity and prevents race conditions'));

  } catch (error) {
    console.log(chalk.red(`❌ Test failed: ${error instanceof Error ? error.message : error}`));
  } finally {
    client.logout();
  }
}

if (require.main === module) {
  demonstrateRaceCondition();
}

export { demonstrateRaceCondition };
