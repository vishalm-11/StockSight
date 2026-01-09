-- Create questrade_connections table to store Questrade OAuth credentials
CREATE TABLE IF NOT EXISTS questrade_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  api_server TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(portfolio_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_questrade_connections_portfolio_id ON questrade_connections(portfolio_id);

-- Add comment
COMMENT ON TABLE questrade_connections IS 'Stores Questrade OAuth credentials for linked accounts';
