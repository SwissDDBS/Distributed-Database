-- Initialize Customer Database
-- This script runs automatically when the customer-db container starts

-- Create the customers table
CREATE TABLE customers (
    customer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    address TEXT,
    contact_info JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create an index on customer name for faster lookups
CREATE INDEX idx_customers_name ON customers(name);

-- Create an index on contact_info for JSONB queries
CREATE INDEX idx_customers_contact_info ON customers USING GIN (contact_info);

-- Insert some sample customers for testing
INSERT INTO customers (customer_id, name, address, contact_info) VALUES
    ('550e8400-e29b-41d4-a716-446655440001', 'Alice Johnson', '123 Main St, Springfield, IL', '{"email": "alice.johnson@example.com", "phone": "+15551234567"}'),
    ('550e8400-e29b-41d4-a716-446655440002', 'Bob Smith', '456 Oak Ave, Chicago, IL', '{"email": "bob.smith@example.com", "phone": "+15559876543"}'),
    ('550e8400-e29b-41d4-a716-446655440003', 'Carol Davis', '789 Pine Rd, Peoria, IL', '{"email": "carol.davis@example.com", "phone": "+15555551234"}');

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_customers_updated_at 
    BEFORE UPDATE ON customers 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
