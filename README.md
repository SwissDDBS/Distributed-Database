#  Distributed Banking Database System

A **production-grade** distributed banking database system demonstrating advanced distributed systems concepts including **Two-Phase Commit protocol**, **microservices architecture**, and **atomic transactions** across multiple services.

Built with **Node.js**, **TypeScript**, **PostgreSQL**, and **Drizzle ORM**.

##  Architecture Overview

This system implements a distributed banking database using three independent microservices:

- **Customer Service** (`port 3001`): Manages customer profile information
- **Accounts Service** (`port 3002`): Handles account balances and implements Two-Phase Commit protocol
- **Transactions Service** (`port 3003`): Orchestrates fund transfers as the 2PC coordinator

Each service runs independently with its own dedicated PostgreSQL database.

##  Technology Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript
- **API Framework**: Express.js
- **Database**: PostgreSQL 15
- **ORM**: Drizzle ORM
- **Authentication**: JWT (JSON Web Tokens)
- **Logging**: Winston
- **Development**: tsx (TypeScript execution)

##  Project Structure

```
dis_db/
├── services/
│   ├── accounts-service/          # Account balance management + 2PC participant
│   ├── transactions-service/      # Transaction coordinator (2PC orchestrator)
│   └── customer-service/          # Customer profile management
├── client/                        # CLI application for interacting with services
├── shared/                        # Shared types and utilities
├── logs/                          # Application logs (created at runtime)
├── scripts/                       # Setup and utility scripts
├── docs/                          # Documentation
└── README.md                      # This file
```

##  Quick Start

### Prerequisites

- **Node.js 18+** 
- **PostgreSQL 15+**
- **npm** or **yarn**

### 1. Clone and Setup

```bash
git clone <repository-url>
cd dis_db

# Install root dependencies
npm install

# Install all service dependencies
npm run install:all
```

### 2. Database Setup

```bash
# Create PostgreSQL databases
createdb customer_db
createdb accounts_db  
createdb transactions_db

# Run database migrations
npm run db:migrate

# Seed with sample data
node scripts/seed-data.js
```

### 3. Start Services

```bash
# Start all services in development mode
npm run dev

# Or start individually:
npm run dev:customer     # Port 3001
npm run dev:accounts     # Port 3002  
npm run dev:transactions # Port 3003
```

### 4. Generate Test Tokens

```bash
# Generate JWT tokens for testing
node scripts/generate-tokens.js
```

### 5. Test the System

```bash
# Start the CLI client
cd client
npm run interactive

# Or run demos
npm run test:race-condition
npm run test:two-phase-commit
```

##  CLI Client Usage

### Interactive Mode (Recommended)

```bash
cd client
npm run interactive

# Follow the prompts to:
# 1. Login with your credentials  
# 2. View your profile and accounts
# 3. Transfer money between accounts
# 4. Check transaction history
# 5. Monitor service health
```

### Command Line Interface

```bash
# Authentication
banking-cli login -u alice-customer -r customer
banking-cli logout

# Banking Operations  
banking-cli profile
banking-cli accounts
banking-cli balance -a 660e8400-e29b-41d4-a716-446655440001
banking-cli transfer -f <source> -t <dest> -a 100

# Utilities
banking-cli health
banking-cli tokens
```

##  REST API Examples

### Authentication
All API calls require JWT authentication. Get tokens using:
```bash
node scripts/generate-tokens.js
```

### Customer Service (Port 3001)
```bash
# Get customer profile
curl -H "Authorization: Bearer <token>" \
     http://localhost:3001/customers/550e8400-e29b-41d4-a716-446655440001

# Create customer (teller/admin only)
curl -X POST -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     -d '{"name":"John Doe","address":"123 Main St","contact_info":{"email":"john@example.com","phone":"+1234567890"}}' \
     http://localhost:3001/customers
```

### Accounts Service (Port 3002)
```bash
# Get account balance
curl -H "Authorization: Bearer <token>" \
     http://localhost:3002/accounts/660e8400-e29b-41d4-a716-446655440001

# Get customer's accounts
curl -H "Authorization: Bearer <token>" \
     http://localhost:3002/accounts/customer/550e8400-e29b-41d4-a716-446655440001
```

