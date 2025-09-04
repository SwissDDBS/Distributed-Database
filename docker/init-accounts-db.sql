-- Initialize Accounts Database
-- This script runs automatically when the accounts-db container starts

-- Create the accounts table with 2PC support
CREATE TABLE accounts (
    account_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL,
    balance DECIMAL(19, 4) NOT NULL CHECK (balance >= 0),
    
    -- Two-Phase Commit (2PC) columns
    transaction_lock UUID UNIQUE,
    pending_change DECIMAL(19, 4),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_accounts_customer_id ON accounts(customer_id);
CREATE INDEX idx_accounts_transaction_lock ON accounts(transaction_lock);

-- Insert sample accounts for testing
INSERT INTO accounts (account_id, customer_id, balance) VALUES
    ('660e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', 1000.00),
    ('660e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440001', 500.00),
    ('660e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440002', 750.00),
    ('660e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440002', 250.00),
    ('660e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440003', 1500.00);

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_accounts_updated_at 
    BEFORE UPDATE ON accounts 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Create a function to validate 2PC operations
CREATE OR REPLACE FUNCTION validate_2pc_operation()
RETURNS TRIGGER AS $$
BEGIN
    -- Ensure that pending_change is only set when transaction_lock is also set
    IF NEW.pending_change IS NOT NULL AND NEW.transaction_lock IS NULL THEN
        RAISE EXCEPTION 'pending_change cannot be set without transaction_lock';
    END IF;
    
    -- Ensure that transaction_lock is unique across all accounts
    IF NEW.transaction_lock IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM accounts 
            WHERE transaction_lock = NEW.transaction_lock 
            AND account_id != NEW.account_id
        ) THEN
            RAISE EXCEPTION 'transaction_lock must be unique across all accounts';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to validate 2PC operations
CREATE TRIGGER validate_accounts_2pc 
    BEFORE INSERT OR UPDATE ON accounts 
    FOR EACH ROW 
    EXECUTE FUNCTION validate_2pc_operation();
