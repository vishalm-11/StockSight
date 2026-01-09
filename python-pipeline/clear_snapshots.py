#!/usr/bin/env python3
"""Clear all portfolio snapshots from Supabase"""

from supabase import create_client, Client
from dotenv import load_dotenv
import os

# Load environment variables
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env.local'))
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))
try:
    load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '.env'))
except:
    pass

# Supabase connection
SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL') or os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY') or os.getenv('SUPABASE_ANON_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Supabase environment variables are not set!")
    exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def main():
    print("Clearing all portfolio snapshots...")
    
    # Get the default portfolio
    portfolio_response = supabase.table('portfolios').select('id').limit(1).execute()
    
    if not portfolio_response.data or len(portfolio_response.data) == 0:
        print("ERROR: No portfolio found")
        return
    
    portfolio_id = portfolio_response.data[0]['id']
    print(f"Portfolio ID: {portfolio_id}")
    
    # Count existing snapshots
    count_response = supabase.table('portfolio_snapshots').select('id', count='exact').eq('portfolio_id', portfolio_id).execute()
    snapshot_count = count_response.count if hasattr(count_response, 'count') else 0
    
    if snapshot_count == 0:
        print("No snapshots found to delete.")
        return
    
    print(f"Found {snapshot_count} snapshots to delete...")
    
    # Delete all snapshots for this portfolio
    delete_response = supabase.table('portfolio_snapshots').delete().eq('portfolio_id', portfolio_id).execute()
    
    print(f"✓ Deleted all portfolio snapshots")
    print(f"  You can now run calculate_snapshots.py to recalculate them.")

if __name__ == "__main__":
    main()
