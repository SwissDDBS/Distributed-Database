#!/usr/bin/env node

/**
 * Real-time Transfer Flow Debugger
 * ================================
 * 
 * A debugger that monitors your existing service logs in real-time
 * and shows the complete flow of transfer requests across all services.
 */

const fs = require('fs');
const path = require('path');
const { Tail } = require('tail');
const chalk = require('chalk');
const moment = require('moment');

class TransferFlowDebugger {
  constructor() {
    this.projectRoot = process.cwd();
    this.logFiles = {
      transactions: path.join(this.projectRoot, 'services/transactions-service/logs/transactions.log'),
      accounts: path.join(this.projectRoot, 'services/accounts-service/logs/accounts.log'),
      customers: path.join(this.projectRoot, 'services/customer-service/logs/customer.log'),
    };
    
    this.errorFiles = {
      transactions: path.join(this.projectRoot, 'services/transactions-service/logs/error.log'),
      accounts: path.join(this.projectRoot, 'services/accounts-service/logs/error.log'),
      customers: path.join(this.projectRoot, 'services/customer-service/logs/error.log'),
    };
    
    this.tails = {};
    this.transactions = new Map(); // Track active transactions
    this.filters = {
      showOnlyTransfers: true,
      minLevel: 'info',
      transactionIds: new Set()
    };
    
    // Colors for different services
    this.colors = {
      transactions: chalk.blue,
      accounts: chalk.green,
      customers: chalk.yellow,
      error: chalk.red,
      warning: chalk.yellow,
      info: chalk.white,
      debug: chalk.cyan,
      success: chalk.green.bold,
      failure: chalk.red.bold
    };
    
    this.setupEventHandlers();
  }
  
  setupEventHandlers() {
    process.on('SIGINT', () => {
      console.log(chalk.yellow('\n Stopping transfer flow debugger...'));
      this.stop();
      process.exit(0);
    });
  }
  
  start() {
    console.log(chalk.magenta.bold(' Transfer Flow Debugger'));
    console.log(chalk.magenta('================================'));
    console.log('');
    
    this.printHeader();
    this.startMonitoring();
  }
  
  printHeader() {
    console.log(chalk.cyan(' Monitoring Configuration:'));
    console.log(`   • Show only transfers: ${this.filters.showOnlyTransfers ? '' : ''}`);
    console.log(`   • Minimum log level: ${this.filters.minLevel}`);
    console.log('');
    
    console.log(chalk.cyan(' Log Files:'));
    Object.entries(this.logFiles).forEach(([service, filePath]) => {
      const exists = fs.existsSync(filePath);
      const status = exists ? chalk.green('') : chalk.red('');
      console.log(`   ${status} ${service}: ${filePath}`);
    });
    
    console.log('');
    console.log(chalk.cyan(' Live Transfer Flow (Ctrl+C to stop):'));
    console.log(''.padEnd(80, '='));
  }
  
  startMonitoring() {
    // Monitor main log files
    Object.entries(this.logFiles).forEach(([service, filePath]) => {
      if (fs.existsSync(filePath)) {
        this.startTailing(filePath, service);
      }
    });
    
    // Monitor error files
    Object.entries(this.errorFiles).forEach(([service, filePath]) => {
      if (fs.existsSync(filePath)) {
        this.startTailing(filePath, `${service}-error`);
      }
    });
  }
  
  startTailing(filePath, service) {
    try {
      const tail = new Tail(filePath, { follow: true, fromBeginning: false });
      this.tails[service] = tail;
      
      tail.on('line', (line) => {
        this.processLogLine(line, service);
      });
      
      tail.on('error', (error) => {
        console.log(chalk.red(` Error tailing ${service}: ${error.message}`));
      });
      
      tail.watch();
    } catch (error) {
      console.log(chalk.red(` Failed to start tailing ${service}: ${error.message}`));
    }
  }
  
  processLogLine(line, service) {
    if (!line.trim()) return;
    
    try {
      const logEntry = JSON.parse(line);
      
      // Apply filters
      if (!this.shouldDisplay(logEntry, service)) {
        return;
      }
      
      // Track transactions
      if (logEntry.transaction_id && logEntry.transaction_id !== 'pending') {
        this.updateTransactionState(logEntry);
      }
      
      // Format and display
      this.displayLogEntry(logEntry, service);
      
    } catch (error) {
      // Handle non-JSON log lines
      if (line.includes('ERROR') || line.includes('error')) {
        console.log(this.formatRawLine(line, service, 'error'));
      }
    }
  }
  
