import { NextResponse } from 'next/server';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

async function getQuestradeCredentials() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const { data: portfolio } = await supabase
    .from('portfolios')
    .select('id')
    .single();

  if (!portfolio) return null;

  const { data: connection } = await supabase
    .from('questrade_connections')
    .select('*')
    .eq('portfolio_id', portfolio.id)
    .single();

  return connection;
}

async function refreshAccessToken(refreshToken: string, apiServer: string) {
  const tokenUrl = `${apiServer}/v1/oauth/token?grant_type=refresh_token&refresh_token=${refreshToken}`;
  
  const response = await fetch(tokenUrl, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error('Failed to refresh token');
  }

  return await response.json();
}

export async function POST() {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: 'Missing Supabase environment variables' },
        { status: 500 }
      );
    }

    const connection = await getQuestradeCredentials();
    
    if (!connection) {
      return NextResponse.json(
        { error: 'Questrade account not linked' },
        { status: 404 }
      );
    }

    // Check if token needs refresh
    let accessToken = connection.access_token;
    let apiServer = connection.api_server;
    
    // Ensure api_server doesn't have trailing slash for consistency
    if (apiServer && apiServer.endsWith('/')) {
      apiServer = apiServer.slice(0, -1);
    }
    
    console.log('Using api_server:', apiServer);
    console.log('Token expires at:', connection.expires_at);
    console.log('Token expired?', new Date(connection.expires_at) <= new Date());
    
    if (new Date(connection.expires_at) <= new Date()) {
      console.log('Refreshing expired token...');
      const tokenData = await refreshAccessToken(connection.refresh_token, apiServer);
      accessToken = tokenData.access_token;
      apiServer = tokenData.api_server;
      
      // Ensure no trailing slash
      if (apiServer && apiServer.endsWith('/')) {
        apiServer = apiServer.slice(0, -1);
      }

      // Update stored credentials
      await supabase
        .from('questrade_connections')
        .update({
          access_token: accessToken,
          api_server: apiServer,
          expires_at: new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString(),
        })
        .eq('portfolio_id', connection.portfolio_id);
      
      console.log('Token refreshed, new api_server:', apiServer);
    }

    // Fetch accounts
    const accountsResponse = await fetch(`${apiServer}/v1/accounts`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!accountsResponse.ok) {
      const errorText = await accountsResponse.text();
      console.error('Questrade accounts error:', accountsResponse.status, errorText);
      throw new Error(`Failed to fetch Questrade accounts: ${accountsResponse.status} - ${errorText}`);
    }

    const accountsData = await accountsResponse.json();
    const accounts = accountsData.accounts;

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ error: 'No accounts found' }, { status: 404 });
    }

    console.log(`Found ${accounts.length} Questrade accounts`);

    // Fetch positions and activities from ALL accounts
    const allPositions: any[] = [];
    const allBalances: any[] = [];
    const allActivities: any[] = [];
    const activitiesApiResponses: any[] = []; // Store API responses for debugging

    // Calculate start date - fetch ALL historical activities (go back 10 years to be safe)
    // Questrade activities API might need a longer range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(endDate.getFullYear() - 10); // Increased from 5 to 10 years
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    for (const account of accounts) {
      const accountNumber = account.number;
      console.log(`Fetching data for account: ${accountNumber} (${account.type})`);

      // Fetch activities (historical transactions) for this account
      // Try WITHOUT date range first - some APIs return all activities if no dates are specified
      // If that fails or returns 0, try with date range
      let activitiesUrl = `${apiServer}/v1/accounts/${accountNumber}/activities`;
      console.log(`  Attempting to fetch activities WITHOUT date range first`);
      console.log(`  Activities URL: ${activitiesUrl}`);
      
      let activitiesResponse = await fetch(activitiesUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      console.log(`  Activities API response status (no dates): ${activitiesResponse.status}`);
      
      let activities: any[] = [];
      let activitiesData: any = null;
      
      if (activitiesResponse.ok) {
        activitiesData = await activitiesResponse.json();
        activities = activitiesData.activities || [];
        console.log(`  Found ${activities.length} activities (without date range)`);
        
        if (activities.length === 0) {
          // Try with date range as fallback
          console.log(`  No activities found without date range, trying with date range: ${startDateStr} to ${endDateStr}`);
          activitiesUrl = `${apiServer}/v1/accounts/${accountNumber}/activities?startTime=${startDateStr}T00:00:00-05:00&endTime=${endDateStr}T23:59:59-05:00`;
          console.log(`  Activities URL (with dates): ${activitiesUrl}`);
          
          activitiesResponse = await fetch(activitiesUrl, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          });
          
          console.log(`  Activities API response status (with dates): ${activitiesResponse.status}`);
          
          if (activitiesResponse.ok) {
            activitiesData = await activitiesResponse.json();
            activities = activitiesData.activities || [];
            console.log(`  Found ${activities.length} activities (with date range)`);
          } else {
            let errorText = '';
            try {
              errorText = await activitiesResponse.text();
            } catch (e) {
              errorText = 'Could not read error response';
            }
            console.error(`  ERROR: Failed to fetch activities with date range:`, {
              status: activitiesResponse.status,
              statusText: activitiesResponse.statusText,
              error: errorText
            });
          }
        }
      } else {
        // Try with date range as fallback if no-date-range request fails
        console.log(`  Request without dates failed (status ${activitiesResponse.status}), trying with date range: ${startDateStr} to ${endDateStr}`);
        activitiesUrl = `${apiServer}/v1/accounts/${accountNumber}/activities?startTime=${startDateStr}T00:00:00-05:00&endTime=${endDateStr}T23:59:59-05:00`;
        console.log(`  Activities URL (with dates): ${activitiesUrl}`);
        
        activitiesResponse = await fetch(activitiesUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });
        
        console.log(`  Activities API response status (with dates): ${activitiesResponse.status}`);
        
        if (activitiesResponse.ok) {
          activitiesData = await activitiesResponse.json();
          activities = activitiesData.activities || [];
          console.log(`  Found ${activities.length} activities (with date range)`);
        } else {
          let errorText = '';
          try {
            errorText = await activitiesResponse.text();
          } catch (e) {
            errorText = 'Could not read error response';
          }
          console.error(`  ERROR: Failed to fetch activities for account ${accountNumber}:`, {
            status: activitiesResponse.status,
            statusText: activitiesResponse.statusText,
            error: errorText,
            headers: Object.fromEntries(activitiesResponse.headers.entries())
          });
        }
      }
      
      // Store response for debugging - we'll include this in the error response
      const accountResponseDebug: any = {
        accountNumber: accountNumber,
        url: activitiesUrl,
      };
      
      if (activitiesData) {
        accountResponseDebug.response = {
          keys: Object.keys(activitiesData),
          hasActivities: !!activitiesData.activities,
          activitiesIsArray: Array.isArray(activitiesData.activities),
          activitiesType: typeof activitiesData.activities,
          activitiesLength: activities?.length || 0,
          fullResponse: activitiesData, // Include full response for debugging
        };
        
        console.log(`\n  === ACTIVITIES API RESPONSE FOR ACCOUNT ${accountNumber} ===`);
        console.log(`  Response keys:`, Object.keys(activitiesData));
        console.log(`  Has 'activities' field:`, !!activitiesData.activities);
        console.log(`  Activities is array:`, Array.isArray(activitiesData.activities));
        console.log(`  Activities type:`, typeof activitiesData.activities);
        console.log(`  Activities length:`, activities?.length || 0);
        console.log(`  Full response structure:`, JSON.stringify(activitiesData, null, 2));
        console.log(`  === END RESPONSE ===\n`);
      } else {
        let errorText = '';
        if (!activitiesResponse.ok) {
          try {
            errorText = await activitiesResponse.text();
          } catch (e) {
            errorText = 'Could not read error response';
          }
        }
        
        accountResponseDebug.error = {
          status: activitiesResponse.status,
          statusText: activitiesResponse.statusText,
          errorText: errorText,
        };
        
        console.error(`  ERROR: No activitiesData received for account ${accountNumber}`);
        console.error(`  Response status: ${activitiesResponse.status}`);
        if (errorText) {
          console.error(`  Error response:`, errorText);
        }
      }
      
      // Store this account's response for debugging
      activitiesApiResponses.push(accountResponseDebug);
      
      if (activities.length > 0) {
        // Add account info to each activity
        activities.forEach((act: any) => {
          act.accountNumber = accountNumber;
        });
        
        allActivities.push(...activities);
        console.log(`  ✓ Added ${activities.length} activities for account ${accountNumber}`);
        console.log(`  Sample activity structure:`, JSON.stringify(activities[0], null, 2));
        
        // Log all activity types to see what we're getting
        const activityTypes = activities.map((a: any) => a.type || 'unknown');
        const uniqueTypes = [...new Set(activityTypes)];
        console.log(`  Activity types found: ${uniqueTypes.join(', ')}`);
        console.log(`  Total activities found so far: ${allActivities.length}`);
      } else {
        console.warn(`  ⚠️  WARNING: No activities found for account ${accountNumber}!`);
        console.warn(`  This could mean:`);
        console.warn(`  1. The account has no trade history`);
        console.warn(`  2. The activities API requires different parameters`);
        console.warn(`  3. The date range excludes all activities`);
        if (activitiesData) {
          console.warn(`  Full response:`, JSON.stringify(activitiesData, null, 2));
        }
      }

      // Fetch positions for this account (for current snapshot)
      const positionsResponse = await fetch(`${apiServer}/v1/accounts/${accountNumber}/positions`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (positionsResponse.ok) {
        const positionsData = await positionsResponse.json();
        const positions = positionsData.positions || [];
        console.log(`  Found ${positions.length} positions in account ${accountNumber}`);
        
        if (positions.length > 0) {
          console.log(`  Sample position:`, JSON.stringify(positions[0], null, 2));
        }
        
        // Add account info to each position for tracking
        positions.forEach((pos: any) => {
          pos.accountNumber = accountNumber;
          pos.accountType = account.type;
        });
        
        allPositions.push(...positions);
      } else {
        const errorText = await positionsResponse.text();
        console.warn(`  Failed to fetch positions for account ${accountNumber}:`, {
          status: positionsResponse.status,
          error: errorText
        });
      }

      // Fetch account balances
      const balancesResponse = await fetch(`${apiServer}/v1/accounts/${accountNumber}/balances`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (balancesResponse.ok) {
        const balancesData = await balancesResponse.json();
        if (balancesData) {
          balancesData.accountNumber = accountNumber;
          allBalances.push(balancesData);
        }
      }
    }

    const positions = allPositions;
    const activities = allActivities;
    
    console.log(`Total positions across all accounts: ${positions.length}`);
    console.log(`Total trade activities found: ${activities.length}`);
    
    if (positions.length > 0) {
      console.log('Sample position:', JSON.stringify(positions[0], null, 2));
    }
    if (activities.length > 0) {
      console.log('\n=== QUESTRADE ACTIVITIES DEBUG ===');
      console.log('Sample activity (full structure):', JSON.stringify(activities[0], null, 2));
      console.log('Sample activity keys:', Object.keys(activities[0]));
      console.log('First 3 activities:', activities.slice(0, 3).map((a: any, i: number) => ({
        index: i,
        type: a.type,
        symbol: a.symbol,
        hasExecutionLegs: !!a.executionLegs,
        executionLegsCount: a.executionLegs?.length || 0,
        keys: Object.keys(a),
        dateFields: {
          tradeDate: a.tradeDate,
          transactionDate: a.transactionDate,
          date: a.date,
          tradeDateTime: a.tradeDateTime,
        }
      })));
      console.log('================================\n');
    }
    
    // Log activity types to see what we're getting
    const activityTypes = activities.map((a: any) => a.type || 'unknown');
    const typeCounts = activityTypes.reduce((acc: any, type: string) => {
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});
    console.log('Activity types found:', typeCounts);

    // Sync positions as transactions/holdings
    const { data: portfolio } = await supabase
      .from('portfolios')
      .select('id')
      .single();

    if (!portfolio) {
      return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 });
    }

    // Get existing transactions to check for duplicates
    const { data: existingTransactions } = await supabase
      .from('transactions')
      .select('*')
      .eq('portfolio_id', portfolio.id);

    const syncedPositions = [];
    const transactionsToAdd = [];
    
    let activitiesProcessed = 0;
    let activitiesSkippedNoSymbol = 0;
    let activitiesSkippedNoDate = 0;
    let activitiesSkippedInvalidPrice = 0;
    let activitiesSkippedInvalidDate = 0;
    let transactionsSkippedDuplicate = 0;

    // Process activities first (these have actual transaction dates)
    for (const activity of activities) {
      activitiesProcessed++;
      // Questrade activities structure: activity can have symbol, quantity, price, tradeDate directly
      // OR it can have executionLegs array with multiple legs
      let processedLegs: any[] = [];
      
      if (activity.executionLegs && activity.executionLegs.length > 0) {
        // Multi-leg trade (e.g., option spreads)
        processedLegs = activity.executionLegs;
      } else if (activity.symbol) {
        // Single-leg trade - treat the activity itself as a leg
        processedLegs = [activity];
      } else {
        activitiesSkippedNoSymbol++;
        console.warn(`Skipping activity ${activitiesProcessed}: no symbol or executionLegs`, {
          activityType: activity.type,
          activityKeys: Object.keys(activity),
          activitySample: JSON.stringify(activity).substring(0, 200)
        });
        continue;
      }
      
      for (const leg of processedLegs) {
        // Only process buy/sell trades (not dividends, fees, etc.)
        if (!leg.symbol || leg.quantity === 0) continue;
        
        const symbol = leg.symbol || activity.symbol;
        const ticker = symbol.split('.')[0]; // Extract ticker from symbol (e.g., "AAPL.TO" -> "AAPL")
        
        // Quantity is positive for buys, negative for sells
        const shares = leg.quantity || activity.quantity || 0;
        const price = leg.price || leg.executionPrice || leg.averagePrice || activity.price || activity.executionPrice || 0;
        
        // Questrade date fields can be: tradeDate, transactionDate, date, tradeDateTime
        // Check both leg and activity level
        const transactionDate = leg.tradeDate || leg.transactionDate || leg.date || 
                                activity.tradeDate || activity.transactionDate || activity.date || activity.tradeDateTime;
        
        if (!transactionDate) {
          activitiesSkippedNoDate++;
          console.warn(`Skipping activity with missing date:`, { 
            activity: { type: activity.type, symbol: activity.symbol, keys: Object.keys(activity) },
            leg: { symbol: leg.symbol, quantity: leg.quantity, keys: Object.keys(leg) }
          });
          continue;
        }
        
        if (price <= 0) {
          activitiesSkippedInvalidPrice++;
          console.warn(`Skipping activity with invalid price:`, { symbol, price, transactionDate, leg });
          continue;
        }
        
        // Format date (Questrade returns ISO strings like "2025-01-07T00:00:00.000000-05:00" or "2025-01-07")
        let formattedDate: string;
        try {
          // Handle both ISO string and date-only formats
          let dateStr = String(transactionDate).trim();
          // If it's an ISO string, extract just the date part
          if (dateStr.includes('T')) {
            dateStr = dateStr.split('T')[0];
          }
          // If it has timezone info, remove it
          if (dateStr.includes(' ')) {
            dateStr = dateStr.split(' ')[0];
          }
          
          const dateObj = new Date(dateStr + 'T00:00:00'); // Add time to ensure consistent parsing
          if (isNaN(dateObj.getTime())) {
            console.warn(`Invalid date format: ${transactionDate} (parsed as: ${dateStr})`);
            continue;
          }
          formattedDate = dateObj.toISOString().split('T')[0];
          
          // Validate the date is reasonable (not before 1900 or in the future + 1 day for timezone)
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          if (dateObj.getFullYear() < 1900 || dateObj > tomorrow) {
            activitiesSkippedInvalidDate++;
            console.warn(`Suspicious date: ${formattedDate} (from ${transactionDate}), skipping`);
            continue;
          }
        } catch (e) {
          activitiesSkippedInvalidDate++;
          console.warn(`Error parsing date ${transactionDate}:`, e);
          continue;
        }
        
        // Check if this exact transaction already exists (match by ticker, shares, price, and date)
        const existingTxn = existingTransactions?.find(
          t => t.ticker === ticker.toUpperCase() && 
               Math.abs(t.shares - shares) < 0.001 &&
               Math.abs(t.price - price) < 0.01 &&
               t.transaction_date === formattedDate
        );
        
        if (!existingTxn) {
          transactionsToAdd.push({
            portfolio_id: portfolio.id,
            ticker: ticker.toUpperCase(),
            shares: shares, // Keep sign: positive for buys, negative for sells
            price: price,
            transaction_date: formattedDate,
          });
          console.log(`  ✓ Adding transaction: ${ticker} ${shares} shares @ $${price} on ${formattedDate}`);
        } else {
          transactionsSkippedDuplicate++;
          console.log(`  - Skipping duplicate: ${ticker} ${shares} shares @ $${price} on ${formattedDate}`);
        }
      }
    }

    // FALLBACK: If no transactions from activities, use positions with estimated dates
    // This restores the working behavior - we use positions when activities aren't available or have no dates
    // The dates are estimates (1 year ago), which is better than no data
    // This ensures sync always works, even if activities API doesn't return data
    if (transactionsToAdd.length === 0 && positions.length > 0) {
      console.warn('⚠️  No activities found - using positions as fallback with estimated dates');
      console.warn('NOTE: These dates are estimates (1 year ago). For accurate dates, we need activities API to return data.');
      
      for (const position of positions) {
        if (position.openQuantity > 0) {
          const symbol = position.symbol;
          const ticker = symbol.split('.')[0];
          const shares = position.openQuantity;
          const avgPrice = position.averageEntryPrice;
          
          // Check if we already have transactions for this exact ticker and shares
          const hasExistingTxn = existingTransactions?.some(
            t => t.ticker === ticker.toUpperCase() && 
                 Math.abs(Math.abs(t.shares) - Math.abs(shares)) < 0.001
          );
          
          if (!hasExistingTxn && avgPrice > 0) {
            // Use a reasonable estimated date - 1 year ago as a safe default
            // This gets sync working again, even if dates aren't perfect
            const estimatedDate = new Date();
            estimatedDate.setFullYear(estimatedDate.getFullYear() - 1);
            const estimatedDateStr = estimatedDate.toISOString().split('T')[0];
            
            transactionsToAdd.push({
              portfolio_id: portfolio.id,
              ticker: ticker.toUpperCase(),
              shares: shares, // Keep sign (positive for buys)
              price: avgPrice,
              transaction_date: estimatedDateStr,
            });
            console.log(`  ✓ Adding position as transaction (ESTIMATED DATE): ${ticker} ${shares} shares @ $${avgPrice} on ${estimatedDateStr} (estimated)`);
          } else if (hasExistingTxn) {
            console.log(`  - Skipping duplicate position: ${ticker} ${shares} shares`);
          }
        }
      }
      
      if (transactionsToAdd.length > 0) {
        console.log(`✅ Added ${transactionsToAdd.length} transactions from positions (with estimated dates)`);
        console.log(`   You can manually update the dates later for accuracy`);
      }
    }

    // Process positions for current state (for display purposes)
    for (const position of positions) {
      if (position.openQuantity > 0) {
        const symbol = position.symbol;
        const ticker = symbol.split('.')[0];
        
        // Fetch current price
        const quoteResponse = await fetch(`${apiServer}/v1/markets/quotes/${symbol}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });

        let currentPrice = position.averageEntryPrice;
        if (quoteResponse.ok) {
          const quoteData = await quoteResponse.json();
          if (quoteData.quotes && quoteData.quotes.length > 0) {
            currentPrice = quoteData.quotes[0].lastTradePrice || position.averageEntryPrice;
          }
        }

        syncedPositions.push({
          ticker: ticker,
          symbol: symbol,
          shares: position.openQuantity,
          averagePrice: position.averageEntryPrice,
          currentPrice: currentPrice,
          marketValue: position.marketValue,
        });
      }
    }

    console.log('\n=== TRANSACTION PROCESSING SUMMARY ===');
    console.log(`Activities processed: ${activitiesProcessed}`);
    console.log(`  - Skipped (no symbol/legs): ${activitiesSkippedNoSymbol}`);
    console.log(`  - Skipped (no date): ${activitiesSkippedNoDate}`);
    console.log(`  - Skipped (invalid price): ${activitiesSkippedInvalidPrice}`);
    console.log(`  - Skipped (invalid date): ${activitiesSkippedInvalidDate}`);
    console.log(`  - Skipped (duplicates): ${transactionsSkippedDuplicate}`);
    console.log(`Transactions to add: ${transactionsToAdd.length}`);
    console.log('=======================================\n');
    
    if (transactionsToAdd.length > 0) {
      console.log('Sample transactions to add:', transactionsToAdd.slice(0, 3));
    }

    // Bulk insert new transactions
    let insertedCount = 0;
    if (transactionsToAdd.length > 0) {
      const { data: insertedData, error: insertError } = await supabase
        .from('transactions')
        .insert(transactionsToAdd)
        .select();

      if (insertError) {
        console.error('Error inserting Questrade transactions:', insertError);
        throw new Error(`Failed to insert transactions: ${insertError.message}`);
      } else {
        insertedCount = insertedData?.length || 0;
        console.log(`Successfully inserted ${insertedCount} transactions`);
      }
    } else {
      const reason = activities.length === 0 
        ? 'No activities found from Questrade API' 
        : activitiesSkippedNoDate > 0 
          ? `All ${activities.length} activities were skipped (missing dates, invalid prices, or duplicates)`
          : `All ${activities.length} activities were detected as duplicates`;
      
      console.warn(`No transactions to insert: ${reason}`);
      console.warn(`  - Activities found: ${activities.length}`);
      console.warn(`  - Activities skipped (no date): ${activitiesSkippedNoDate}`);
      console.warn(`  - Activities skipped (invalid price): ${activitiesSkippedInvalidPrice}`);
      console.warn(`  - Activities skipped (invalid date): ${activitiesSkippedInvalidDate}`);
      console.warn(`  - Duplicates skipped: ${transactionsSkippedDuplicate}`);
      
      // Return an error if no transactions were added
      if (transactionsToAdd.length === 0) {
        let errorMessage = '';
        
        if (activities.length === 0 && positions.length > 0) {
          errorMessage = `No trade activities found from Questrade API.\n\nPossible reasons:\n1. Your account has no trade history in the last 5 years\n2. The activities API returned no trades\n3. All activities were filtered out\n\nCheck server logs for the "Sample activity structure" to see what Questrade returned.`;
        } else if (activities.length > 0) {
          errorMessage = `Found ${activities.length} activities but none could be processed.\n\nBreakdown:\n- Skipped (no date): ${activitiesSkippedNoDate}\n- Skipped (invalid price): ${activitiesSkippedInvalidPrice}\n- Skipped (invalid date): ${activitiesSkippedInvalidDate}\n- Duplicates: ${transactionsSkippedDuplicate}\n\nMost likely: All activities are missing transaction dates. Check server logs for "Sample activity structure" to see what fields Questrade returns.`;
        } else {
          errorMessage = `No positions or activities found. This might mean:\n1. Your account is empty\n2. The API returned no data\n3. There was an error fetching data\n\nCheck server logs for details.`;
        }
        
        // Include sample activity structure in error for debugging
        const sampleActivity = activities.length > 0 ? {
          type: activities[0].type,
          symbol: activities[0].symbol,
          keys: Object.keys(activities[0]),
          hasExecutionLegs: !!activities[0].executionLegs,
          dateFields: {
            tradeDate: activities[0].tradeDate,
            transactionDate: activities[0].transactionDate,
            date: activities[0].date,
            tradeDateTime: activities[0].tradeDateTime,
          },
          // Include first executionLeg if it exists
          firstExecutionLeg: activities[0].executionLegs?.[0] ? {
            symbol: activities[0].executionLegs[0].symbol,
            quantity: activities[0].executionLegs[0].quantity,
            price: activities[0].executionLegs[0].price,
            keys: Object.keys(activities[0].executionLegs[0]),
            dateFields: {
              tradeDate: activities[0].executionLegs[0].tradeDate,
              transactionDate: activities[0].executionLegs[0].transactionDate,
              date: activities[0].executionLegs[0].date,
            }
          } : null
        } : null;
        
        // Include API response info for debugging
        const debugInfo = {
          activitiesFound: activities.length,
          positionsFound: positions.length,
          accountsProcessed: accounts.length,
          apiServer: apiServer,
          accountNumbers: accounts.map(acc => acc.number),
          accountTypes: accounts.map(acc => acc.type),
          activitiesApiResponses: activitiesApiResponses, // Include full API responses for debugging
        };
        
        console.error('\n=== ERROR: NO TRANSACTIONS TO ADD ===');
        console.error('Debug info:', JSON.stringify(debugInfo, null, 2));
        console.error('Sample activity structure:', sampleActivity ? JSON.stringify(sampleActivity, null, 2) : 'N/A (no activities found)');
        
        return NextResponse.json({
          success: false,
          error: errorMessage,
          details: {
            activitiesFound: activities.length,
            positionsFound: positions.length,
            transactionsAdded: 0,
            skippedNoDate: activitiesSkippedNoDate,
            skippedInvalidPrice: activitiesSkippedInvalidPrice,
            skippedInvalidDate: activitiesSkippedInvalidDate,
            duplicatesSkipped: transactionsSkippedDuplicate,
            skippedNoSymbol: activitiesSkippedNoSymbol,
            sampleActivity: sampleActivity, // Include for debugging
            debugInfo: debugInfo,
            activitiesApiResponses: activitiesApiResponses, // Include full API responses - THIS IS KEY FOR DEBUGGING
          },
          positions: syncedPositions,
          accounts: accounts.map(acc => ({
            number: acc.number,
            type: acc.type,
            positionsCount: allPositions.filter(p => p.accountNumber === acc.number).length
          })),
        }, { status: 400 });
      }
    }

    return NextResponse.json({
      success: true,
      message: insertedCount > 0 ? `Successfully synced ${insertedCount} transactions` : 'Sync completed but no new transactions were added',
      transactionsAdded: insertedCount,
      positions: syncedPositions,
      balances: allBalances,
      accounts: accounts.map(acc => ({
        number: acc.number,
        type: acc.type,
        positionsCount: allPositions.filter(p => p.accountNumber === acc.number).length
      })),
      totalPositions: syncedPositions.length,
      summary: {
        activitiesFound: activities.length,
        transactionsAdded: insertedCount,
        skippedNoDate: activitiesSkippedNoDate,
        skippedInvalidPrice: activitiesSkippedInvalidPrice,
        skippedInvalidDate: activitiesSkippedInvalidDate,
        duplicatesSkipped: transactionsSkippedDuplicate,
      }
    });
  } catch (error: any) {
    console.error('Error syncing Questrade data:', error);
    const errorMessage = error.message || 'Failed to sync Questrade data';
    console.error('Full error details:', {
      message: errorMessage,
      stack: error.stack,
      connection: connection ? {
        hasAccessToken: !!connection.access_token,
        hasApiServer: !!connection.api_server,
        expiresAt: connection.expires_at,
        isExpired: new Date(connection.expires_at) <= new Date(),
      } : 'No connection found'
    });
    return NextResponse.json(
      { 
        success: false,
        error: errorMessage,
        details: {
          errorType: error.name || 'Unknown',
          stack: error.stack?.substring(0, 500) // First 500 chars of stack
        }
      },
      { status: 500 }
    );
  }
}
