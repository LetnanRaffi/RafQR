-- Analytics tables for RafQR
-- Run this in your Supabase SQL Editor

-- Create analytics_visits table to track daily visitors
CREATE TABLE IF NOT EXISTS analytics_visits (
  id BIGSERIAL PRIMARY KEY,
  visit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create analytics_transfers table to track file transfers
CREATE TABLE IF NOT EXISTS analytics_transfers (
  id BIGSERIAL PRIMARY KEY,
  transfer_date DATE NOT NULL DEFAULT CURRENT_DATE,
  file_id TEXT NOT NULL,
  transferred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_visits_date ON analytics_visits(visit_date);
CREATE INDEX IF NOT EXISTS idx_transfers_date ON analytics_transfers(transfer_date);
CREATE INDEX IF NOT EXISTS idx_transfers_file_id ON analytics_transfers(file_id);

-- Enable Row Level Security (RLS)
ALTER TABLE analytics_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_transfers ENABLE ROW LEVEL SECURITY;

-- Create policies to allow public inserts (for tracking)
-- Only allow inserts, no select/update/delete for public
CREATE POLICY "Allow public insert visits" ON analytics_visits
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public insert transfers" ON analytics_transfers
  FOR INSERT
  WITH CHECK (true);

-- Allow service role to read all data
CREATE POLICY "Service role can read all visits" ON analytics_visits
  FOR SELECT
  USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role can read all transfers" ON analytics_transfers
  FOR SELECT
  USING (auth.jwt()->>'role' = 'service_role');

-- Create view for easy analytics dashboard (optional)
CREATE OR REPLACE VIEW analytics_summary AS
SELECT 
  COALESCE(v.visitors_today, 0) as visitors_today,
  COALESCE(t.total_transfers, 0) as total_transfers,
  COALESCE(t.transfers_today, 0) as transfers_today
FROM (
  SELECT COUNT(*) as visitors_today
  FROM analytics_visits
  WHERE visit_date = CURRENT_DATE
) v
CROSS JOIN (
  SELECT 
    COUNT(*) as total_transfers,
    COUNT(*) FILTER (WHERE transfer_date = CURRENT_DATE) as transfers_today
  FROM analytics_transfers
) t;
