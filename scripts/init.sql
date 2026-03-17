-- Create schemas for Car Wash System
-- PostgreSQL initialization script

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(20) UNIQUE,
    email VARCHAR(255) UNIQUE,
    password TEXT,
    name VARCHAR(255),
    balance INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'active',
    role VARCHAR(20) DEFAULT 'user',
    token TEXT,
    refresh_token TEXT,
    token_expires TIMESTAMP,
    otp_code TEXT,
    otp_expires TIMESTAMP,
    otp_type VARCHAR(10),
    pending_qr_ref TEXT,
    pending_qr_amount DECIMAL(10, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Machines table
CREATE TABLE IF NOT EXISTS machines (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'idle',
    pending_command TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    machine_id INTEGER REFERENCES machines(id) ON DELETE CASCADE,
    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reserved_amount INTEGER,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    action_type VARCHAR(50),
    amount INTEGER,
    machine_id INTEGER REFERENCES machines(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_token ON users(token);
CREATE INDEX idx_machines_status ON machines(status);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_machine_id ON sessions(machine_id);
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_machine_id ON transactions(machine_id);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);

-- Insert default machines (Bay 1-6)
INSERT INTO machines (name, status) VALUES
    ('Bay 1', 'idle'),
    ('Bay 2', 'idle'),
    ('Bay 3', 'idle'),
    ('Bay 4', 'idle'),
    ('Bay 5', 'idle'),
    ('Bay 6', 'idle')
ON CONFLICT DO NOTHING;

-- Create function for updating updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_machines_updated_at BEFORE UPDATE ON machines
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create view for machine status with user info
CREATE OR REPLACE VIEW vw_machine_status AS
SELECT 
    m.id,
    m.name,
    m.status,
    s.id as session_id,
    s.start_time,
    s.reserved_amount,
    u.id as user_id,
    u.name as user_name,
    u.phone as user_phone,
    u.email as user_email,
    u.balance as user_balance
FROM machines m
LEFT JOIN sessions s ON s.id = (
    SELECT id FROM sessions 
    WHERE machine_id = m.id AND status = 'active'
    ORDER BY id DESC LIMIT 1
)
LEFT JOIN users u ON u.id = s.user_id;

GRANT SELECT ON vw_machine_status TO postgres;
