import pandas as pd
from supabase import create_client, Client
from dotenv import load_dotenv
import os
from datetime import datetime

# -------------------- SETUP --------------------

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

# -------------------- EXTRACT --------------------

def get_transactions():
    """Fetch transactions with portfolio ID from Supabase"""
    # Get the default portfolio first
    portfolio_response = supabase.table('portfolios').select('id').limit(1).execute()
    
    if not portfolio_response.data or len(portfolio_response.data) == 0:
        print("ERROR: No portfolio found")
        return pd.DataFrame()
    
    portfolio_id = portfolio_response.data[0]['id']
    
    # Get transactions for this portfolio
    transactions_response = supabase.table('transactions').select(
        'id, ticker, shares, price, transaction_date, portfolio_id'
    ).eq('portfolio_id', portfolio_id).order('transaction_date').execute()
    
    if not transactions_response.data:
        return pd.DataFrame()
    
    # Convert to DataFrame
    df = pd.DataFrame(transactions_response.data)
    # Add portfolio_id if not present (for backwards compatibility)
    if 'portfolio_id' not in df.columns:
        df['portfolio_id'] = portfolio_id
    
    return df

def get_historical_prices():
    """Fetch historical prices from Supabase"""
    # Fetch all prices - need to get all records, not just first 1000
    # Supabase has a default limit, so we need to paginate or increase limit
    all_prices = []
    page_size = 1000
    offset = 0
    has_more = True
    
    while has_more:
        prices_response = supabase.table('stock_prices_daily').select(
            'ticker, date, close'
        ).order('date', desc=False).range(offset, offset + page_size - 1).execute()
        
        if not prices_response.data or len(prices_response.data) == 0:
            has_more = False
        else:
            all_prices.extend(prices_response.data)
            offset += page_size
            # If we got less than page_size, we're done
            if len(prices_response.data) < page_size:
                has_more = False
    
    if not all_prices:
        print("Warning: No prices found in database!")
        return pd.DataFrame()
    
    df = pd.DataFrame(all_prices)
    print(f"Fetched {len(df)} price records from database")
    if len(df) > 0:
        # Convert date column to datetime for sorting/comparison
        df['date'] = pd.to_datetime(df['date'])
        print(f"  Date range: {df['date'].min().strftime('%Y-%m-%d')} to {df['date'].max().strftime('%Y-%m-%d')}")
    
    return df

# -------------------- TRANSFORM --------------------

def calculate_portfolio_value_on_date(transactions, prices, target_date):
    """Calculate portfolio value on a specific date"""
    # Get all transactions up to and including the target date
    txns = transactions[transactions["transaction_date"] <= target_date].copy()

    if txns.empty:
        return None

    # Calculate cost for each transaction: price * shares
    # For buys (positive shares): cost is positive (money spent)
    # For sells (negative shares): cost is negative (money received)
    txns['cost'] = txns['price'] * txns['shares']
    
    # Group by ticker to calculate:
    # - total_shares: net shares owned (sum of all share transactions, can be negative if sold more than bought)
    # - total_cost: net cost (sum of price * shares for all transactions)
    #   This represents total money spent minus money received from sells
    holdings = (
        txns.groupby("ticker", as_index=False)
        .agg(
            total_shares=("shares", "sum"),
            total_cost=("cost", "sum")  # Net cost: (buy_price * buy_shares) - (sell_price * sell_shares)
        )
    )

    # Filter out holdings with zero or negative shares (completely sold positions)
    holdings = holdings[holdings["total_shares"] > 0]

    if holdings.empty:
        return None

    # Get closing prices for the target date
    # Ensure date formats match for comparison
    if isinstance(target_date, pd.Timestamp):
        target_date_compare = target_date
    else:
        target_date_compare = pd.to_datetime(target_date)
    
    date_prices = prices[prices["date"] == target_date_compare].copy()

    if date_prices.empty:
        return None

    # Merge holdings with prices for that date
    # Use inner join to only include holdings that have prices
    portfolio = holdings.merge(date_prices, on="ticker", how="inner")

    if portfolio.empty:
        return None

    # Calculate market value for each holding: closing_price × shares_owned
    # For each stock: market_value = closing_price × number of shares
    portfolio["market_value"] = portfolio["close"] * portfolio["total_shares"]

    # Total portfolio value = sum of (closing_price × shares) for ALL holdings
    # This is exactly what you want: for each day, closing price × shares, summed across all holdings
    total_value = float(portfolio["market_value"].sum())
    
    # Total cost = net cost basis (what you paid minus what you received from sells)
    total_cost = float(portfolio["total_cost"].sum())

    # Convert date to ISO string format for Supabase (YYYY-MM-DD)
    if isinstance(target_date, pd.Timestamp):
        date_str = target_date.strftime('%Y-%m-%d')
    elif isinstance(target_date, datetime):
        date_str = target_date.strftime('%Y-%m-%d')
    else:
        date_str = str(target_date)
    
    return {
        "date": date_str,
        "total_value": round(total_value, 2),
        "total_cost": round(total_cost, 2),
        "total_gain": round(total_value - total_cost, 2),
    }