### Transactions Service (Port 3003)
```bash
# Transfer funds (Two-Phase Commit)
curl -X POST -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     -d '{
       "source_account_id": "660e8400-e29b-41d4-a716-446655440001",
       "destination_account_id": "660e8400-e29b-41d4-a716-446655440003", 
       "amount": 100.00
     }' \
     http://localhost:3003/transfers

# Check transaction status
curl -H "Authorization: Bearer <token>" \
     http://localhost:3003/transfers/status/<transaction-id>
```

##  Testing & Demonstrations

This system includes comprehensive test scenarios demonstrating distributed systems concepts:

### 1. Race Condition Demonstration

Shows why atomic operations are crucial in banking systems:

```bash
# JavaScript version (detailed analysis)
node scripts/test-race-condition.js

# CLI version
cd client && npm run test:race-condition

# CLI demo command
banking-cli demo --race-condition
```

**What it demonstrates:**
- Two concurrent $100 withdrawals from account with $150
- **Expected**: One succeeds, one fails (balance: $50)  
- **Race condition**: Both succeed (balance: -$50) 
- **Solution**: Use 2PC protocol for atomicity 

### 2. Two-Phase Commit Protocol

Demonstrates atomic distributed transactions:

```bash
# JavaScript comprehensive test suite
node scripts/test-concurrent-operations.js

# CLI version  
cd client && npm run test:two-phase-commit

# CLI demo command
banking-cli demo --concurrent
```

**Test scenarios:**
-  **Concurrent Safe Transfers**: Multiple 2PC transfers simultaneously
-  **Mixed Operations**: Safe 2PC vs unsafe operations  
-  **High Concurrency**: Stress testing with 10+ concurrent transfers

### 3. Interactive Testing

```bash
# Start interactive CLI for manual testing
cd client && npm run interactive

# Test various scenarios:
# - Login as different users (customer/teller/admin)
# - Create accounts and customers
# - Perform transfers and check balances
# - Monitor transaction history
```

##  Security Features

### Authentication
- JWT-based authentication for all API endpoints
- Token validation middleware on protected routes
- Role-based access control (customer, teller, admin)

### Authorization
- Customer ownership validation
- Service-to-service authentication
- Resource access control based on JWT payload

### Sample JWT Payload
```json
{
  "customer_id": "550e8400-e29b-41d4-a716-446655440001",
  "role": "customer",
  "iat": 1640995200,
  "exp": 1640998800
}
```

##  Two-Phase Commit Protocol Implementation

This system implements a complete 2PC protocol ensuring **ACID properties** across distributed services:

### Architecture
- **Coordinator**: Transactions Service (port 3003)
- **Participants**: Accounts Service (port 3002)  
- **Protocol**: Prepare → Vote → Commit/Abort

### Phase 1: Prepare (Voting Phase)
```
Client → Transactions Service: Transfer Request
  ↓
Transactions Service → Accounts Service: PREPARE debit (source)
Transactions Service → Accounts Service: PREPARE credit (destination)  
  ↓
Accounts Service validates & locks resources
  ↓
Accounts Service → Transactions Service: VOTE-COMMIT or VOTE-ABORT
```

### Phase 2: Decision Phase
```
If ALL participants vote COMMIT:
  Transactions Service → Accounts Service: COMMIT
  Accounts Service applies changes & releases locks
  
If ANY participant votes ABORT:  
  Transactions Service → Accounts Service: ABORT
  Accounts Service discards changes & releases locks
```

### Error Handling
- **Network failures**: Automatic retry with timeout
- **Participant failures**: Graceful abort with cleanup
- **Coordinator failures**: Transaction status logging for recovery
- **Inconsistent states**: Critical error logging with manual intervention alerts

##  Database Schema

