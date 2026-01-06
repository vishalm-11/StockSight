import pandas as pd
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
import os

# -------------------- SETUP --------------------

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)

# -------------------- EXTRACT --------------------

def get_transactions():
    # 🚨 IMPORTANT: DO NOT SELECT t.*
    query = """
    SELECT
        t.id,
        t.ticker,
        t.shares,
        t.price,
        t.transaction_date,
        p.id AS portfolio_id
    FROM transactions t
    JOIN portfolios p ON t.portfolio_id = p.id
    ORDER BY t.transaction_date
    """
    return pd.read_sql(query, engine)

def get_historical_prices():
    query = """
    SELECT ticker, date, close
    FROM stock_prices_daily
    ORDER BY date
    """
    return pd.read_sql(query, engine)

# -------------------- TRANSFORM --------------------

def calculate_portfolio_value_on_date(transactions, prices, target_date):
    txns = transactions[transactions["transaction_date"] <= target_date]

    if txns.empty:
        return None

    holdings = (
        txns.groupby("ticker", as_index=False)
        .agg(
            total_shares=("shares", "sum"),
            total_cost=("price", lambda p: (p * txns.loc[p.index, "shares"]).sum())
        )
    )

    holdings["avg_cost"] = holdings["total_cost"] / holdings["total_shares"]

    date_prices = prices[prices["date"] == target_date]

    portfolio = holdings.merge(date_prices, on="ticker", how="left")

    portfolio["price_to_use"] = portfolio["close"].fillna(portfolio["avg_cost"])
    portfolio["market_value"] = portfolio["total_shares"] * portfolio["price_to_use"]

    total_value = float(portfolio["market_value"].sum())
    total_cost = float(portfolio["total_cost"].sum())

    return {
        "date": target_date.date(),
        "total_value": round(total_value, 2),
        "total_cost": round(total_cost, 2),
        "total_gain": round(total_value - total_cost, 2),
    }

# -------------------- LOAD --------------------

def store_snapshot(portfolio_id, snapshot):
    query = text("""
        INSERT INTO portfolio_snapshots (
            portfolio_id,
            date,
            total_value,
            total_cost,
            total_gain
        )
        VALUES (
            :portfolio_id,
            :date,
            :total_value,
            :total_cost,
            :total_gain
        )
        ON CONFLICT (portfolio_id, date) DO UPDATE SET
            total_value = EXCLUDED.total_value,
            total_cost = EXCLUDED.total_cost,
            total_gain = EXCLUDED.total_gain
    """)

    with engine.begin() as conn:
        conn.execute(query, {
            "portfolio_id": portfolio_id,  # UUID scalar ✅
            "date": snapshot["date"],
            "total_value": snapshot["total_value"],
            "total_cost": snapshot["total_cost"],
            "total_gain": snapshot["total_gain"],
        })

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

    unique_dates = sorted(prices["date"].unique())
    print(f"Calculating snapshots for {len(unique_dates)} dates...")

    count = 0
    for date in unique_dates:
        snapshot = calculate_portfolio_value_on_date(transactions, prices, date)

        if snapshot:
            store_snapshot(portfolio_id, snapshot)
            count += 1

            if count % 50 == 0:
                print(f"Processed {count} snapshots...")

    print(f"✓ Created {count} portfolio snapshots")

# -------------------- ENTRY --------------------

if __name__ == "__main__":
    main()
