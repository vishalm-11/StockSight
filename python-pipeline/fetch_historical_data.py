import yfinance as yf
import pandas as pd
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
import os
from datetime import datetime, timedelta

# Load environment variables
load_dotenv()

# Database connection
DATABASE_URL = os.getenv('DATABASE_URL')
engine = create_engine(DATABASE_URL)

def get_portfolio_tickers():
    """Fetch unique tickers from transactions table"""
    query = "SELECT DISTINCT ticker FROM transactions"
    with engine.connect() as conn:
        result = conn.execute(text(query))
        tickers = [row[0] for row in result]
    return tickers

def fetch_historical_prices(ticker, start_date, end_date):
    """Fetch historical stock prices using yfinance"""
    try:
        stock = yf.Ticker(ticker)
        hist = stock.history(start=start_date, end=end_date)
        
        if hist.empty:
            print(f"No data for {ticker}")
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
        
        return hist[['ticker', 'date', 'open', 'high', 'low', 'close', 'volume']]
    
    except Exception as e:
        print(f"Error fetching {ticker}: {e}")
        return None

def store_prices(df):
    """Store historical prices in database"""
    if df is None or df.empty:
        return
    
    # Insert into database (on conflict do nothing - avoid duplicates)
    df.to_sql(
        'stock_prices_daily',
        engine,
        if_exists='append',
        index=False,
        method='multi'
    )

def main():
    print("Starting ETL pipeline...")
    
    # Get all tickers from portfolio
    tickers = get_portfolio_tickers()
    print(f"Found {len(tickers)} unique tickers: {tickers}")
    
    # Fetch last 1 year of data
    end_date = datetime.now()
    start_date = end_date - timedelta(days=365)
    
    print(f"Fetching data from {start_date.date()} to {end_date.date()}")
    
    for ticker in tickers:
        print(f"Processing {ticker}...")
        df = fetch_historical_prices(ticker, start_date, end_date)
        
        if df is not None:
            store_prices(df)
            print(f"✓ Stored {len(df)} records for {ticker}")
    
    print("ETL pipeline complete!")

if __name__ == "__main__":
    main()