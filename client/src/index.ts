#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { BankingClient } from './services/bankingClient';
import { InteractiveMode } from './modes/interactiveMode';
import { config } from './config';

const program = new Command();

// Initialize banking client
const client = new BankingClient({
  customerServiceUrl: config.services.customerServiceUrl,
  accountsServiceUrl: config.services.accountsServiceUrl,
  transactionsServiceUrl: config.services.transactionsServiceUrl,
});

program
  .name('banking-cli')
  .description('CLI for Distributed Banking System')
  .version('1.0.0');

// Authentication commands
program
  .command('login')
  .description('Login with customer credentials')
  .option('-u, --user <userId>', 'Customer ID')
  .option('-r, --role <role>', 'User role (customer, teller, admin)', 'customer')
  .action(async (options) => {
    try {
      if (!options.user) {
        console.log(chalk.red('❌ User ID is required'));
        process.exit(1);
      }
      
      await client.login(options.user, options.role);
      console.log(chalk.green('✅ Login successful'));
      console.log(chalk.blue('💡 You can now use other commands or start interactive mode'));
    } catch (error) {
      console.log(chalk.red(`❌ Login failed: ${error instanceof Error ? error.message : error}`));
    }
  });

program
  .command('logout')
  .description('Logout current user')
  .action(() => {
    client.logout();
    console.log(chalk.green('✅ Logged out successfully'));
  });

// Customer commands
program
  .command('profile')
  .description('Get customer profile')
  .option('-i, --id <customerId>', 'Customer ID (defaults to current user)')
  .action(async (options) => {
    try {
      const customerId = options.id || client.getCurrentUserId();
      if (!customerId) {
        console.log(chalk.red('❌ Please login first or specify customer ID'));
        return;
      }
      
      const customer = await client.getCustomer(customerId);
      
      console.log(chalk.blue('\n👤 Customer Profile:'));
      console.log(chalk.white(`Name: ${customer.name}`));
      console.log(chalk.white(`ID: ${customer.customer_id}`));
      console.log(chalk.white(`Address: ${customer.address || 'Not provided'}`));
      console.log(chalk.white(`Email: ${customer.contact_info?.email || 'Not provided'}`));
      console.log(chalk.white(`Phone: ${customer.contact_info?.phone || 'Not provided'}`));
    } catch (error) {
      console.log(chalk.red(`❌ Error: ${error instanceof Error ? error.message : error}`));
    }
  });

// Account commands
program
  .command('accounts')
  .description('List customer accounts')
  .option('-c, --customer <customerId>', 'Customer ID (defaults to current user)')
  .action(async (options) => {
    try {
      const customerId = options.customer || client.getCurrentUserId();
      if (!customerId) {
        console.log(chalk.red('❌ Please login first or specify customer ID'));
        return;
      }
      
      const accounts = await client.getCustomerAccounts(customerId);
      
      console.log(chalk.blue(`\n💰 Accounts for Customer ${customerId}:`));
      if (accounts.length === 0) {
        console.log(chalk.yellow('No accounts found'));
        return;
      }
      
      accounts.forEach((account, index) => {
        console.log(chalk.white(`\n${index + 1}. Account ${account.account_id}`));
        console.log(chalk.green(`   Balance: $${account.balance.toFixed(2)}`));
        if (account.pending_change) {
          console.log(chalk.yellow(`   Pending: $${account.pending_change.toFixed(2)}`));
        }
        if (account.transaction_lock) {
          console.log(chalk.red(`   🔒 Locked by transaction: ${account.transaction_lock}`));
        }
      });
    } catch (error) {
      console.log(chalk.red(`❌ Error: ${error instanceof Error ? error.message : error}`));
    }
  });

program
  .command('balance')
  .description('Get account balance')
  .requiredOption('-a, --account <accountId>', 'Account ID')
  .action(async (options) => {
    try {
      const account = await client.getAccount(options.account);
      
      console.log(chalk.blue(`\n💰 Account ${options.account}:`));
      console.log(chalk.green(`Current Balance: $${account.balance.toFixed(2)}`));
      
      if (account.pending_change) {
        const effectiveBalance = account.balance + account.pending_change;
        console.log(chalk.yellow(`Pending Change: $${account.pending_change.toFixed(2)}`));
        console.log(chalk.cyan(`Effective Balance: $${effectiveBalance.toFixed(2)}`));
      }
      
      if (account.transaction_lock) {
        console.log(chalk.red(`🔒 Account is locked by transaction: ${account.transaction_lock}`));
      }
    } catch (error) {
      console.log(chalk.red(`❌ Error: ${error instanceof Error ? error.message : error}`));
    }
  });

