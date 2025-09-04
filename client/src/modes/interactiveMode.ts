import inquirer from 'inquirer';
import chalk from 'chalk';
import { table } from 'table';
import { BankingClient } from '../services/bankingClient';

export class InteractiveMode {
  private client: BankingClient;

  constructor(client: BankingClient) {
    this.client = client;
  }

  async start(): Promise<void> {
    console.log(chalk.blue('\n🏦 Welcome to Interactive Banking Mode!'));
    console.log(chalk.gray('Type "help" for available commands or "exit" to quit\n'));

    // Check if user is logged in
    if (!this.client.isLoggedIn()) {
      await this.handleLogin();
    } else {
      const userId = this.client.getCurrentUserId();
      const role = this.client.getCurrentUserRole();
      console.log(chalk.green(`✅ Already logged in as ${userId} (${role})`));
    }

    await this.mainMenu();
  }

  private async handleLogin(): Promise<void> {
    console.log(chalk.yellow('🔐 Please login to continue\n'));

    const loginQuestions = [
      {
        type: 'input',
        name: 'userId',
        message: 'Enter your Customer ID:',
        validate: (input: string) => {
          if (!input.trim()) {
            return 'Customer ID is required';
          }
          return true;
        },
      },
      {
        type: 'list',
        name: 'role',
        message: 'Select your role:',
        choices: [
          { name: 'Customer', value: 'customer' },
          { name: 'Teller', value: 'teller' },
          { name: 'Admin', value: 'admin' },
        ],
        default: 'customer',
      },
    ];

    const answers = await inquirer.prompt(loginQuestions);

    try {
      await this.client.login(answers.userId, answers.role);
      console.log(chalk.green(`✅ Login successful! Welcome ${answers.userId}`));
    } catch (error) {
      console.log(chalk.red(`❌ Login failed: ${error instanceof Error ? error.message : error}`));
      console.log(chalk.yellow('Please try again or exit the application'));
      await this.handleLogin();
    }
  }

