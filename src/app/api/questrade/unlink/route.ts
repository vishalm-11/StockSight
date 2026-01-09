import { NextResponse } from 'next/server';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export async function POST() {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: 'Missing Supabase environment variables' },
        { status: 500 }
      );
    }

    const { data: portfolio } = await supabase
      .from('portfolios')
      .select('id')
      .single();

    if (!portfolio) {
      return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 });
    }

    const { error } = await supabase
      .from('questrade_connections')
      .delete()
      .eq('portfolio_id', portfolio.id);

    if (error) {
      console.error('Error unlinking Questrade:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to unlink account' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error unlinking Questrade:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to unlink account' },
      { status: 500 }
    );
  }
}