// Transfer commands
program
  .command('transfer')
  .description('Transfer money between accounts')
  .requiredOption('-f, --from <accountId>', 'Source account ID')
  .requiredOption('-t, --to <accountId>', 'Destination account ID')
  .requiredOption('-a, --amount <amount>', 'Transfer amount')
  .action(async (options) => {
    try {
      const amount = parseFloat(options.amount);
      if (isNaN(amount) || amount <= 0) {
        console.log(chalk.red('❌ Invalid amount. Must be a positive number.'));
        return;
      }
      
      console.log(chalk.blue(`\n💸 Initiating transfer:`));
      console.log(chalk.white(`From: ${options.from}`));
      console.log(chalk.white(`To: ${options.to}`));
      console.log(chalk.white(`Amount: $${amount.toFixed(2)}`));
      
      const result = await client.transfer(options.from, options.to, amount);
      
      if (result.success) {
        console.log(chalk.green(`\n✅ Transfer successful!`));
        console.log(chalk.white(`Transaction ID: ${result.data.transaction_id}`));
        console.log(chalk.white(`Status: ${result.data.status}`));
      } else {
        console.log(chalk.red(`\n❌ Transfer failed: ${result.error?.message}`));
        if (result.details) {
          console.log(chalk.yellow('Details:', JSON.stringify(result.details, null, 2)));
        }
      }
    } catch (error) {
      console.log(chalk.red(`❌ Error: ${error instanceof Error ? error.message : error}`));
    }
  });

program
  .command('transaction')
  .description('Get transaction status')
  .requiredOption('-i, --id <transactionId>', 'Transaction ID')
  .action(async (options) => {
    try {
      const transaction = await client.getTransaction(options.id);
      
      console.log(chalk.blue(`\n📋 Transaction ${options.id}:`));
      console.log(chalk.white(`From: ${transaction.source_account_id}`));
      console.log(chalk.white(`To: ${transaction.destination_account_id}`));
      console.log(chalk.white(`Amount: $${transaction.amount.toFixed(2)}`));
      
      const statusColor = transaction.status === 'committed' ? 'green' : 
                         transaction.status === 'aborted' ? 'red' : 'yellow';
      console.log(chalk[statusColor](`Status: ${transaction.status.toUpperCase()}`));
      
      console.log(chalk.gray(`Created: ${new Date(transaction.created_at!).toLocaleString()}`));
      if (transaction.updated_at !== transaction.created_at) {
        console.log(chalk.gray(`Updated: ${new Date(transaction.updated_at!).toLocaleString()}`));
      }
    } catch (error) {
      console.log(chalk.red(`❌ Error: ${error instanceof Error ? error.message : error}`));
    }
  });

// Utility commands
program
  .command('health')
  .description('Check service health')
  .action(async () => {
    console.log(chalk.blue('\n🏥 Checking service health...\n'));
    
    const services = [
      { name: 'Customer Service', url: config.services.customerServiceUrl },
      { name: 'Accounts Service', url: config.services.accountsServiceUrl },
      { name: 'Transactions Service', url: config.services.transactionsServiceUrl },
    ];
    
    for (const service of services) {
      try {
        const health = await client.checkHealth(service.url);
        if (health.success) {
          console.log(chalk.green(`✅ ${service.name}: Healthy`));
          if (health.data.uptime) {
            console.log(chalk.gray(`   Uptime: ${Math.round(health.data.uptime / 1000)}s`));
          }
        } else {
          console.log(chalk.yellow(`⚠️  ${service.name}: Unhealthy`));
        }
      } catch (error) {
        console.log(chalk.red(`❌ ${service.name}: Not available`));
      }
    }
  });

program
  .command('demo')
  .description('Run demonstration scenarios')
  .option('-r, --race-condition', 'Demonstrate race condition')
  .option('-c, --concurrent', 'Test concurrent operations')
  .action(async (options) => {
    if (options.raceCondition) {
      console.log(chalk.blue('\n🏁 Running race condition demonstration...'));
      console.log(chalk.yellow('⚠️  This will demonstrate unsafe concurrent operations'));
      // Import and run race condition demo
      const { spawn } = require('child_process');
      const demo = spawn('node', ['../scripts/test-race-condition.js'], { stdio: 'inherit' });
      demo.on('close', (code) => {
        console.log(chalk.blue(`\nRace condition demo finished with code ${code}`));
      });
    } else if (options.concurrent) {
      console.log(chalk.blue('\n🧪 Running concurrent operations test...'));
      const { spawn } = require('child_process');
      const test = spawn('node', ['../scripts/test-concurrent-operations.js'], { stdio: 'inherit' });
      test.on('close', (code) => {
        console.log(chalk.blue(`\nConcurrent operations test finished with code ${code}`));
      });
    } else {
      console.log(chalk.yellow('Please specify a demo type:'));
      console.log(chalk.white('  --race-condition    Demonstrate race condition issues'));
      console.log(chalk.white('  --concurrent        Test concurrent operations'));
    }
  });

// Interactive mode
program
  .command('interactive')
  .alias('i')
  .description('Start interactive mode')
  .action(async () => {
    const interactive = new InteractiveMode(client);
    await interactive.start();
  });

// Token management
program
  .command('tokens')
  .description('Generate sample tokens for testing')
  .action(() => {
    const { spawn } = require('child_process');
    const tokenGen = spawn('node', ['../scripts/generate-tokens.js'], { stdio: 'inherit' });
  });

// Error handling
program.exitOverride((err) => {
  if (err.code === 'commander.help') {
    process.exit(0);
  }
  console.log(chalk.red(`❌ Command error: ${err.message}`));
  process.exit(1);
});

// Parse command line arguments
if (process.argv.length <= 2) {
  console.log(chalk.blue('🏦 Welcome to the Distributed Banking System CLI!'));
  console.log(chalk.white('\nAvailable commands:'));
  program.help();
} else {
  program.parse();
}
