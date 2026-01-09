import { NextResponse } from 'next/server';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

const QUESTRADE_TOKEN_URL = 'https://login.questrade.com/oauth2/token';

export async function POST(request: Request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: 'Missing Supabase environment variables' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const refreshToken = body.refreshToken as string | undefined;

    if (!refreshToken) {
      return NextResponse.json(
        { error: 'refreshToken is required' },
        { status: 400 }
      );
    }

    // Exchange refresh token for access token + api_server
    const tokenUrl = `${QUESTRADE_TOKEN_URL}?grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`;

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Questrade token error:', errorText);
      return NextResponse.json(
        { error: 'Failed to exchange refresh token with Questrade' },
        { status: 500 }
      );
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token: newRefreshToken, api_server, expires_in } = tokenData;

    // Get the default portfolio to link Questrade to
    const { data: portfolio, error: portfolioError } = await supabase
      .from('portfolios')
      .select('id')
      .single();

    if (portfolioError || !portfolio) {
      console.error('Portfolio error:', portfolioError);
      return NextResponse.json({ error: 'No portfolio found' }, { status: 404 });
    }

    // Store Questrade credentials (in a real app, encrypt these)
    const { error: insertError } = await supabase
      .from('questrade_connections')
      .upsert({
        portfolio_id: portfolio.id,
        access_token: access_token,
        refresh_token: newRefreshToken || refreshToken,
        api_server: api_server,
        expires_at: new Date(Date.now() + (expires_in * 1000)).toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'portfolio_id'
      });

    if (insertError) {
      console.error('Error storing Questrade credentials:', insertError);
      return NextResponse.json({ error: 'Failed to store Questrade credentials' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error linking Questrade (personal app):', error);
    return NextResponse.json(
      { error: error.message || 'Failed to link Questrade account' },
      { status: 500 }
    );
  }
}