### Customer Database
```sql
CREATE TABLE customers (
    customer_id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT,
    contact_info JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Accounts Database
```sql
CREATE TABLE accounts (
    account_id UUID PRIMARY KEY,
    customer_id UUID NOT NULL,
    balance DECIMAL(19, 4) CHECK (balance >= 0),
    transaction_lock UUID UNIQUE,      -- 2PC lock
    pending_change DECIMAL(19, 4),     -- 2PC pending change
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Transactions Database
```sql
CREATE TYPE transaction_status AS ENUM ('pending', 'committed', 'aborted');

CREATE TABLE transactions (
    transaction_id UUID PRIMARY KEY,
    source_account_id UUID NOT NULL,
    destination_account_id UUID NOT NULL,
    amount DECIMAL(19, 4) CHECK (amount > 0),
    status transaction_status DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

##  Logging & Auditability

### Structured Logging
All services use Winston for structured JSON logging:

```json
{
  "timestamp": "2024-01-01T12:00:00.000Z",
  "transaction_id": "770e8400-e29b-41d4-a716-446655440001",
  "service_name": "TransactionsService",
  "event": "TRANSACTION_INITIATED",
  "details": {
    "source_account": "660e8400-e29b-41d4-a716-446655440001",
    "destination_account": "660e8400-e29b-41d4-a716-446655440003",
    "amount": 100.00
  },
  "level": "info"
}
```

### Log Files
- `logs/transactions.log`: All transaction-related events
- `logs/accounts.log`: Account balance changes and 2PC events
- `logs/customers.log`: Customer service events
- `logs/error.log`: Error events across all services

##  Development Commands

### Service Management
```bash
# Development (hot reload)
npm run dev                    # Start all services
npm run dev:customer          # Customer Service (port 3001)
npm run dev:accounts          # Accounts Service (port 3002)  
npm run dev:transactions      # Transactions Service (port 3003)

# Building
npm run build                 # Build all services
npm run build:customer        # Build specific service
npm run build:accounts
npm run build:transactions
```

### Database Operations
```bash
# Setup and migrations
node scripts/setup-databases.js    # Setup all databases
npm run db:migrate                 # Run all migrations
npm run db:migrate:customer        # Run specific migration
node scripts/seed-data.js          # Seed sample data

# Drizzle Studio (database GUI)
cd services/customer-service && npm run db:studio
```

### Testing & Demonstrations
```bash
# Generate test tokens
node scripts/generate-tokens.js

# Race condition demos
node scripts/test-race-condition.js
cd client && npm run test:race-condition

# 2PC protocol tests  
node scripts/test-concurrent-operations.js
cd client && npm run test:two-phase-commit

# CLI client
cd client && npm run interactive
cd client && npm run cli -- --help
```

### Monitoring & Health
```bash
# Check all services
curl http://localhost:3001/health  # Customer
curl http://localhost:3002/health  # Accounts  
curl http://localhost:3003/health  # Transactions

# CLI health check
cd client && npm run cli health
```

##  Configuration

### Service Configuration
Each service can be configured via environment variables or config files in `src/config/`.

### Database Configuration
Database connections are configured in each service's Drizzle configuration file.

##  Monitoring & Health Checks

Each service exposes health check endpoints:
- `GET /health`: Basic health status
- `GET /metrics`: Service metrics (if implemented)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Troubleshooting

### Common Issues

1. **Database Connection Failed**
   - Ensure PostgreSQL containers are running
   - Check database credentials in environment variables

2. **Service Not Responding**
   - Check if all dependencies are installed
   - Verify port availability
   - Check service logs in the `logs/` directory

3. **JWT Authentication Failed**
   - Ensure JWT_SECRET is set consistently across services
   - Check token expiration

### Getting Help

- Check the logs in the `logs/` directory
- Ensure all services are healthy via `/health` endpoints

## Educational Objectives

This project demonstrates:

1. **Distributed Systems Concepts**
   - Microservices architecture
   - Service-to-service communication
   - Database per service pattern

2. **Transaction Management**
   - Two-Phase Commit protocol
   - ACID properties in distributed systems
   - Race condition prevention

3. **Security Best Practices**
   - JWT authentication
   - Role-based authorization
   - Secure service communication

4. **Software Engineering**
   - TypeScript for type safety
   - Structured logging
   - API design patterns
