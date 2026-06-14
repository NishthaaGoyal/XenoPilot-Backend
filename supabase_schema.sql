-- Supabase PostgreSQL Schema for XenoPilot

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: customers
CREATE TABLE customers (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    city VARCHAR(100) NOT NULL,
    age INTEGER NOT NULL,
    gender VARCHAR(20) NOT NULL,
    preferred_channel VARCHAR(20) NOT NULL,
    total_spent FLOAT NOT NULL,
    last_purchase_date TIMESTAMP WITHOUT TIME ZONE,
    health_score FLOAT NOT NULL,
    health_status VARCHAR(20) NOT NULL,
    order_count INTEGER NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    UNIQUE (email)
);

-- Table: orders
CREATE TABLE orders (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL,
    amount FLOAT NOT NULL,
    category VARCHAR(100) NOT NULL,
    order_date TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(customer_id) REFERENCES customers (id)
);

-- Table: campaigns
CREATE TABLE campaigns (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    goal VARCHAR(255) NOT NULL,
    channel VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    audience_filters JSON,
    audience_size INTEGER NOT NULL,
    subject_line TEXT,
    message_body TEXT,
    cta VARCHAR(100),
    predicted_open_rate FLOAT,
    predicted_ctr FLOAT,
    predicted_conversion_rate FLOAT,
    prediction_confidence FLOAT,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    launched_at TIMESTAMP WITHOUT TIME ZONE,
    PRIMARY KEY (id)
);

-- Table: communications
CREATE TABLE communications (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL,
    customer_id UUID NOT NULL,
    message TEXT NOT NULL,
    channel VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(campaign_id) REFERENCES campaigns (id),
    FOREIGN KEY(customer_id) REFERENCES customers (id)
);

-- Table: events
CREATE TABLE events (
    id UUID NOT NULL DEFAULT uuid_generate_v4(),
    communication_id UUID NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    timestamp TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(communication_id) REFERENCES communications (id)
);
