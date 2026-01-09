#!/usr/bin/env python3
"""Debug portfolio snapshots to see what values are being stored"""

from supabase import create_client, Client
from dotenv import load_dotenv
import os
import pandas as pd
from datetime import datetime

# Load environment variables
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env.local'))
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))
try:
    load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '.env'))
except:
    pass

SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL') or os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY') or os.getenv('SUPABASE_ANON_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Supabase environment variables are not set!")
    exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def main():
    print("=== DEBUGGING PORTFOLIO SNAPSHOTS ===\n")
    
    # Get portfolio
    portfolio_response = supabase.table('portfolios').select('id').limit(1).execute()
    portfolio_id = portfolio_response.data[0]['id']
    print(f"Portfolio ID: {portfolio_id}\n")
    
    # Get transactions
    transactions_response = supabase.table('transactions').select(
        'ticker, shares, price, transaction_date'
    ).eq('portfolio_id', portfolio_id).order('transaction_date').execute()
    
    transactions = pd.DataFrame(transactions_response.data)
    transactions["transaction_date"] = pd.to_datetime(transactions["transaction_date"])
    
    print(f"=== TRANSACTIONS ===")
    print(f"Total transactions: {len(transactions)}")
    print(f"\nTransaction breakdown by ticker:")
    for ticker in transactions['ticker'].unique():
        ticker_txns = transactions[transactions['ticker'] == ticker]
        total_shares = ticker_txns['shares'].sum()
        print(f"  {ticker}: {len(ticker_txns)} transactions, {total_shares:.2f} total shares")
    print()
    
    # Get snapshots
    snapshots_response = supabase.table('portfolio_snapshots').select(
        'date, total_value, total_cost, total_gain'
    ).eq('portfolio_id', portfolio_id).order('date').execute()
    
    snapshots = pd.DataFrame(snapshots_response.data)
    snapshots["date"] = pd.to_datetime(snapshots["date"])
    
    print(f"=== SNAPSHOTS ===")
    print(f"Total snapshots: {len(snapshots)}")
    if len(snapshots) > 0:
        print(f"\nFirst 5 snapshots:")
        print(snapshots.head().to_string(index=False))
        print(f"\nLast 5 snapshots:")
        print(snapshots.tail().to_string(index=False))
        print(f"\nValue range:")
        print(f"  Min value: ${snapshots['total_value'].min():.2f}")
        print(f"  Max value: ${snapshots['total_value'].max():.2f}")
        print(f"  Latest value: ${snapshots['total_value'].iloc[-1]:.2f}")
        print(f"  Average value: ${snapshots['total_value'].mean():.2f}")
    
    # Get current holdings to compare
    print(f"\n=== CURRENT HOLDINGS (from transactions) ===")
    holdings = transactions.groupby("ticker", as_index=False).agg(
        total_shares=("shares", "sum")
    )
    holdings = holdings[holdings["total_shares"] > 0]
    print(f"Holdings with positive shares: {len(holdings)}")
    print(holdings.to_string(index=False))
    
    # Get latest prices for comparison
    print(f"\n=== LATEST PRICES ===")
    tickers = holdings['ticker'].tolist()
    for ticker in tickers[:10]:  # Show first 10
        prices_response = supabase.table('stock_prices_daily').select(
            'date, close'
        ).eq('ticker', ticker).order('date', desc=True).limit(1).execute()
        if prices_response.data:
            latest_price = prices_response.data[0]
            ticker_holding = holdings[holdings['ticker'] == ticker]
            if len(ticker_holding) > 0:
                shares = ticker_holding.iloc[0]['total_shares']
                value = shares * latest_price['close']
                print(f"  {ticker}: {shares:.2f} shares × ${latest_price['close']:.2f} = ${value:.2f}")
    
    # Calculate what the total should be
    print(f"\n=== EXPECTED TOTAL VALUE (latest prices) ===")
    total_expected = 0
    for ticker in tickers:
        prices_response = supabase.table('stock_prices_daily').select(
            'date, close'
        ).eq('ticker', ticker).order('date', desc=True).limit(1).execute()
        if prices_response.data:
            latest_price = prices_response.data[0]['close']
            ticker_holding = holdings[holdings['ticker'] == ticker]
            if len(ticker_holding) > 0:
                shares = ticker_holding.iloc[0]['total_shares']
                value = shares * latest_price
                total_expected += value
    
    print(f"Expected total value: ${total_expected:.2f}")
    if len(snapshots) > 0:
        print(f"Latest snapshot value: ${snapshots['total_value'].iloc[-1]:.2f}")
        print(f"Difference: ${abs(total_expected - snapshots['total_value'].iloc[-1]):.2f}")

if __name__ == "__main__":
    main()
