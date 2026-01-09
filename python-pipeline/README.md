# Python Pipeline Setup

## Installation

1. **Create a virtual environment** (if it doesn't exist):
   ```bash
   cd python-pipeline
   python3 -m venv venv
   ```

2. **Activate the virtual environment**:
   ```bash
   source venv/bin/activate
   ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Set up environment variables**:
   Create a `.env` file in the `python-pipeline` directory (or in the root directory):
   ```
   DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@[YOUR-PROJECT-REF].supabase.co:5432/postgres
   ```
   
   **How to get your DATABASE_URL from Supabase:**
   1. Go to your Supabase Dashboard
   2. Select your project
   3. Go to **Settings** → **Database**
   4. Scroll down to **Connection string** section
   5. Copy the **URI** connection string (it starts with `postgresql://`)
   6. Replace `[YOUR-PASSWORD]` with your actual database password
   7. Paste it into your `.env` file as `DATABASE_URL=...`
   
   **Note:** This is different from the REST API URL. You need the PostgreSQL connection string.

## Running the Pipeline

1. **Fetch historical prices**:
   ```bash
   source venv/bin/activate
   python fetch_historical_data.py
   ```

2. **Calculate portfolio snapshots**:
   ```bash
   source venv/bin/activate
   python calculate_snapshots.py
   ```

## What it does

- `fetch_historical_data.py`: Fetches the last 3 years of historical stock prices for all tickers in your portfolio and stores them in the `stock_prices_daily` table
- `calculate_snapshots.py`: Calculates portfolio snapshots for each date based on transactions and historical prices
