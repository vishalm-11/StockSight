import { NextResponse } from 'next/server';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: 'Missing Supabase environment variables' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { tickers, dates } = body;

    if (!tickers || !Array.isArray(tickers) || !dates || !Array.isArray(dates)) {
      return NextResponse.json(
        { error: 'Tickers and dates arrays required' },
        { status: 400 }
      );
    }

    // Format dates for SQL query (YYYY-MM-DD)
    // Handle both string dates and Date objects
    const formattedDates = dates.map((date: string | Date) => {
      const d = typeof date === 'string' ? new Date(date) : date;
      return d.toISOString().split('T')[0];
    });

    // Query historical prices for the specified tickers and dates
    // Note: Supabase might store dates differently, so we'll query and filter
    const { data: allData, error } = await supabase
      .from('stock_prices_daily')
      .select('ticker, date, close')
      .in('ticker', tickers);

    if (error) {
      console.error('Error fetching historical prices:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Filter by dates (handling different date formats)
    const filtered = (allData || []).filter((price: any) => {
      const priceDate = new Date(price.date).toISOString().split('T')[0];
      return formattedDates.includes(priceDate);
    });

    return NextResponse.json(filtered);
  } catch (error: any) {
    console.error('POST /api/historical-prices error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch historical prices' },
      { status: 500 }
    );
  }
}