# -------------------- LOAD --------------------

def store_snapshot(portfolio_id, snapshot):
    """Store snapshot in Supabase using upsert"""
    try:
        # Use upsert to avoid duplicates (on conflict do update)
        response = supabase.table('portfolio_snapshots').upsert({
            "portfolio_id": portfolio_id,
            "date": snapshot["date"],
            "total_value": snapshot["total_value"],
            "total_cost": snapshot["total_cost"],
            "total_gain": snapshot["total_gain"],
        }, on_conflict='portfolio_id,date').execute()
        
        if not response.data:
            print(f"Warning: No data returned when storing snapshot for {snapshot['date']}")
    except Exception as e:
        print(f"Error storing snapshot for {snapshot['date']}: {e}")

# -------------------- MAIN --------------------

def main():
    print("Calculating portfolio snapshots...")

    transactions = get_transactions()
    prices = get_historical_prices()

    if transactions.empty:
        print("No transactions found.")
        return

    transactions["transaction_date"] = pd.to_datetime(transactions["transaction_date"])
    prices["date"] = pd.to_datetime(prices["date"])

    # ✅ NOW this is truly a scalar UUID
    portfolio_id = transactions["portfolio_id"].iat[0]
    print(f"Portfolio ID: {portfolio_id}")
    print(f"Found {len(transactions)} transactions")
    print(f"Found {len(prices)} price records")
    
    # Find the earliest and latest transaction dates
    earliest_transaction_date = transactions["transaction_date"].min()
    latest_transaction_date = transactions["transaction_date"].max()
    print(f"Earliest transaction date: {earliest_transaction_date.strftime('%Y-%m-%d')}")
    print(f"Latest transaction date: {latest_transaction_date.strftime('%Y-%m-%d')}")
    
    # Start calculating snapshots from August 1, 2025 onwards
    start_date = pd.Timestamp('2025-08-01').normalize()
    print(f"Calculating snapshots from: {start_date.strftime('%Y-%m-%d')} onwards")
    
    # Filter prices to only include dates >= start_date (August 1, 2025) and <= today
    # (we can't calculate snapshots for future dates without prices)
    from datetime import date
    today = pd.Timestamp.now().normalize()
    prices_filtered = prices[
        (prices["date"] >= start_date) & 
        (prices["date"] <= today)
    ]
    print(f"Price records between first transaction and today: {len(prices_filtered)}")
    
    if len(prices_filtered) == 0:
        print("ERROR: No price data available for transaction date range!")
        print(f"  Need prices from {earliest_transaction_date.strftime('%Y-%m-%d')} to {today.strftime('%Y-%m-%d')}")
        print(f"  But prices only cover: {prices['date'].min().strftime('%Y-%m-%d')} to {prices['date'].max().strftime('%Y-%m-%d')}")
        return

    # Get unique dates from filtered prices
    unique_dates = sorted(prices_filtered["date"].unique())
    print(f"Calculating snapshots for {len(unique_dates)} dates...")

    count = 0
    skipped = 0
    
    # Show sample calculation for debugging
    if len(unique_dates) > 0:
        sample_date = unique_dates[0]
        print(f"\nSample calculation for {sample_date.strftime('%Y-%m-%d')}:")
        sample_txns = transactions[transactions["transaction_date"] <= sample_date].copy()
        if len(sample_txns) > 0:
            sample_txns['cost'] = sample_txns['price'] * sample_txns['shares']
            sample_holdings = sample_txns.groupby("ticker", as_index=False).agg(
                total_shares=("shares", "sum"),
                total_cost=("cost", "sum")
            )
            sample_holdings = sample_holdings[sample_holdings["total_shares"] > 0]
            sample_date_prices = prices[prices["date"] == sample_date].copy()
            sample_portfolio = sample_holdings.merge(sample_date_prices, on="ticker", how="inner")
            if len(sample_portfolio) > 0:
                sample_portfolio["market_value"] = sample_portfolio["close"] * sample_portfolio["total_shares"]
                print(f"  Holdings: {len(sample_portfolio)}")
                print(f"  Sample: {sample_portfolio[['ticker', 'total_shares', 'close', 'market_value']].head().to_string()}")
                print(f"  Total value: ${sample_portfolio['market_value'].sum():.2f}")
    
    for date in unique_dates:
        snapshot = calculate_portfolio_value_on_date(transactions, prices, date)

        if snapshot:
            store_snapshot(portfolio_id, snapshot)
            count += 1

            if count % 50 == 0:
                print(f"Processed {count} snapshots...")
        else:
            skipped += 1
            if skipped <= 5:  # Only print first 5 skipped reasons
                print(f"  Skipped snapshot for {date.strftime('%Y-%m-%d')}: No valid snapshot data")

    print(f"\n✓ Created {count} portfolio snapshots")
    if skipped > 0:
        print(f"  Skipped {skipped} dates")

# -------------------- ENTRY --------------------

if __name__ == "__main__":
    main()
