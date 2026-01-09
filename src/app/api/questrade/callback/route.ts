import { NextResponse } from 'next/server';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

const QUESTRADE_TOKEN_URL = 'https://login.questrade.com/oauth2/token';

export async function GET(request: Request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.redirect(new URL('/?error=config', request.url));
    }

    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      return NextResponse.redirect(new URL(`/?error=${error}`, request.url));
    }

    if (!code) {
      return NextResponse.redirect(new URL('/?error=no_code', request.url));
    }

    // Exchange authorization code for tokens
    const redirectUri = `${new URL(request.url).origin}/api/questrade/callback`;
    const tokenResponse = await fetch(QUESTRADE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Questrade token error:', errorText);
      return NextResponse.redirect(new URL('/?error=token_exchange_failed', request.url));
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, api_server } = tokenData;

    // Get the default portfolio to link Questrade to
    const { data: portfolio, error: portfolioError } = await supabase
      .from('portfolios')
      .select('id')
      .single();

    if (portfolioError || !portfolio) {
      console.error('Portfolio error:', portfolioError);
      return NextResponse.redirect(new URL('/?error=no_portfolio', request.url));
    }

    // Store Questrade credentials (in a real app, encrypt these)
    const { error: insertError } = await supabase
      .from('questrade_connections')
      .upsert({
        portfolio_id: portfolio.id,
        access_token: access_token,
        refresh_token: refresh_token,
        api_server: api_server,
        expires_at: new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'portfolio_id'
      });

    if (insertError) {
      console.error('Error storing Questrade credentials:', insertError);
      return NextResponse.redirect(new URL('/?error=storage_failed', request.url));
    }

    return NextResponse.redirect(new URL('/?questrade_linked=true', request.url));
  } catch (error: any) {
    console.error('Error in Questrade callback:', error);
    return NextResponse.redirect(new URL('/?error=callback_error', request.url));
  }
}
