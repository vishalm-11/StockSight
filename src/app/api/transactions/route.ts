import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  const body = await request.json();
  const { ticker, shares, price, date } = body;

  // Get the default portfolio (we'll add multi-portfolio support later)
  const { data: portfolio } = await supabase
    .from('portfolios')
    .select('id')
    .single();

  if (!portfolio) {
    return NextResponse.json({ error: 'No portfolio found' }, { status: 404 });
  }

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      portfolio_id: portfolio.id,
      ticker: ticker.toUpperCase(),
      shares: parseFloat(shares),
      price: parseFloat(price),
      transaction_date: date,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function GET() {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .order('transaction_date', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}