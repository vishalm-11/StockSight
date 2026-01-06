import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  // Get the default portfolio
  const { data: portfolio } = await supabase
    .from('portfolios')
    .select('id')
    .single();

  if (!portfolio) {
    return NextResponse.json({ error: 'No portfolio found' }, { status: 404 });
  }

  const { data, error } = await supabase
    .from('portfolio_snapshots')
    .select('*')
    .eq('portfolio_id', portfolio.id)
    .order('date', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}