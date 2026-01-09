import { NextResponse } from 'next/server';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export async function GET() {
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
      return NextResponse.json({ linked: false });
    }

    const { data: connection } = await supabase
      .from('questrade_connections')
      .select('*')
      .eq('portfolio_id', portfolio.id)
      .single();

    if (!connection) {
      return NextResponse.json({ linked: false });
    }

    return NextResponse.json({
      linked: true,
      expiresAt: connection.expires_at,
      isExpired: new Date(connection.expires_at) <= new Date(),
    });
  } catch (error: any) {
    console.error('Error checking Questrade status:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to check status' },
      { status: 500 }
    );
  }
}
