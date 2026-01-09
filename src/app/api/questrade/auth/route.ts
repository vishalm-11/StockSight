import { NextResponse } from 'next/server';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

const QUESTRADE_AUTH_URL = 'https://login.questrade.com/oauth2/authorize';
const QUESTRADE_CLIENT_ID = process.env.QUESTRADE_CLIENT_ID || '';

export async function GET(request: Request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: 'Missing Supabase environment variables' },
        { status: 500 }
      );
    }

    if (!QUESTRADE_CLIENT_ID) {
      return NextResponse.json(
        { error: 'Questrade client ID not configured' },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const redirectUri = searchParams.get('redirect_uri') || `${request.headers.get('origin')}/api/questrade/callback`;

    // Generate state for CSRF protection
    const state = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

    // Build Questrade authorization URL
    const authUrl = new URL(QUESTRADE_AUTH_URL);
    authUrl.searchParams.set('client_id', QUESTRADE_CLIENT_ID);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);

    return NextResponse.json({
      authUrl: authUrl.toString(),
      state
    });
  } catch (error: any) {
    console.error('Error generating Questrade auth URL:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate auth URL' },
      { status: 500 }
    );
  }
}