  private async mainMenu(): Promise<void> {
    while (true) {
      console.log(); // Empty line for spacing

      const choices = [
        { name: '👤 View Profile', value: 'profile' },
        { name: '💰 View Accounts', value: 'accounts' },
        { name: '💸 Transfer Money', value: 'transfer' },
        { name: '📋 Transaction History', value: 'history' },
        { name: '🔍 Check Transaction Status', value: 'transaction' },
        { name: '🏥 Service Health', value: 'health' },
        new inquirer.Separator(),
        { name: '⚡ Create Account (Teller/Admin)', value: 'create-account' },
        { name: '👥 Create Customer (Teller/Admin)', value: 'create-customer' },
        { name: '⚠️  Unsafe Withdrawal Demo (Admin)', value: 'unsafe-demo' },
        new inquirer.Separator(),
        { name: '🚪 Logout', value: 'logout' },
        { name: '❌ Exit', value: 'exit' },
      ];

      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices,
          pageSize: 15,
        },
      ]);

      try {
        switch (action) {
          case 'profile':
            await this.viewProfile();
            break;
          case 'accounts':
            await this.viewAccounts();
            break;
          case 'transfer':
            await this.transferMoney();
            break;
          case 'history':
            await this.viewTransactionHistory();
            break;
          case 'transaction':
            await this.checkTransactionStatus();
            break;
          case 'health':
            await this.checkServiceHealth();
            break;
          case 'create-account':
            await this.createAccount();
            break;
          case 'create-customer':
            await this.createCustomer();
            break;
          case 'unsafe-demo':
            await this.unsafeWithdrawalDemo();
            break;
          case 'logout':
            this.client.logout();
            console.log(chalk.green('✅ Logged out successfully'));
            await this.handleLogin();
            break;
          case 'exit':
            console.log(chalk.blue('👋 Thank you for using the Distributed Banking System!'));
            return;
        }
      } catch (error) {
        console.log(chalk.red(`❌ Error: ${error instanceof Error ? error.message : error}`));
        console.log(chalk.yellow('Press Enter to continue...'));
        await inquirer.prompt([{ type: 'input', name: 'continue', message: '' }]);
      }
    }
  }

  private async viewProfile(): Promise<void> {
    const userId = this.client.getCurrentUserId();
    if (!userId) {
      console.log(chalk.red('❌ Not logged in'));
      return;
    }

    const customer = await this.client.getCustomer(userId);

    console.log(chalk.blue('\n👤 Customer Profile:'));
    console.log(chalk.white(`Name: ${customer.name}`));
    console.log(chalk.white(`ID: ${customer.customer_id}`));
    console.log(chalk.white(`Address: ${customer.address || 'Not provided'}`));
    console.log(chalk.white(`Email: ${customer.contact_info?.email || 'Not provided'}`));
    console.log(chalk.white(`Phone: ${customer.contact_info?.phone || 'Not provided'}`));
    
    if (customer.created_at) {
      console.log(chalk.gray(`Member since: ${new Date(customer.created_at).toLocaleDateString()}`));
    }
  }

  private async viewAccounts(): Promise<void> {
    const userId = this.client.getCurrentUserId();
    const role = this.client.getCurrentUserRole();
    
    let customerId = userId;
    
    // If admin/teller, allow viewing other customer's accounts
    if (role === 'admin' || role === 'teller') {
      const { viewOther } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'viewOther',
          message: 'View another customer\'s accounts?',
          default: false,
        },
      ]);
      
      if (viewOther) {
        const { otherCustomerId } = await inquirer.prompt([
          {
            type: 'input',
            name: 'otherCustomerId',
            message: 'Enter Customer ID:',
            validate: (input: string) => input.trim() ? true : 'Customer ID is required',
          },
        ]);
        customerId = otherCustomerId;
      }
    }

    if (!customerId) {
      console.log(chalk.red('❌ Customer ID required'));
      return;
    }

    const accounts = await this.client.getCustomerAccounts(customerId);

    if (accounts.length === 0) {
      console.log(chalk.yellow(`\n💰 No accounts found for customer ${customerId}`));
      return;
    }

    console.log(chalk.blue(`\n💰 Accounts for Customer ${customerId}:`));

    const tableData = [
      ['Account ID', 'Balance', 'Status', 'Pending Change'],
      ...accounts.map(account => [
        account.account_id.substring(0, 8) + '...',
        `$${account.balance.toFixed(2)}`,
        account.transaction_lock ? '🔒 Locked' : '✅ Available',
        account.pending_change ? `$${account.pending_change.toFixed(2)}` : '-',
      ]),
    ];

    console.log(table(tableData));
  }

  private async transferMoney(): Promise<void> {
    const userId = this.client.getCurrentUserId();
    if (!userId) {
      console.log(chalk.red('❌ Not logged in'));
      return;
    }

    // Get user's accounts
    const accounts = await this.client.getCustomerAccounts(userId);
    if (accounts.length === 0) {
      console.log(chalk.yellow('❌ You have no accounts to transfer from'));
      return;
    }

    const transferQuestions = [
      {
        type: 'list',
        name: 'sourceAccount',
        message: 'Select source account:',
        choices: accounts.map(account => ({
          name: `${account.account_id.substring(0, 12)}... (Balance: $${account.balance.toFixed(2)})`,
          value: account.account_id,
        })),
      },
      {
        type: 'input',
        name: 'destinationAccount',
        message: 'Enter destination account ID:',
        validate: (input: string) => {
          if (!input.trim()) return 'Destination account ID is required';
          return true;
        },
      },
      {
        type: 'number',
        name: 'amount',
        message: 'Enter transfer amount:',
        validate: (input: number) => {
          if (isNaN(input) || input <= 0) return 'Amount must be a positive number';
          return true;
        },
      },
    ];

    const answers = await inquirer.prompt(transferQuestions);

    // Confirm transfer
    console.log(chalk.blue('\n💸 Transfer Summary:'));
    console.log(chalk.white(`From: ${answers.sourceAccount}`));
    console.log(chalk.white(`To: ${answers.destinationAccount}`));
    console.log(chalk.white(`Amount: $${answers.amount.toFixed(2)}`));

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Proceed with this transfer?',
        default: false,
      },
    ]);

    if (!confirm) {
      console.log(chalk.yellow('Transfer cancelled'));
      return;
    }

    console.log(chalk.blue('\n🔄 Processing transfer...'));

    const result = await this.client.transfer(
      answers.sourceAccount,
      answers.destinationAccount,
      answers.amount
    );

    if (result.success) {
      console.log(chalk.green(`\n✅ Transfer successful!`));
      console.log(chalk.white(`Transaction ID: ${result.data!.transaction_id}`));
      console.log(chalk.white(`Status: ${result.data!.status}`));
    } else {
      console.log(chalk.red(`\n❌ Transfer failed: ${result.error?.message}`));
      if (result.details) {
        console.log(chalk.gray('Details:', JSON.stringify(result.details, null, 2)));
      }
    }
  }

  private async viewTransactionHistory(): Promise<void> {
    const { accountId } = await inquirer.prompt([
      {
        type: 'input',
        name: 'accountId',
        message: 'Enter account ID:',
        validate: (input: string) => input.trim() ? true : 'Account ID is required',
      },
    ]);

    const transactions = await this.client.getAccountTransactions(accountId);

    if (transactions.length === 0) {
      console.log(chalk.yellow(`\n📋 No transactions found for account ${accountId}`));
      return;
    }

    console.log(chalk.blue(`\n📋 Transaction History for ${accountId}:`));

    const tableData = [
      ['Transaction ID', 'Type', 'Amount', 'Status', 'Date'],
      ...transactions.map(tx => [
        tx.transaction_id.substring(0, 8) + '...',
        tx.source_account_id === accountId ? 'Outgoing' : 'Incoming',
        `$${tx.amount.toFixed(2)}`,
        tx.status.toUpperCase(),
        tx.created_at ? new Date(tx.created_at).toLocaleDateString() : 'Unknown',
      ]),
    ];

    console.log(table(tableData));
  }

  private async checkTransactionStatus(): Promise<void> {
    const { transactionId } = await inquirer.prompt([
      {
        type: 'input',
        name: 'transactionId',
        message: 'Enter transaction ID:',
        validate: (input: string) => input.trim() ? true : 'Transaction ID is required',
      },
    ]);

    const transaction = await this.client.getTransaction(transactionId);

    console.log(chalk.blue(`\n📋 Transaction ${transactionId}:`));
    console.log(chalk.white(`From: ${transaction.source_account_id}`));
    console.log(chalk.white(`To: ${transaction.destination_account_id}`));
    console.log(chalk.white(`Amount: $${transaction.amount.toFixed(2)}`));
    
    const statusColor = transaction.status === 'committed' ? 'green' : 
                       transaction.status === 'aborted' ? 'red' : 'yellow';
    console.log(chalk[statusColor](`Status: ${transaction.status.toUpperCase()}`));
    
    if (transaction.created_at) {
      console.log(chalk.gray(`Created: ${new Date(transaction.created_at).toLocaleString()}`));
    }
    if (transaction.updated_at && transaction.updated_at !== transaction.created_at) {
      console.log(chalk.gray(`Updated: ${new Date(transaction.updated_at).toLocaleString()}`));
    }
  }

  private async checkServiceHealth(): Promise<void> {
    console.log(chalk.blue('\n🏥 Checking service health...\n'));

    try {
      const health = await this.client.getAllServicesHealth();

      const services = [
        { name: 'Customer Service', status: health.customer },
        { name: 'Accounts Service', status: health.accounts },
        { name: 'Transactions Service', status: health.transactions },
      ];

      services.forEach(service => {
        if (service.status.success && service.status.data.status === 'healthy') {
          console.log(chalk.green(`✅ ${service.name}: Healthy`));
          if (service.status.data.uptime) {
            console.log(chalk.gray(`   Uptime: ${Math.round(service.status.data.uptime / 1000)}s`));
          }
          if (service.status.data.database?.connected) {
            console.log(chalk.gray(`   Database: Connected`));
          }
        } else {
          console.log(chalk.yellow(`⚠️  ${service.name}: Unhealthy`));
        }
      });
    } catch (error) {
      console.log(chalk.red('❌ Failed to check service health'));
    }
  }

  private async createAccount(): Promise<void> {
    const role = this.client.getCurrentUserRole();
    if (role !== 'teller' && role !== 'admin') {
      console.log(chalk.red('❌ Only tellers and admins can create accounts'));
      return;
    }

    const questions = [
      {
        type: 'input',
        name: 'customerId',
        message: 'Enter customer ID:',
        validate: (input: string) => input.trim() ? true : 'Customer ID is required',
      },
      {
        type: 'number',
        name: 'initialBalance',
        message: 'Enter initial balance:',
        default: 0,
        validate: (input: number) => {
          if (isNaN(input) || input < 0) return 'Initial balance must be non-negative';
          return true;
        },
      },
    ];

    const answers = await inquirer.prompt(questions);

    const account = await this.client.createAccount(answers.customerId, answers.initialBalance);

    console.log(chalk.green('\n✅ Account created successfully!'));
    console.log(chalk.white(`Account ID: ${account.account_id}`));
    console.log(chalk.white(`Customer ID: ${account.customer_id}`));
    console.log(chalk.white(`Initial Balance: $${account.balance.toFixed(2)}`));
  }

  private async createCustomer(): Promise<void> {
    const role = this.client.getCurrentUserRole();
    if (role !== 'teller' && role !== 'admin') {
      console.log(chalk.red('❌ Only tellers and admins can create customers'));
      return;
    }

    const questions = [
      {
        type: 'input',
        name: 'name',
        message: 'Enter customer name:',
        validate: (input: string) => input.trim() ? true : 'Name is required',
      },
      {
        type: 'input',
        name: 'address',
        message: 'Enter address:',
        default: '',
      },
      {
        type: 'input',
        name: 'email',
        message: 'Enter email:',
        validate: (input: string) => {
          if (!input.trim()) return 'Email is required';
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(input)) return 'Invalid email format';
          return true;
        },
      },
      {
        type: 'input',
        name: 'phone',
        message: 'Enter phone number:',
        default: '',
      },
    ];

    const answers = await inquirer.prompt(questions);

    const customer = await this.client.createCustomer({
      name: answers.name,
      address: answers.address,
      contact_info: {
        email: answers.email,
        phone: answers.phone,
      },
    });

    console.log(chalk.green('\n✅ Customer created successfully!'));
    console.log(chalk.white(`Customer ID: ${customer.customer_id}`));
    console.log(chalk.white(`Name: ${customer.name}`));
    console.log(chalk.white(`Email: ${customer.contact_info.email}`));
  }

  private async unsafeWithdrawalDemo(): Promise<void> {
    const role = this.client.getCurrentUserRole();
    if (role !== 'admin') {
      console.log(chalk.red('❌ Only admins can access unsafe operations'));
      return;
    }

    console.log(chalk.yellow('\n⚠️  UNSAFE WITHDRAWAL DEMONSTRATION'));
    console.log(chalk.red('This operation is intentionally vulnerable to race conditions!'));
    console.log(chalk.white('It should only be used for educational purposes.\n'));

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Do you want to proceed with the unsafe operation?',
        default: false,
      },
    ]);

    if (!confirm) {
      console.log(chalk.yellow('Operation cancelled'));
      return;
    }

    const questions = [
      {
        type: 'input',
        name: 'accountId',
        message: 'Enter account ID:',
        validate: (input: string) => input.trim() ? true : 'Account ID is required',
      },
      {
        type: 'number',
        name: 'amount',
        message: 'Enter withdrawal amount:',
        validate: (input: number) => {
          if (isNaN(input) || input <= 0) return 'Amount must be positive';
          return true;
        },
      },
    ];

    const answers = await inquirer.prompt(questions);

    console.log(chalk.blue('\n🔄 Processing unsafe withdrawal...'));

    try {
      const account = await this.client.unsafeWithdraw(answers.accountId, answers.amount);
      
      console.log(chalk.green('\n✅ Unsafe withdrawal completed'));
      console.log(chalk.white(`New Balance: $${account.balance.toFixed(2)}`));
      console.log(chalk.red('⚠️  Warning: This operation bypassed proper concurrency controls!'));
    } catch (error) {
      console.log(chalk.red(`❌ Withdrawal failed: ${error instanceof Error ? error.message : error}`));
    }
  }
}
