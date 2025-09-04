-- Initialize Transactions Database
-- This script runs automatically when the transactions-db container starts

-- Create custom ENUM type for transaction status
CREATE TYPE transaction_status AS ENUM (
    'pending',
    'committed',
    'aborted'
);

-- Create the transactions table
CREATE TABLE transactions (
    transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_account_id UUID NOT NULL,
    destination_account_id UUID NOT NULL,
    amount DECIMAL(19, 4) NOT NULL CHECK (amount > 0),
    status transaction_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_transactions_source_account ON transactions(source_account_id);
CREATE INDEX idx_transactions_destination_account ON transactions(destination_account_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);

-- Create a composite index for account-specific transaction history
CREATE INDEX idx_transactions_account_history ON transactions(source_account_id, created_at DESC);
CREATE INDEX idx_transactions_account_history_dest ON transactions(destination_account_id, created_at DESC);

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_transactions_updated_at 
    BEFORE UPDATE ON transactions 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Create a function to validate transaction business rules
CREATE OR REPLACE FUNCTION validate_transaction()
RETURNS TRIGGER AS $$
BEGIN
    -- Ensure source and destination accounts are different
    IF NEW.source_account_id = NEW.destination_account_id THEN
        RAISE EXCEPTION 'Source and destination accounts must be different';
    END IF;
    
    -- Ensure amount is positive
    IF NEW.amount <= 0 THEN
        RAISE EXCEPTION 'Transaction amount must be positive';
    END IF;
    
    -- Prevent status changes from committed or aborted back to pending
    IF TG_OP = 'UPDATE' THEN
        IF OLD.status IN ('committed', 'aborted') AND NEW.status = 'pending' THEN
            RAISE EXCEPTION 'Cannot change transaction status from % back to pending', OLD.status;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to validate transactions
CREATE TRIGGER validate_transactions 
    BEFORE INSERT OR UPDATE ON transactions 
    FOR EACH ROW 
    EXECUTE FUNCTION validate_transaction();
