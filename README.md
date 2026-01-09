# StockSight

**Your personal trading partner** - A comprehensive portfolio tracking application with Questrade integration, real-time price updates, and detailed performance analytics.

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [API Routes](#api-routes)
- [Frontend Components](#frontend-components)
- [Database Schema](#database-schema)
- [Python ETL Pipeline](#python-etl-pipeline)
- [Environment Setup](#environment-setup)
- [Key Features](#key-features)

## Overview

StockSight is a Next.js-based portfolio tracking application that allows users to:
- Track their stock portfolio with real-time price updates
- Integrate with Questrade for automatic transaction syncing
- View detailed performance metrics and charts
- Analyze portfolio allocation and profit/loss by holding
- Filter and sort holdings with search functionality
- View historical portfolio performance over time

## Tech Stack

- **Frontend**: Next.js 16.1.1, React 19.2.3, TypeScript
- **Styling**: Tailwind CSS 4
- **Charts**: Recharts 3.6.0
- **Icons**: Lucide React
- **Backend**: Next.js API Routes
- **Database**: Supabase (PostgreSQL)
- **Stock Data**: Yahoo Finance API (via `yahoo-finance2`)
- **Broker Integration**: Questrade API (OAuth 2.0)
- **Python ETL**: pandas, yfinance, supabase-py

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                    │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  src/app/page.tsx (Main Dashboard Component)          │  │
│  │  - Portfolio metrics, charts, holdings table          │  │
│  │  - Questrade integration UI                            │  │
│  └───────────────────────────────────────────────────────┘  │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        │ HTTP Requests
                        │
┌───────────────────────▼─────────────────────────────────────┐
│                    API Routes (Next.js)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Transactions │  │ Questrade    │  │ Stock Prices │      │
│  │ Portfolio    │  │ Historical   │  │ Snapshots    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        │ Database Queries
                        │
┌───────────────────────▼─────────────────────────────────────┐
│                    Supabase (PostgreSQL)                     │
│  - transactions, portfolios, portfolio_snapshots             │
│  - stock_prices_daily, questrade_connections                 │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        │ External APIs
                        │
        ┌───────────────┴───────────────┐
        │                               │
┌───────▼────────┐            ┌──────────▼──────────┐
│ Yahoo Finance │            │   Questrade API    │
│   (Prices)     │            │  (Transactions)    │
└───────────────┘            └────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│              Python ETL Pipeline (Background)                │
│  - fetch_historical_data.py (Fetch stock prices)            │
│  - calculate_snapshots.py (Calculate portfolio snapshots)    │
└─────────────────────────────────────────────────────────────┘
```

## Project Structure

```
StockSight-1/
├── src/                          # Source code
│   ├── app/                      # Next.js App Router
│   │   ├── api/                  # API Routes (Backend)
│   │   │   ├── transactions/     # Transaction CRUD operations
│   │   │   ├── questrade/        # Questrade integration
│   │   │   ├── stock-price/      # Single stock price lookup
│   │   │   ├── stock-prices/     # Bulk stock price lookup
│   │   │   ├── historical-prices/# Historical price data
│   │   │   └── portfolio-snapshots/# Portfolio snapshot data
│   │   ├── page.tsx              # Main dashboard (Frontend)
│   │   ├── layout.tsx            # Root layout
│   │   └── globals.css           # Global styles
│   └── lib/
│       └── supabase.ts           # Supabase client configuration
│
├── python-pipeline/              # Python ETL scripts
│   ├── fetch_historical_data.py  # Fetch historical stock prices
│   ├── calculate_snapshots.py    # Calculate portfolio snapshots
│   ├── clear_snapshots.py        # Utility to clear snapshots
│   ├── debug_snapshots.py        # Debug snapshot data
│   └── requirements.txt          # Python dependencies
│
├── public/                       # Static assets
├── questrade_setup.sql           # Database migration for Questrade
├── QUESTRADE_SETUP.md            # Questrade setup instructions
├── package.json                  # Node.js dependencies
└── tsconfig.json                 # TypeScript configuration
```

## API Routes

### Transaction Management

**`/api/transactions`** (`src/app/api/transactions/route.ts`)
- **GET**: Fetch all transactions for the default portfolio
- **POST**: Create a new transaction (ticker, shares, price, date)
- **DELETE**: Clear all transactions for the default portfolio

**`/api/transactions/[id]`** (`src/app/api/transactions/[id]/route.ts`)
- **DELETE**: Delete a specific transaction by ID

### Stock Price Data

**`/api/stock-price`** (`src/app/api/stock-price/route.ts`)
- **GET**: Fetch current price for a single stock ticker
- Uses Yahoo Finance API via `yahoo-finance2` package

**`/api/stock-prices`** (`src/app/api/stock-prices/route.ts`)
- **POST**: Fetch current prices for multiple stock tickers
- Accepts array of tickers, returns prices with company names

**`/api/historical-prices`** (`src/app/api/historical-prices/route.ts`)
- **POST**: Fetch historical stock prices from database
- Accepts `tickers` array and `dates` array
- Returns all available prices within the date range for forward/backward filling

### Portfolio Snapshots

**`/api/portfolio-snapshots`** (`src/app/api/portfolio-snapshots/route.ts`)
- **GET**: Fetch all portfolio snapshots for the default portfolio
- Returns historical portfolio values calculated by Python pipeline

**`/api/refresh-snapshots`** (`src/app/api/refresh-snapshots/route.ts`)
- **POST**: Trigger recalculation of portfolio snapshots (legacy endpoint)

### Questrade Integration

**`/api/questrade/link`** (`src/app/api/questrade/link/route.ts`)
- **POST**: Link Questrade account using refresh token
- Stores OAuth credentials in `questrade_connections` table
- Validates token by fetching access token from Questrade

**`/api/questrade/status`** (`src/app/api/questrade/status/route.ts`)
- **GET**: Check if Questrade account is linked
- Returns connection status

**`/api/questrade/sync`** (`src/app/api/questrade/sync/route.ts`)
- **POST**: Sync transactions from Questrade
- Fetches positions and activities from all Questrade accounts
- Converts activities to transactions and stores in database
- Handles duplicate detection and date extraction

**`/api/questrade/unlink`** (`src/app/api/questrade/unlink/route.ts`)
- **POST**: Unlink Questrade account
- Removes credentials from database

**`/api/questrade/auth`** (`src/app/api/questrade/auth/route.ts`)
- **GET**: Initiate OAuth flow (legacy, not used in personal app flow)

**`/api/questrade/callback`** (`src/app/api/questrade/callback/route.ts`)
- **GET**: OAuth callback handler (legacy, not used in personal app flow)

## Frontend Components

### Main Dashboard (`src/app/page.tsx`)

The main dashboard component contains all UI logic and state management:

#### State Management
- `transactions`: Array of all transactions
- `holdings`: Current portfolio holdings (aggregated from transactions)
- `snapshots`: Historical portfolio snapshots from database
- `filteredSnapshots`: Processed snapshots for current holdings only
- `questradeLinked`: Questrade connection status
- `timePeriod`: Selected time period filter (1M, 3M, 6M, 1Y, ALL)
- `holdingsSearch`: Search filter for holdings table
- `holdingsSortField`: Current sort column for holdings
- `holdingsSortDirection`: Sort direction (asc/desc)

#### Key Functions

**Data Fetching:**
- `fetchTransactions()`: Fetch transactions and process into holdings
- `fetchSnapshots()`: Fetch portfolio snapshots from database
- `checkQuestradeStatus()`: Check Questrade connection status

**Questrade Integration:**
- `handleLinkQuestrade()`: Link Questrade account (prompts for refresh token)
- `handleUnlinkQuestrade()`: Unlink Questrade account
- `handleSyncQuestrade()`: Sync transactions from Questrade
- `handleClearAllTransactions()`: Delete all transactions

**Portfolio Calculations:**
- `processHoldings()`: Aggregate transactions into current holdings
- `calculateMetrics()`: Calculate total value, cost, gain, daily change
- `calculateCurrentHoldingsGraph()`: Generate historical performance data for current holdings
- `calculateAllocationData()`: Prepare data for portfolio allocation pie chart
- `getBestWorstPerformers()`: Find best and worst performing stocks

**Trading Day Logic:**
- `isMarketHoliday()`: Check if a date is a US market holiday
- `isTradingDay()`: Check if a date is a trading day (weekday + not holiday)

#### UI Sections

1. **Header**: Title, Questrade buttons, Clear All Transactions
2. **Metrics Cards**: Total Portfolio Value, Today's Change, Total Invested
3. **Performance Metrics**: ROI, Best Performer, Worst Performer, Average Return
4. **Portfolio Performance Chart**: Line chart showing portfolio value over time with time period filters
5. **Portfolio Allocation Chart**: Pie chart showing allocation by holding
6. **Profit & Loss Chart**: Bar chart showing P&L by holding
7. **Holdings Table**: Sortable, searchable table of current holdings
8. **Add Transaction Form**: Form to manually add transactions

### Layout (`src/app/layout.tsx`)

Root layout component that wraps all pages:
- Sets up HTML structure
- Applies global styles
- Configures metadata

### Supabase Client (`src/lib/supabase.ts`)

Supabase client configuration:
- Initializes Supabase client with environment variables
- Provides `isSupabaseConfigured()` helper function
- Handles missing environment variables gracefully

## Database Schema

### Tables

**`portfolios`**
- `id` (UUID, Primary Key): Portfolio identifier
- `name` (TEXT): Portfolio name
- `created_at` (TIMESTAMPTZ): Creation timestamp

**`transactions`**
- `id` (UUID, Primary Key): Transaction identifier
- `portfolio_id` (UUID, Foreign Key): References portfolios
- `ticker` (TEXT): Stock symbol
- `shares` (NUMERIC): Number of shares (positive for buys, negative for sells)
- `price` (NUMERIC): Price per share
- `transaction_date` (DATE): Date of transaction
- `created_at` (TIMESTAMPTZ): Creation timestamp

**`portfolio_snapshots`**
- `portfolio_id` (UUID, Foreign Key): References portfolios
- `date` (DATE): Snapshot date
- `total_value` (NUMERIC): Total portfolio value on this date
- `total_cost` (NUMERIC): Total cost basis
- `total_gain` (NUMERIC): Total gain/loss
- Primary Key: (`portfolio_id`, `date`)
- Calculated by Python pipeline using closing prices × shares

**`stock_prices_daily`**
- `ticker` (TEXT): Stock symbol
- `date` (DATE): Price date
- `open` (NUMERIC): Opening price
- `high` (NUMERIC): High price
- `low` (NUMERIC): Low price
- `close` (NUMERIC): Closing price
- `volume` (NUMERIC): Trading volume
- Primary Key: (`ticker`, `date`)
- Populated by Python pipeline from Yahoo Finance

**`questrade_connections`**
- `id` (UUID, Primary Key): Connection identifier
- `portfolio_id` (UUID, Foreign Key): References portfolios
- `access_token` (TEXT): Questrade OAuth access token
- `refresh_token` (TEXT): Questrade OAuth refresh token
- `api_server` (TEXT): Questrade API server URL
- `expires_at` (TIMESTAMPTZ): Token expiration time
- `created_at` (TIMESTAMPTZ): Creation timestamp
- `updated_at` (TIMESTAMPTZ): Last update timestamp
- Unique constraint on `portfolio_id`

## Python ETL Pipeline

### `fetch_historical_data.py`

**Purpose**: Fetch historical stock prices from Yahoo Finance and store in database

**Process**:
1. Connects to Supabase using environment variables
2. Fetches all unique tickers from transactions table
3. Determines date range from earliest transaction to today
4. For each ticker:
   - Fetches historical prices from Yahoo Finance using `yfinance`
   - Stores prices in `stock_prices_daily` table
   - Uses upsert to prevent duplicates

**Usage**:
```bash
cd python-pipeline
python3 fetch_historical_data.py
```

### `calculate_snapshots.py`

**Purpose**: Calculate historical portfolio snapshots based on transactions and prices

**Process**:
1. Fetches all transactions for the default portfolio
2. Fetches all historical prices from database
3. Filters prices to date range from earliest transaction to today
4. For each trading day:
   - Calculates holdings up to that date
   - Gets closing prices for that date
   - Calculates portfolio value = sum(closing_price × shares) for all holdings
   - Stores snapshot in `portfolio_snapshots` table

**Usage**:
```bash
cd python-pipeline
python3 calculate_snapshots.py
```

### `clear_snapshots.py`

**Purpose**: Utility script to clear all portfolio snapshots

**Usage**:
```bash
cd python-pipeline
python3 clear_snapshots.py
```

### `debug_snapshots.py`

**Purpose**: Debug script to inspect snapshot data and compare with expected values

**Usage**:
```bash
cd python-pipeline
python3 debug_snapshots.py
```

## Environment Setup

### Required Environment Variables

Create a `.env.local` file in the root directory:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Optional: For Python pipeline (if using direct PostgreSQL connection)
# DATABASE_URL=postgresql://user:password@host:port/database
```

### Database Setup

1. **Create Supabase Project**: Set up a new Supabase project
2. **Run Migrations**: Execute `questrade_setup.sql` in Supabase SQL Editor
3. **Create Default Portfolio**: Insert a default portfolio record:
   ```sql
   INSERT INTO portfolios (id, name) VALUES (gen_random_uuid(), 'Default Portfolio');
   ```

### Python Pipeline Setup

1. **Install Dependencies**:
   ```bash
   cd python-pipeline
   pip3 install -r requirements.txt
   ```

2. **Configure Environment**: Ensure `.env.local` has Supabase credentials

3. **Run Pipeline**:
   ```bash
   # Fetch historical prices
   python3 fetch_historical_data.py
   
   # Calculate snapshots
   python3 calculate_snapshots.py
   ```

## Key Features

### 1. Portfolio Tracking

**Location**: `src/app/page.tsx`

- Aggregates transactions into current holdings
- Calculates average cost, market value, and P&L for each holding
- Updates prices in real-time (every 30 seconds)
- Displays holdings in sortable, searchable table

### 2. Questrade Integration

**Location**: `src/app/api/questrade/*`

- Personal app refresh token flow (no OAuth redirect needed)
- Syncs positions and activities from all Questrade accounts
- Extracts actual transaction dates from Questrade activities
- Handles duplicate detection and error reporting

**Setup**: See `QUESTRADE_SETUP.md` for detailed instructions

### 3. Portfolio Performance Chart

**Location**: `src/app/page.tsx` → `calculateCurrentHoldingsGraph()`

- Shows portfolio value over time for current holdings only
- Uses database snapshots when available (more accurate)
- Falls back to recalculated values for dates without snapshots
- Filters out weekends and market holidays
- Supports time period filters (1M, 3M, 6M, 1Y, ALL)

### 4. Performance Metrics

**Location**: `src/app/page.tsx` → `calculateMetrics()`, `getBestWorstPerformers()`

- Total Portfolio Value: Current market value
- Today's Change: Comparison to yesterday's close
- Total Invested: Total cost basis
- ROI: Return on investment percentage
- Best/Worst Performers: Stocks with highest/lowest returns
- Average Return: Average return across all positions

### 5. Portfolio Allocation

**Location**: `src/app/page.tsx` → `calculateAllocationData()`

- Pie chart showing portfolio allocation by holding
- Groups holdings below 5% into "Others" category
- Color-coded for easy visualization

### 6. Historical Price Management

**Location**: `python-pipeline/fetch_historical_data.py`

- Fetches historical prices from Yahoo Finance
- Stores in `stock_prices_daily` table
- Automatically determines date range from transactions
- Handles missing data gracefully

### 7. Snapshot Calculation

**Location**: `python-pipeline/calculate_snapshots.py`

- Calculates portfolio value for each trading day
- Uses closing prices × shares for accurate historical values
- Only calculates for dates with transactions
- Filters out weekends and holidays

### 8. Trading Day Logic

**Location**: `src/app/page.tsx` → `isMarketHoliday()`, `isTradingDay()`

- Detects US market holidays (New Year's, MLK Day, Presidents' Day, Good Friday, Memorial Day, Juneteenth, Independence Day, Labor Day, Thanksgiving, Christmas)
- Handles holiday adjustments (if holiday falls on weekend)
- Filters weekends and holidays from charts and snapshots

## Development

### Running the Application

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

### Running Python Pipeline

```bash
cd python-pipeline

# Fetch historical prices
python3 fetch_historical_data.py

# Calculate snapshots
python3 calculate_snapshots.py

# Clear snapshots (if needed)
python3 clear_snapshots.py
```

## File Reference Quick Guide

| Feature | File Location |
|---------|--------------|
| Main Dashboard UI | `src/app/page.tsx` |
| Transaction CRUD | `src/app/api/transactions/route.ts` |
| Questrade Link | `src/app/api/questrade/link/route.ts` |
| Questrade Sync | `src/app/api/questrade/sync/route.ts` |
| Stock Price Lookup | `src/app/api/stock-price/route.ts` |
| Historical Prices | `src/app/api/historical-prices/route.ts` |
| Portfolio Snapshots | `src/app/api/portfolio-snapshots/route.ts` |
| Supabase Config | `src/lib/supabase.ts` |
| Fetch Historical Data | `python-pipeline/fetch_historical_data.py` |
| Calculate Snapshots | `python-pipeline/calculate_snapshots.py` |
| Database Schema | `questrade_setup.sql` |

## License

Private project - All rights reserved
