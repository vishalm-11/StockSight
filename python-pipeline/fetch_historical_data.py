import yfinance as yf
import pandas as pd
from supabase import create_client, Client
from dotenv import load_dotenv
import os
from datetime import datetime, timedelta

# Load environment variables
# Try loading from .env.local (Next.js standard), then .env, then python-pipeline/.env
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env.local'))
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))
try:
    load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '.env'))
except:
    pass  # Ignore if python-pipeline/.env doesn't exist

# Supabase connection using same credentials as Next.js app
SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL') or os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY') or os.getenv('SUPABASE_ANON_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Supabase environment variables are not set!")
    print("\nPlease set these in your .env.local file (in the root directory) or .env file:")
    print("NEXT_PUBLIC_SUPABASE_URL=https://[YOUR-PROJECT-REF].supabase.co")
    print("NEXT_PUBLIC_SUPABASE_ANON_KEY=[YOUR-ANON-KEY]")
    print("\nYou can find these in:")
    print("Supabase Dashboard -> Project Settings -> API")
    exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def get_portfolio_tickers():
    """Fetch unique tickers from transactions table"""
    response = supabase.table('transactions').select('ticker').execute()
    tickers = list(set([row['ticker'] for row in response.data]))
    return tickers

def fetch_historical_prices(ticker, start_date, end_date):
    """Fetch historical stock prices using yfinance"""
    try:
        stock = yf.Ticker(ticker)
        # yfinance expects dates in YYYY-MM-DD format
        hist = stock.history(start=start_date.strftime('%Y-%m-%d'), end=end_date.strftime('%Y-%m-%d'))
        
        if hist.empty:
            print(f"  No data for {ticker} in date range {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}")
            return None
        
        hist = hist.reset_index()
        hist['ticker'] = ticker
        hist = hist.rename(columns={
            'Date': 'date',
            'Open': 'open',
            'High': 'high',
            'Low': 'low',
            'Close': 'close',
            'Volume': 'volume'
        })
        
        # Log date range for debugging
        if len(hist) > 0:
            print(f"  Fetched {len(hist)} records for {ticker}: {hist['date'].min().strftime('%Y-%m-%d')} to {hist['date'].max().strftime('%Y-%m-%d')}")
        
        return hist[['ticker', 'date', 'open', 'high', 'low', 'close', 'volume']]
    
    except Exception as e:
        print(f"Error fetching {ticker}: {e}")
        return None

def store_prices(df):
    """Store historical prices in database"""
    if df is None or df.empty:
        return
    
    # Convert date column to ISO 8601 string format for Supabase (YYYY-MM-DD)
    if 'date' in df.columns:
        df['date'] = pd.to_datetime(df['date']).dt.strftime('%Y-%m-%d')
    
    # Convert DataFrame to list of dictionaries for Supabase insert
    records = df.to_dict('records')
    
    # Insert in batches (Supabase has limits on batch size)
    batch_size = 1000
    for i in range(0, len(records), batch_size):
        batch = records[i:i + batch_size]
        try:
            # Use upsert to avoid duplicates (on conflict do nothing)
            response = supabase.table('stock_prices_daily').upsert(
                batch,
                on_conflict='ticker,date'
            ).execute()
            if response.data:
                print(f"  Inserted/Updated {len(response.data)} records in batch {i//batch_size + 1}")
        except Exception as e:
            print(f"Error inserting batch {i//batch_size + 1}: {e}")
            # Try inserting one by one if batch fails (more detailed error logging)
            for record in batch:
                try:
                    supabase.table('stock_prices_daily').upsert(
                        record,
                        on_conflict='ticker,date'
                    ).execute()
                except Exception as single_error:
                    print(f"Error inserting {record.get('ticker', 'unknown')} on {record.get('date', 'unknown')}: {single_error}")

def main():
    print("Starting ETL pipeline...")
    
    # Get all tickers from portfolio
    tickers = get_portfolio_tickers()
    print(f"Found {len(tickers)} unique tickers: {tickers}")
    
    # Get transaction date range to ensure we fetch prices for all relevant dates
    transactions_response = supabase.table('transactions').select('transaction_date').order('transaction_date', desc=True).limit(1000).execute()
    
    today = datetime.now()
    
    if transactions_response.data and len(transactions_response.data) > 0:
        # Parse transaction dates (they're stored as YYYY-MM-DD strings)
        transaction_dates = []
        for t in transactions_response.data:
            date_str = t['transaction_date']
            # Handle both date strings and datetime objects
            if isinstance(date_str, str):
                try:
                    # Try parsing YYYY-MM-DD format (remove time if present)
                    date_only = date_str.split('T')[0].split(' ')[0]
                    dt = datetime.strptime(date_only, '%Y-%m-%d')
                    transaction_dates.append(dt)
                except Exception as e:
                    print(f"Warning: Could not parse transaction date '{date_str}': {e}")
        
        if transaction_dates:
            earliest_transaction_date = min(transaction_dates)
            latest_transaction_date = max(transaction_dates)
            
            print(f"\nTransaction date range:")
            print(f"  Earliest: {earliest_transaction_date.strftime('%Y-%m-%d')}")
            print(f"  Latest: {latest_transaction_date.strftime('%Y-%m-%d')}")
            print(f"  Today: {today.strftime('%Y-%m-%d')}")
            
            # Fetch prices from earliest transaction date to today (can't fetch future prices)
            # Start 1 week before earliest transaction to ensure we have prices for the first transaction
            start_date = earliest_transaction_date - timedelta(days=7)
            end_date = today
            
            # But don't go further back than 3 years unless needed
            min_start = today - timedelta(days=1095)  # 3 years ago
            if start_date < min_start:
                print(f"  Note: Extending start date to {min_start.strftime('%Y-%m-%d')} (3 years back)")
                start_date = min_start
        else:
            # Fallback: last 3 years
            end_date = today
            start_date = end_date - timedelta(days=1095)
            print("Could not parse transaction dates, fetching last 3 years as default")
    else:
        # No transactions yet, fetch last 3 years as default
        end_date = today
        start_date = end_date - timedelta(days=1095)  # 3 years
        print("No transactions found, fetching last 3 years of data")
    
    print(f"\nFetching historical prices from {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}")
    
    for ticker in tickers:
        print(f"Processing {ticker}...")
        df = fetch_historical_prices(ticker, start_date, end_date)
        
        if df is not None:
            store_prices(df)
            print(f"✓ Stored {len(df)} records for {ticker}")
    
    print("ETL pipeline complete!")

if __name__ == "__main__":
    main()