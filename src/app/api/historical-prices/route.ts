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

    // Format dates for reference (we'll fetch ALL prices and filter on frontend)
    const formattedDates = dates.map((date: string | Date) => {
      const d = typeof date === 'string' ? new Date(date) : date;
      return d.toISOString().split('T')[0];
    });

    // Get the date range (earliest to latest) for reference
    const sortedDates = formattedDates.sort();
    const earliestDate = sortedDates[0];
    const latestDate = sortedDates[sortedDates.length - 1];

    // Query ALL historical prices for the specified tickers
    // We'll fetch all available prices and let the frontend do forward-fill/backward-fill
    // This ensures we get prices even if exact dates don't match
    const { data: allData, error } = await supabase
      .from('stock_prices_daily')
      .select('ticker, date, close')
      .in('ticker', tickers)
      .order('date', { ascending: true });

    if (error) {
      console.error('Error fetching historical prices:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Normalize all dates to YYYY-MM-DD format for consistent comparison
    const normalized = (allData || []).map((price: any) => {
      let priceDate: string;
      
      // Handle different date formats from database
      if (price.date instanceof Date) {
        priceDate = price.date.toISOString().split('T')[0];
      } else if (typeof price.date === 'string') {
        // Try to parse the date string
        const parsed = new Date(price.date);
        if (!isNaN(parsed.getTime())) {
          priceDate = parsed.toISOString().split('T')[0];
        } else {
          // If it's already in YYYY-MM-DD format, use it directly
          priceDate = price.date.split('T')[0];
        }
      } else {
        priceDate = '';
      }
      
      return {
        ...price,
        date: priceDate,
      };
    }).filter((price: any) => price.date && price.close); // Filter out any invalid dates or missing prices

    console.log(`Fetched ${normalized.length} historical prices for ${tickers.length} tickers (date range: ${earliestDate} to ${latestDate})`);

    // Return ALL prices for these tickers (not filtered by date)
    // Frontend will handle forward-fill/backward-fill for missing dates
    return NextResponse.json(normalized);
  } catch (error: any) {
    console.error('POST /api/historical-prices error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch historical prices' },
      { status: 500 }
    );
  }
}
