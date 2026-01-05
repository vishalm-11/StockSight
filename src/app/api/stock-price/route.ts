import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker');

  if (!ticker) {
    return NextResponse.json({ error: 'Ticker required' }, { status: 400 });
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`;
    const res = await fetch(url);
    const data = await res.json();
    
    const quote = data.chart.result[0];
    const meta = quote.meta;
    
    return NextResponse.json({
      ticker: meta.symbol,
      price: meta.regularMarketPrice,
      name: meta.longName || meta.shortName || ticker,
      change: meta.regularMarketChange || 0,
      changePercent: meta.regularMarketChangePercent || 0,
    });
  } catch (error) {
    console.error('Error fetching stock price:', error);
    return NextResponse.json({ error: 'Failed to fetch stock price' }, { status: 500 });
  }
}