  shouldDisplay(logEntry, service) {
    // Filter by transfer-related activity
    if (this.filters.showOnlyTransfers) {
      const transferKeywords = [
        'transfer', 'transaction', '2pc', 'prepare', 'commit', 'abort',
        'TRANSFER_REQUEST', 'Transaction Event', '2PC Coordinator',
        'Transaction Lifecycle', 'Participant Response'
      ];
      
      const message = (logEntry.message || '').toLowerCase();
      const event = (logEntry.event || '').toLowerCase();
      const operation = (logEntry.operation || '').toLowerCase();
      
      const isTransferRelated = transferKeywords.some(keyword => 
        message.includes(keyword) || 
        event.includes(keyword) || 
        operation.includes(keyword)
      );
      
      if (!isTransferRelated && !logEntry.transaction_id) {
        return false;
      }
    }
    
    // Filter by specific transaction IDs if set
    if (this.filters.transactionIds.size > 0) {
      if (!logEntry.transaction_id || !this.filters.transactionIds.has(logEntry.transaction_id)) {
        return false;
      }
    }
    
    return true;
  }
  
  updateTransactionState(logEntry) {
    const txId = logEntry.transaction_id;
    
    if (!this.transactions.has(txId)) {
      this.transactions.set(txId, {
        id: txId,
        startTime: logEntry.timestamp,
        services: new Set(),
        events: [],
        status: 'active',
        details: {}
      });
    }
    
    const tx = this.transactions.get(txId);
    tx.services.add(logEntry.service || 'unknown');
    tx.events.push({
      timestamp: logEntry.timestamp,
      service: logEntry.service,
      event: logEntry.event || logEntry.message,
      level: logEntry.level,
      details: logEntry.details || {}
    });
    
    // Update transaction status based on events
    if (logEntry.event === 'TRANSFER_REQUEST_COMPLETED' || logEntry.phase === 'COMPLETION') {
      tx.status = logEntry.details?.status === 'committed' ? 'committed' : 'completed';
    } else if (logEntry.event === 'PREPARE_PHASE_FAILED' || logEntry.phase === 'ABORT') {
      tx.status = 'aborted';
    }
  }
  
  displayLogEntry(logEntry, service) {
    const timestamp = moment(logEntry.timestamp).format('HH:mm:ss.SSS');
    const serviceColor = this.colors[service.replace('-error', '')] || chalk.white;
    const levelColor = this.colors[logEntry.level] || chalk.white;
    
    // Transaction ID (shortened)
    const txId = logEntry.transaction_id ? 
      chalk.magenta(`[${logEntry.transaction_id.substring(0, 8)}]`) : 
      chalk.gray('[--------]');
    
    // Service name (fixed width)
    const serviceName = serviceColor(service.padEnd(12).substring(0, 12));
    
    // Level (fixed width)
    const level = levelColor(logEntry.level?.toUpperCase().padEnd(5) || 'INFO ');
    
    // Main message
    let message = this.formatMessage(logEntry, service);
    
    console.log(
      `${chalk.gray(`[${timestamp}]`)} ${serviceName} ${level} ${txId} ${message}`
    );
    
    // Show additional details for important events
    this.showAdditionalDetails(logEntry, service);
  }
  
  formatMessage(logEntry, service) {
    // Special formatting for different types of events
    if (logEntry.event) {
      return this.formatEventMessage(logEntry);
    } else if (logEntry.phase) {
      return this.formatPhaseMessage(logEntry);
    } else if (logEntry.operation) {
      return this.formatOperationMessage(logEntry);
    } else {
      return logEntry.message || '';
    }
  }
  
  formatEventMessage(logEntry) {
    const event = logEntry.event;
    let message = '';
    
    switch (event) {
      case 'TRANSFER_REQUEST_RECEIVED':
        const details = logEntry.details || {};
        message = chalk.cyan(` Transfer Request: $${details.amount} from ${this.formatAccountId(details.source_account_id)} → ${this.formatAccountId(details.destination_account_id)}`);
        break;
        
      case 'TRANSFER_REQUEST_COMPLETED':
        const status = logEntry.details?.status;
        if (status === 'committed') {
          message = chalk.green(' Transfer COMMITTED');
        } else if (status === 'aborted') {
          message = chalk.red(' Transfer ABORTED');
        } else {
          message = chalk.yellow('  Transfer COMPLETED');
        }
        break;
        
      case 'PREPARE_PHASE_FAILED':
        message = chalk.red(' Prepare phase FAILED: ' + (logEntry.details?.reason || ''));
        break;
        
      case 'PREPARE_SUCCESS_VOTE_COMMIT':
        const acc = logEntry.details?.account_id;
        const op = logEntry.details?.operation;
        const amount = logEntry.details?.amount;
        message = chalk.green(` ${op?.toUpperCase()} prepared: ${this.formatAccountId(acc)} ${op === 'debit' ? '-' : '+'}$${Math.abs(amount)}`);
        break;
        
      case 'PREPARE_FAILED_ACCOUNT_LOCKED':
        message = chalk.yellow(' Account locked by another transaction');
        break;
        
      default:
        message = `${event}: ${logEntry.message || ''}`;
    }
    
    return message;
  }
  
