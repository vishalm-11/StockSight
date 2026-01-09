# Questrade Integration Setup

This guide will help you set up Questrade account linking for StockSight.

## Prerequisites

1. A Questrade account
2. Access to your Supabase database
3. Environment variables configured

## Step 1: Register Your Application with Questrade

1. Log in to your Questrade account
2. Navigate to **API Centre** from the top-right menu
3. Click **"Activate API"** and agree to the terms
4. Select **"Register a personal app"**
5. Provide a name and description for your application (e.g., "StockSight Portfolio Tracker")
6. Save the application to obtain your **Client ID**

## Step 2: Set Up Database

Run the SQL migration to create the `questrade_connections` table:

```sql
-- See questrade_setup.sql file
```

Or run it directly in your Supabase SQL editor.

## Step 3: Configure Environment Variables

Add the following to your `.env.local` file:

```env
QUESTRADE_CLIENT_ID=your_client_id_here
```

## Step 4: Update Redirect URI in Questrade

1. Go back to Questrade API Centre
2. Edit your application
3. Add the following redirect URI:
   ```
   http://localhost:3000/api/questrade/callback
   ```
   (For production, use your production URL)

## Step 5: Test the Integration

1. Start your development server
2. Click **"Link Questrade Account"** button on the dashboard
3. You'll be redirected to Questrade to authorize the connection
4. After authorization, you'll be redirected back to StockSight
5. Click **"Sync Questrade"** to import your portfolio data

## How It Works

1. **Linking**: Users click "Link Questrade Account" → OAuth flow → Credentials stored securely
2. **Syncing**: Users click "Sync Questrade" → Fetches positions and balances → Updates portfolio
3. **Auto-refresh**: Tokens are automatically refreshed when they expire

## Security Notes

- Access tokens are stored in the database (consider encrypting in production)
- Tokens expire after a set time and are automatically refreshed
- Users can unlink their account at any time

## API Endpoints

- `GET /api/questrade/auth` - Get authorization URL
- `GET /api/questrade/callback` - OAuth callback handler
- `GET /api/questrade/status` - Check connection status
- `POST /api/questrade/sync` - Sync portfolio data
- `POST /api/questrade/unlink` - Unlink account

## Troubleshooting

- **"Questrade client ID not configured"**: Make sure `QUESTRADE_CLIENT_ID` is set in `.env.local`
- **"Failed to exchange token"**: Check that redirect URI matches exactly in Questrade settings
- **"No accounts found"**: Ensure your Questrade account has active positions
