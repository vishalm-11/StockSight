import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const { tickers } = await request.json();

  if (!tickers || !Array.isArray(tickers)) {
    return NextResponse.json({ error: 'Tickers array required' }, { status: 400 });
  }

  try {
    const pricePromises = tickers.map(async (ticker) => {
      try {
        // Using Yahoo Finance query1 API (unofficial but works)
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`;
        const res = await fetch(url);
        const data = await res.json();
        
        const quote = data.chart.result[0];
        const meta = quote.meta;
        
        return {
          ticker: meta.symbol,
          price: meta.regularMarketPrice,
          name: meta.longName || meta.shortName || ticker,
        };
      } catch (error) {
        console.error(`Error fetching ${ticker}:`, error);
        return null;
      }
    });

    const results = await Promise.all(pricePromises);
    const prices = results.filter((p) => p !== null);

    return NextResponse.json(prices);
  } catch (error) {
    console.error('Error fetching stock prices:', error);
    return NextResponse.json({ error: 'Failed to fetch stock prices' }, { status: 500 });
  }
}