  formatPhaseMessage(logEntry) {
    const phase = logEntry.phase;
    let icon = '';
    let color = chalk.white;
    
    switch (phase) {
      case 'INITIATION':
        icon = '';
        color = chalk.blue;
        break;
      case 'PREPARE':
        icon = '';
        color = chalk.yellow;
        break;
      case 'COMMIT':
        icon = '';
        color = chalk.green;
        break;
      case 'ABORT':
        icon = '';
        color = chalk.red;
        break;
      case 'COMPLETION':
        icon = '';
        color = chalk.green;
        break;
    }
    
    return color(`${icon} ${phase} ${logEntry.details?.phase || ''}`);
  }
  
  formatOperationMessage(logEntry) {
    const operation = logEntry.operation;
    const message = logEntry.message || '';
    
    if (operation === 'PREPARE' || operation === 'COMMIT' || operation === 'ABORT') {
      const response = logEntry.response;
      const participant = logEntry.participant_service;
      const color = response === 'SUCCESS' ? chalk.green : chalk.red;
      const icon = response === 'SUCCESS' ? '' : '';
      
      return color(`${icon} ${operation} ${participant}: ${message}`);
    }
    
    return `${operation}: ${message}`;
  }
  
  formatAccountId(accountId) {
    if (!accountId) return 'N/A';
    // Show first 8 characters of account ID
    return chalk.cyan(accountId.substring(0, 8));
  }
  
  showAdditionalDetails(logEntry, service) {
    // Show account operation details
    if (logEntry.operation === 'BALANCE_UPDATED' && logEntry.details) {
      const details = logEntry.details;
      console.log(
        `${' '.repeat(35)}${chalk.gray('└')} Balance: ${details.old_balance} → ${chalk.green.bold(details.new_balance)}`
      );
    }
    
    // Show error details
    if (logEntry.level === 'error' && logEntry.stack) {
      const lines = logEntry.stack.split('\n').slice(0, 3);
      lines.forEach(line => {
        console.log(`${' '.repeat(35)}${chalk.red('└')} ${chalk.red(line.trim())}`);
      });
    }
  }
  
  formatRawLine(line, service, level = 'info') {
    const timestamp = moment().format('HH:mm:ss.SSS');
    const serviceColor = this.colors[service.replace('-error', '')] || chalk.white;
    const levelColor = this.colors[level] || chalk.white;
    
    return `${chalk.gray(`[${timestamp}]`)} ${serviceColor(service.padEnd(12))} ${levelColor(level.toUpperCase().padEnd(5))} ${chalk.gray('[--------]')} ${line}`;
  }
  
  stop() {
    Object.values(this.tails).forEach(tail => {
      if (tail && tail.unwatch) {
        tail.unwatch();
      }
    });
    
    console.log('\n' + chalk.cyan(' Session Summary:'));
    console.log(`   Active transactions tracked: ${this.transactions.size}`);
    
    if (this.transactions.size > 0) {
      console.log('\n' + chalk.cyan(' Transaction Status:'));
      for (const [txId, tx] of this.transactions) {
        const statusColor = tx.status === 'committed' ? chalk.green : 
                           tx.status === 'aborted' ? chalk.red : 
                           chalk.yellow;
        
        console.log(`   ${statusColor(tx.status.padEnd(10))} ${txId.substring(0, 8)} (${tx.events.length} events)`);
      }
    }
    
    console.log('');
  }
  
  // CLI commands for interactive use
  setTransactionFilter(transactionIds) {
    this.filters.transactionIds = new Set(transactionIds);
    console.log(chalk.green(` Filtering for transactions: ${Array.from(transactionIds).join(', ')}`));
  }
  
  clearFilters() {
    this.filters.transactionIds.clear();
    console.log(chalk.green(' Filters cleared'));
  }
  
  showStats() {
    console.log('\n' + ''.padEnd(50, '='));
    console.log(chalk.cyan.bold(' REAL-TIME STATISTICS'));
    console.log(''.padEnd(50, '='));
    
    console.log(`Active transactions: ${chalk.bold(this.transactions.size)}`);
    
    const statusCounts = {};
    for (const tx of this.transactions.values()) {
      statusCounts[tx.status] = (statusCounts[tx.status] || 0) + 1;
    }
    
    Object.entries(statusCounts).forEach(([status, count]) => {
      const color = status === 'committed' ? chalk.green : 
                   status === 'aborted' ? chalk.red : 
                   chalk.yellow;
      console.log(`  ${color(status)}: ${count}`);
    });
    
    console.log(''.padEnd(50, '=') + '\n');
  }
}

// Start the debugger
if (require.main === module) {
  const flowDebugger = new TransferFlowDebugger();
  flowDebugger.start();
  
  // Handle CLI commands
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', (key) => {
    if (key.toString() === 's') {
      flowDebugger.showStats();
    }
  });
}

module.exports = TransferFlowDebugger;
