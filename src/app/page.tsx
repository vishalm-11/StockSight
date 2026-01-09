'use client';

import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Plus, X, Trash2, Link2, Unlink, RefreshCw, Search, ArrowUp, ArrowDown } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';

type Transaction = {
  id: string;
  ticker: string;
  shares: number;
  price: number;
  transaction_date: string;
};

type Holding = {
  ticker: string;
  shares: number;
  avgCost: number;
  currentPrice: number;
  name: string;
};

export default function PortfolioDashboard() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    ticker: '',
    shares: '',
    price: '',
    date: new Date().toISOString().split('T')[0]
  });
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchingPrices, setFetchingPrices] = useState(false);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [filteredSnapshots, setFilteredSnapshots] = useState<any[]>([]);
  const [questradeLinked, setQuestradeLinked] = useState(false);
  const [syncingQuestrade, setSyncingQuestrade] = useState(false);
  const [timePeriod, setTimePeriod] = useState<'1M' | '3M' | '6M' | '1Y' | 'ALL'>('ALL');
  const [holdingsSearch, setHoldingsSearch] = useState('');
  const [holdingsSortField, setHoldingsSortField] = useState<string | null>(null);
  const [holdingsSortDirection, setHoldingsSortDirection] = useState<'asc' | 'desc'>('desc');
  
  // Track warned prices/snapshots to avoid console spam
  const warnedMissingPrices = React.useRef<Set<string>>(new Set());
  const warnedSnapshots = React.useRef<Set<string>>(new Set());
  const [yesterdayBaseline, setYesterdayBaseline] = useState<number | null>(null);

  useEffect(() => {
    fetchTransactions();
    fetchSnapshots();
    checkQuestradeStatus();
  }, []);

  const checkQuestradeStatus = async () => {
    try {
      const res = await fetch('/api/questrade/status');
      if (res.ok) {
        const data = await res.json();
        setQuestradeLinked(data.linked || false);
      }
    } catch (error) {
      console.error('Error checking Questrade status:', error);
    }
  };

  const handleLinkQuestrade = async () => {
    try {
      const refreshToken = window.prompt(
        'Paste your Questrade refresh_token here (from the JSON you copied):'
      );

      if (!refreshToken) {
        return;
      }

      const res = await fetch('/api/questrade/link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      });

      const data = await res.json().catch(() => ({}));
      console.log('Link response:', { status: res.status, data });

      if (res.ok && data.success) {
        setQuestradeLinked(true);
        alert('Questrade account linked successfully!');
        // Refresh status after linking
        checkQuestradeStatus();
      } else {
        const errorMsg = data.error || 'Unknown error';
        console.error('Link error:', { status: res.status, error: errorMsg, fullResponse: data });
        alert(`Failed to link Questrade account: ${errorMsg}\n\nCheck browser console (F12) for details.`);
      }
    } catch (error: any) {
      console.error('Error linking Questrade:', error);
      alert(`Error linking Questrade account: ${error.message || 'Network error'}\n\nCheck browser console (F12) for details.`);
    }
  };

  const handleUnlinkQuestrade = async () => {
    if (!confirm('Are you sure you want to unlink your Questrade account?')) {
      return;
    }

    try {
      const res = await fetch('/api/questrade/unlink', { method: 'POST' });
      if (res.ok) {
        setQuestradeLinked(false);
        alert('Questrade account unlinked successfully');
      } else {
        alert('Failed to unlink Questrade account');
      }
    } catch (error) {
      console.error('Error unlinking Questrade:', error);
      alert('Error unlinking Questrade account');
    }
  };

  const handleSyncQuestrade = async () => {
    setSyncingQuestrade(true);
    try {
      const res = await fetch('/api/questrade/sync', { method: 'POST' });
      
      // Check content type before parsing
      const contentType = res.headers.get('content-type');
      let data: any = {};
      
      if (contentType && contentType.includes('application/json')) {
        try {
          data = await res.json();
        } catch (parseError) {
          console.error('Error parsing JSON response:', parseError);
          const text = await res.text();
          console.error('Response text:', text);
          alert(`Failed to parse sync response. Status: ${res.status}\n\nResponse: ${text.substring(0, 200)}`);
          return;
        }
      } else {
        const text = await res.text();
        console.error('Non-JSON response:', { status: res.status, contentType, text: text.substring(0, 500) });
        alert(`Unexpected response format. Status: ${res.status}\n\nResponse: ${text.substring(0, 200)}`);
        return;
      }
      
      console.log('Sync response:', { status: res.status, data });
      
      if (res.ok && data.success) {
        // Refresh transactions and holdings after sync
        await fetchTransactions();
        
        if (data.transactionsAdded > 0) {
          alert(`Questrade data synced successfully! Added ${data.transactionsAdded} new transactions.`);
        } else {
          alert(`Sync completed but no new transactions were added.\n\n${data.message || 'All activities may have been duplicates or invalid.'}`);
        }
      } else {
        // Show detailed error message
        const errorMsg = data.error || data.message || 'Unknown error';
        let details = '';
        
        if (data.details) {
          const detailsObj = data.details;
          details = `\n\nDetails:\n- Activities found: ${detailsObj.activitiesFound || 0}\n- Positions found: ${detailsObj.positionsFound || 0}\n- Transactions added: ${detailsObj.transactionsAdded || 0}\n- Skipped (no symbol): ${detailsObj.skippedNoSymbol || 0}\n- Skipped (no date): ${detailsObj.skippedNoDate || 0}\n- Skipped (invalid price): ${detailsObj.skippedInvalidPrice || 0}\n- Skipped (invalid date): ${detailsObj.skippedInvalidDate || 0}\n- Duplicates: ${detailsObj.duplicatesSkipped || 0}`;
          
          // Include debug info
          if (detailsObj.debugInfo) {
            details += `\n\nDebug Info:\n- API Server: ${detailsObj.debugInfo.apiServer || 'N/A'}\n- Accounts processed: ${detailsObj.debugInfo.accountsProcessed || 0}\n- Account numbers: ${detailsObj.debugInfo.accountNumbers?.join(', ') || 'N/A'}`;
          }
          
          // Include full API responses in console for debugging
          if (detailsObj.activitiesApiResponses && detailsObj.activitiesApiResponses.length > 0) {
            console.log('\n=== QUESTRADE ACTIVITIES API RESPONSES (CHECK THIS!) ===');
            detailsObj.activitiesApiResponses.forEach((resp: any, index: number) => {
              console.log(`\nAccount ${index + 1} (${resp.accountNumber}):`);
              console.log(`  URL: ${resp.url}`);
              if (resp.response) {
                console.log(`  Response keys:`, resp.response.keys);
                console.log(`  Has 'activities' field:`, resp.response.hasActivities);
                console.log(`  Activities is array:`, resp.response.activitiesIsArray);
                console.log(`  Activities length:`, resp.response.activitiesLength);
                console.log(`  Full response:`, JSON.stringify(resp.response.fullResponse, null, 2));
              }
              if (resp.error) {
                console.log(`  ERROR Status:`, resp.error.status);
                console.log(`  ERROR Text:`, resp.error.errorText);
              }
            });
            console.log('=== END API RESPONSES ===\n');
            
            details += `\n\n⚠️ Check browser console (F12) for full API responses from Questrade.`;
          }
          
          // Include sample activity structure if available
          if (detailsObj.sampleActivity) {
            details += `\n\nSample activity structure:\n${JSON.stringify(detailsObj.sampleActivity, null, 2)}`;
          } else if (detailsObj.activitiesFound === 0) {
            details += `\n\n⚠️ No activities were found from Questrade API. Check browser console (F12) for the actual API responses.`;
          }
        }
        
        console.error('Sync error response:', { status: res.status, error: errorMsg, details: data.details, fullResponse: data });
        alert(`Failed to sync Questrade: ${errorMsg}${details}\n\nCheck browser console (F12) and server terminal logs for full details.`);
      }
    } catch (error: any) {
      console.error('Error syncing Questrade:', error);
      alert(`Error syncing Questrade data: ${error.message || 'Network error'}\n\nCheck browser console (F12) for details.`);
    } finally {
      setSyncingQuestrade(false);
    }
  };

  // Recalculate current holdings graph when holdings or transactions change
  useEffect(() => {
    if (holdings.length > 0 && transactions.length > 0 && snapshots.length > 0) {
      calculateCurrentHoldingsGraph();
    }
  }, [holdings, transactions, snapshots]);

  // Real-time updates: refresh holdings prices every 30 seconds
  useEffect(() => {
    if (holdings.length > 0) {
      const interval = setInterval(async () => {
        await fetchTransactions(); // This will refresh holdings with latest prices
      }, 30000); // 30 seconds

      return () => clearInterval(interval);
    }
  }, [holdings.length]);

  const getPreviousBusinessDay = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    // If weekend, roll back to Friday
    if (d.getDay() === 0) d.setDate(d.getDate() - 2); // Sunday -> Friday
    if (d.getDay() === 6) d.setDate(d.getDate() - 1); // Saturday -> Friday
    return d.toISOString().split('T')[0];
  };

  const isMarketHoliday = (date: Date): boolean => {
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-11
    const day = date.getDate();
    const dayOfWeek = date.getDay();

    // Fixed holidays
    // New Year's Day (January 1, or previous Friday if on weekend)
    if (month === 0 && day === 1) return true;
    if (month === 0 && day === 2 && dayOfWeek === 1) return true; // If Jan 1 is Sunday, market closed on Monday
    
    // Independence Day (July 4, or previous Friday/Monday if on weekend)
    if (month === 6 && day === 4) return true;
    if (month === 6 && day === 3 && dayOfWeek === 1) return true; // If July 4 is Sunday, market closed on Monday
    if (month === 6 && day === 5 && dayOfWeek === 1) return true; // If July 4 is Saturday, market closed on Monday
    
    // Christmas (December 25, or previous Friday/Monday if on weekend)
    if (month === 11 && day === 25) return true;
    if (month === 11 && day === 24 && dayOfWeek === 1) return true; // If Dec 25 is Sunday, market closed on Monday
    if (month === 11 && day === 26 && dayOfWeek === 1) return true; // If Dec 25 is Saturday, market closed on Monday
    
    // Juneteenth (June 19, or previous Friday/Monday if on weekend)
    if (month === 5 && day === 19) return true;
    if (month === 5 && day === 18 && dayOfWeek === 1) return true; // If June 19 is Sunday, market closed on Monday
    if (month === 5 && day === 20 && dayOfWeek === 1) return true; // If June 19 is Saturday, market closed on Monday

    // Calculate variable holidays
    // Martin Luther King Jr. Day (3rd Monday in January)
    const mlkDay = new Date(year, 0, 1);
    while (mlkDay.getDay() !== 1) mlkDay.setDate(mlkDay.getDate() + 1);
    mlkDay.setDate(mlkDay.getDate() + 14); // 3rd Monday
    if (month === 0 && day === mlkDay.getDate()) return true;

    // Presidents' Day (3rd Monday in February)
    const presidentsDay = new Date(year, 1, 1);
    while (presidentsDay.getDay() !== 1) presidentsDay.setDate(presidentsDay.getDate() + 1);
    presidentsDay.setDate(presidentsDay.getDate() + 14); // 3rd Monday
    if (month === 1 && day === presidentsDay.getDate()) return true;

    // Memorial Day (last Monday in May)
    const memorialDay = new Date(year, 4, 31);
    while (memorialDay.getDay() !== 1) memorialDay.setDate(memorialDay.getDate() - 1);
    if (month === 4 && day === memorialDay.getDate()) return true;

    // Labor Day (1st Monday in September)
    const laborDay = new Date(year, 8, 1);
    while (laborDay.getDay() !== 1) laborDay.setDate(laborDay.getDate() + 1);
    if (month === 8 && day === laborDay.getDate()) return true;

    // Thanksgiving (4th Thursday in November)
    const thanksgiving = new Date(year, 10, 1);
    while (thanksgiving.getDay() !== 4) thanksgiving.setDate(thanksgiving.getDate() + 1);
    thanksgiving.setDate(thanksgiving.getDate() + 21); // 4th Thursday
    if (month === 10 && day === thanksgiving.getDate()) return true;

    // Good Friday (Friday before Easter - approximate calculation)
    // Easter calculation (simplified)
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const easterMonth = Math.floor((h + l - 7 * m + 114) / 31) - 1;
    const easterDay = ((h + l - 7 * m + 114) % 31) + 1;
    const easter = new Date(year, easterMonth, easterDay);
    const goodFriday = new Date(easter);
    goodFriday.setDate(goodFriday.getDate() - 2); // Friday before Easter
    if (month === goodFriday.getMonth() && day === goodFriday.getDate()) return true;

    return false;
  };

  const isTradingDay = (date: Date): boolean => {
    const dayOfWeek = date.getDay();
    // Check if it's a weekend
    if (dayOfWeek === 0 || dayOfWeek === 6) return false;
    // Check if it's a market holiday
    if (isMarketHoliday(date)) return false;
    return true;
  };

  const computeYesterdayBaseline = async () => {
    try {
      if (holdings.length === 0) {
        setYesterdayBaseline(null);
        return;
      }

      const tickers = holdings.map(h => h.ticker);
      const yesterdayDate = getPreviousBusinessDay();

      const res = await fetch('/api/historical-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers, dates: [yesterdayDate] }),
      });

      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await res.text();
        console.warn('Non-JSON response when fetching yesterday prices:', text);
        setYesterdayBaseline(null);
        return;
      }

      const priceData = await res.json();
      const priceMap: Record<string, number> = {};
      priceData.forEach((p: any) => {
        priceMap[p.ticker] = p.close;
      });

      const baseline = holdings.reduce((sum, h) => {
        const price = priceMap[h.ticker] ?? h.currentPrice ?? h.avgCost;
        return sum + h.shares * price;
      }, 0);

      setYesterdayBaseline(baseline);
      console.log('Computed yesterday baseline', { yesterdayDate, baseline, tickers, priceMap });
    } catch (error) {
      console.error('Error computing yesterday baseline:', error);
      setYesterdayBaseline(null);
    }
  };

  useEffect(() => {
    computeYesterdayBaseline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdings]);

  const fetchTransactions = async () => {
    try {
      const res = await fetch('/api/transactions');
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await res.text();
        console.error('Non-JSON response:', text);
        setLoading(false);
        return;
      }
      const data = await res.json();
      // Ensure data is an array
      const transactionsArray = Array.isArray(data) ? data : [];
      setTransactions(transactionsArray);
      await processHoldings(transactionsArray);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      setLoading(false);
    }
  };

  const fetchSnapshots = async () => {
    try {
      const res = await fetch('/api/portfolio-snapshots');
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await res.text();
        console.error('Non-JSON response:', text);
        return;
      }
      const data = await res.json();
      setSnapshots(data);
    } catch (error) {
      console.error('Error fetching snapshots:', error);
    }
  };

  const calculateCurrentHoldingsGraph = async () => {
    if (transactions.length === 0 || holdings.length === 0 || snapshots.length === 0) {
      setFilteredSnapshots([]);
      return;
    }

    // Get all tickers in current holdings
    const currentTickers = holdings.map(h => h.ticker);

    // Find the earliest transaction date for current holdings
    const currentHoldingsTxns = transactions.filter(t => currentTickers.includes(t.ticker));
    
    if (currentHoldingsTxns.length === 0) {
      setFilteredSnapshots([]);
      return;
    }

    // Find the earliest transaction date - this is where we START the graph
    const earliestTransactionDate = Math.min(...currentHoldingsTxns.map(t => new Date(t.transaction_date).getTime()));
    const earliestDate = new Date(earliestTransactionDate);
    const earliestDateStr = earliestDate.toISOString().split('T')[0];
    const todayDateObj = new Date();
    const todayDate = todayDateObj.toISOString().split('T')[0];

    console.log(`Graph date range: ${earliestDateStr} (first transaction) to ${todayDate} (today)`);

    // Generate ALL dates from earliest transaction date to today (inclusive)
    // This ensures we have a continuous graph from when you started investing
    // Filter out weekends (Saturday=6, Sunday=0) since markets are closed
    const allDates: string[] = [];
    const currentDate = new Date(earliestDate);
    
    // Generate every trading day (weekdays excluding market holidays) from first transaction to today
    while (currentDate <= todayDateObj) {
      if (isTradingDay(currentDate)) {
        const dateStr = currentDate.toISOString().split('T')[0];
        allDates.push(dateStr);
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    const uniqueDates = allDates.sort();
    
    console.log('Fetching historical prices:', {
      tickers: currentTickers,
      dateRange: { earliestDateStr, todayDate },
      totalDates: uniqueDates.length,
      sampleDates: uniqueDates.slice(0, 5)
    });

    // Fetch historical prices for current holdings on all snapshot dates
    let historicalPrices: { [key: string]: { [date: string]: number } } = {};
    
    try {
      const res = await fetch('/api/historical-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tickers: currentTickers,
          dates: uniqueDates
        }),
      });

      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const priceData = await res.json();
        
        // Organize prices by ticker and date for easy lookup
        // The API returns dates already normalized to YYYY-MM-DD format
        priceData.forEach((price: any) => {
          if (!historicalPrices[price.ticker]) {
            historicalPrices[price.ticker] = {};
          }
          // API already normalizes to YYYY-MM-DD, so use it directly or normalize if needed
          let normalizedDate: string;
          if (typeof price.date === 'string') {
            // If it's already in YYYY-MM-DD format, use it directly
            if (/^\d{4}-\d{2}-\d{2}$/.test(price.date)) {
              normalizedDate = price.date;
      } else {
              // Parse and convert to YYYY-MM-DD
              const parsed = new Date(price.date);
              if (!isNaN(parsed.getTime())) {
                normalizedDate = parsed.toISOString().split('T')[0];
              } else {
                // Fallback: try to extract YYYY-MM-DD from string
                normalizedDate = price.date.split('T')[0].split(' ')[0];
              }
            }
          } else if (price.date instanceof Date) {
            normalizedDate = price.date.toISOString().split('T')[0];
          } else {
            // Convert to string and extract date part
            normalizedDate = String(price.date).split('T')[0].split(' ')[0];
          }
          
          // Store price with normalized date (YYYY-MM-DD format)
          if (normalizedDate && price.close !== null && price.close !== undefined) {
            historicalPrices[price.ticker][normalizedDate] = Number(price.close);
          }
        });
        
        console.log('Historical prices fetched:', {
          totalPrices: priceData.length,
          tickersWithPrices: Object.keys(historicalPrices).length,
          samplePrices: Object.entries(historicalPrices).slice(0, 3).map(([ticker, dates]) => ({
            ticker,
            dateCount: Object.keys(dates).length,
            earliestDate: Object.keys(dates).sort()[0],
            latestDate: Object.keys(dates).sort().reverse()[0],
            sampleDates: Object.keys(dates).slice(0, 3),
          })),
        });
      }
    } catch (error) {
      console.error('Error fetching historical prices:', error);
      // Fall back to proportional estimation if API fails
    }

    // Recalculate cost and value for each date from earliest purchase to today
    let recalculated = uniqueDates.map(dateStr => {
      const snapshotDate = new Date(dateStr);
      const snapshotDateStr = snapshotDate.toISOString().split('T')[0];
      
      // Get all transactions for current holdings up to this snapshot date
      const txnsUpToDate = currentHoldingsTxns.filter(
        t => new Date(t.transaction_date) <= snapshotDate
      );

      if (txnsUpToDate.length === 0) {
        return {
          date: snapshotDateStr,
          total_cost: 0,
          total_value: 0,
          total_gain: 0
        };
      }

      // Calculate holdings for each ticker (shares and cost)
      const holdingsMap: { [key: string]: { shares: number; cost: number } } = {};
      
      txnsUpToDate.forEach(txn => {
        if (!holdingsMap[txn.ticker]) {
          holdingsMap[txn.ticker] = { shares: 0, cost: 0 };
        }
        holdingsMap[txn.ticker].shares += txn.shares;
        holdingsMap[txn.ticker].cost += txn.shares * txn.price;
      });

      // Calculate total cost for current holdings only
      const recalculatedCost = Object.values(holdingsMap).reduce(
        (sum, h) => sum + h.cost,
        0
      );

      // Calculate total value using historical prices
      let recalculatedValue = 0;
      let pricesFound = 0;
      let totalTickers = Object.keys(holdingsMap).length;

      // Check if this is today's date
      const today = new Date();
      const isToday = snapshotDateStr === today.toISOString().split('T')[0];

      // For today's date, use current live prices from holdings
      if (isToday) {
        Object.entries(holdingsMap).forEach(([ticker, holding]) => {
          const currentHolding = holdings.find(h => h.ticker === ticker);
          if (currentHolding) {
            recalculatedValue += holding.shares * currentHolding.currentPrice;
            pricesFound++;
          } else {
            // Fallback to average cost if current holding not found
            recalculatedValue += holding.shares * (holding.cost / holding.shares);
          }
        });
      } else {
        // For historical dates, use historical prices from database
        // Find the closest previous date with prices for missing dates
        const snapshotDateObj = new Date(snapshotDateStr);
        
        Object.entries(holdingsMap).forEach(([ticker, holding]) => {
          // Normalize snapshot date for lookup
          const normalizedSnapshotDate = snapshotDateStr;
          let price = historicalPrices[ticker]?.[normalizedSnapshotDate];
          
          // If price not found for this exact date, try to find the closest previous date (forward-fill)
          // This is the most accurate - use the last known price before this date
          if (price === undefined) {
            const tickerPrices = historicalPrices[ticker] || {};
            const availableDates = Object.keys(tickerPrices)
              .map(d => new Date(d))
              .filter(d => d <= snapshotDateObj)
              .sort((a, b) => b.getTime() - a.getTime()); // Sort descending (most recent first)
            
            if (availableDates.length > 0) {
              const closestDate = availableDates[0].toISOString().split('T')[0];
              price = tickerPrices[closestDate];
              // Only log if it's more than 1 day away
              const daysDiff = Math.floor((snapshotDateObj.getTime() - new Date(closestDate).getTime()) / (1000 * 60 * 60 * 24));
              if (daysDiff > 1) {
                console.log(`Forward-fill: ${ticker} on ${snapshotDateStr} using price from ${closestDate} (${daysDiff} days ago): ${price}`);
              }
            }
          }
          
          // If still no price, try to find the closest future date (backward-fill)
          // This is less accurate but better than using average cost
          if (price === undefined) {
            const tickerPrices = historicalPrices[ticker] || {};
            const futureDates = Object.keys(tickerPrices)
              .map(d => new Date(d))
              .filter(d => d >= snapshotDateObj)
              .sort((a, b) => a.getTime() - b.getTime()); // Sort ascending (earliest first)
            
            if (futureDates.length > 0) {
              const closestFutureDate = futureDates[0].toISOString().split('T')[0];
              price = tickerPrices[closestFutureDate];
              const daysDiff = Math.floor((new Date(closestFutureDate).getTime() - snapshotDateObj.getTime()) / (1000 * 60 * 60 * 24));
              console.log(`Backward-fill: ${ticker} on ${snapshotDateStr} using price from ${closestFutureDate} (${daysDiff} days ahead): ${price}`);
            }
          }
          
          // If still no price, use average cost as last resort
          // This should rarely happen if we have historical data
          if (price === undefined) {
            price = holding.cost / holding.shares;
            // Only log once per ticker per date to avoid spam
            const warningKey = `${ticker}-${snapshotDateStr}`;
            if (!warnedMissingPrices.current.has(warningKey)) {
              console.warn(`No historical price found for ${ticker} on ${snapshotDateStr}, using avg cost: ${price.toFixed(2)}`);
              warnedMissingPrices.current.add(warningKey);
            }
          } else {
            pricesFound++;
          }
          
          recalculatedValue += holding.shares * price;
        });
        
        // Only log if there are missing prices (to reduce console spam)
        if (pricesFound < totalTickers) {
          const missingCount = totalTickers - pricesFound;
          // Only log once per snapshot date
          if (!warnedSnapshots.current.has(snapshotDateStr)) {
            console.warn(`Snapshot ${snapshotDateStr}: missing prices for ${missingCount}/${totalTickers} tickers`);
            warnedSnapshots.current.add(snapshotDateStr);
          }
        }
      }

      const recalculatedGain = recalculatedValue - recalculatedCost;

      // Debug: Compare with database snapshot if available
      const dbSnapshot = snapshots.find((s: any) => s.date === snapshotDateStr);
      if (dbSnapshot && Math.abs(recalculatedValue - dbSnapshot.total_value) > 100) {
        console.warn(`⚠️ Value mismatch for ${snapshotDateStr}:`, {
          recalculated: recalculatedValue,
          database: dbSnapshot.total_value,
          difference: recalculatedValue - dbSnapshot.total_value,
          tickersCount: Object.keys(holdingsMap).length,
          pricesFound,
          totalTickers
        });
      }

      return {
        date: snapshotDateStr,
        total_cost: Math.round(recalculatedCost * 100) / 100,
        total_value: Math.round(recalculatedValue * 100) / 100,
        total_gain: Math.round(recalculatedGain * 100) / 100,
      };
    });

    // Always add/update today's snapshot with latest live prices (only if it's a trading day)
    const today = new Date();
    const todayDateStr = today.toISOString().split('T')[0];
    
    let todaySnapshot: any = null;
    // Only add today if it's a trading day (weekday and not a market holiday)
    if (isTradingDay(today)) {
      const todayCost = holdings.reduce((sum, h) => sum + (h.shares * h.avgCost), 0);
      const todayValue = holdings.reduce((sum, h) => sum + (h.shares * h.currentPrice), 0);
      const todayGain = todayValue - todayCost;
      
      todaySnapshot = {
        date: todayDateStr,
        total_cost: Math.round(todayCost * 100) / 100,
        total_value: Math.round(todayValue * 100) / 100,
        total_gain: Math.round(todayGain * 100) / 100,
      };
      
      // Remove existing today's snapshot if it exists, then add the updated one
      const withoutToday = recalculated.filter(s => s.date !== todayDateStr);
      recalculated = [...withoutToday, todaySnapshot];
    }

    // Sort by date
    recalculated.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    // Use database snapshots instead of recalculated values for better accuracy
    // The database snapshots are calculated correctly using closing prices × shares
    // First, filter out weekend dates from database snapshots
    const dbSnapshotsByDate: { [date: string]: any } = {};
    snapshots.forEach((s: any) => {
      // Filter out weekends and market holidays from database snapshots
      const date = new Date(s.date + 'T00:00:00'); // Add time to avoid timezone issues
      if (isTradingDay(date)) {
        dbSnapshotsByDate[s.date] = s;
      } else {
        const dayOfWeek = date.getDay();
        const isHoliday = isMarketHoliday(date);
        console.log(`Skipping ${isHoliday ? 'holiday' : 'weekend'} snapshot from database: ${s.date} (day ${dayOfWeek})`);
      }
    });
    
    // Replace recalculated values with database snapshots where available
    // Also filter out any weekend dates that might have slipped through
    recalculated = recalculated
      .map(rec => {
        const dbSnapshot = dbSnapshotsByDate[rec.date];
        if (dbSnapshot) {
          // Use database snapshot (more accurate - calculated server-side with all data)
          return {
            date: rec.date,
            total_cost: dbSnapshot.total_cost,
            total_value: dbSnapshot.total_value,
            total_gain: dbSnapshot.total_gain,
          };
        }
        // If no database snapshot, use recalculated value (for dates before snapshots exist)
        return rec;
      })
      .filter(rec => {
        // Filter out weekends and market holidays - only keep trading days
        const date = new Date(rec.date + 'T00:00:00'); // Add time to avoid timezone issues
        const isTrading = isTradingDay(date);
        if (!isTrading) {
          const dayOfWeek = date.getDay();
          const isHoliday = isMarketHoliday(date);
          console.log(`Filtering out ${isHoliday ? 'holiday' : 'weekend'} date: ${rec.date} (day ${dayOfWeek})`);
        }
        return isTrading;
      });
    
    console.log('Using database snapshots where available:', {
      totalSnapshots: recalculated.length,
      dbSnapshotsUsed: Object.keys(dbSnapshotsByDate).length,
      dateRange: recalculated.length > 0 ? {
        earliest: recalculated[0].date,
        latest: recalculated[recalculated.length - 1].date,
      } : null,
      todaySnapshot: todaySnapshot,
      yesterdaySnapshot: recalculated.find(s => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        while (yesterday.getDay() === 0 || yesterday.getDay() === 6) {
          yesterday.setDate(yesterday.getDate() - 1);
        }
        return s.date === yesterday.toISOString().split('T')[0];
      }),
    });
    
    setFilteredSnapshots(recalculated);
  };


  const processHoldings = async (txns: Transaction[]) => {
    // Ensure txns is always an array
    if (!Array.isArray(txns)) {
      console.error('processHoldings: txns is not an array:', txns);
      setHoldings([]);
      return;
    }

    const holdingsMap: { [key: string]: { totalShares: number; totalCost: number } } = {};

    txns.forEach(txn => {
      if (!holdingsMap[txn.ticker]) {
        holdingsMap[txn.ticker] = { totalShares: 0, totalCost: 0 };
      }
      holdingsMap[txn.ticker].totalShares += txn.shares;
      holdingsMap[txn.ticker].totalCost += txn.shares * txn.price;
    });

    // Filter out holdings with zero or negative shares (sold positions)
    const tickers = Object.keys(holdingsMap).filter(
      ticker => holdingsMap[ticker].totalShares > 0
    );
    
    console.log('Processing holdings:', {
      totalTransactions: txns.length,
      uniqueTickers: tickers.length,
      holdingsMap: Object.fromEntries(
        Object.entries(holdingsMap).map(([ticker, data]) => [
          ticker,
          {
            shares: data.totalShares,
            totalCost: data.totalCost,
            avgCost: data.totalShares > 0 ? data.totalCost / data.totalShares : 0
          }
        ])
      )
    });
    
    if (tickers.length === 0) {
      setHoldings([]);
      return;
    }

    setFetchingPrices(true);

    try {
      const res = await fetch('/api/stock-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers }),
      });

      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await res.text();
        console.error('Non-JSON response from stock-prices:', text);
        throw new Error('Invalid response from stock prices API');
      }

      const priceData = await res.json();

      const holdingsArray: Holding[] = tickers.map(ticker => {
        const priceInfo = priceData.find((p: any) => p.ticker === ticker);
        
        return {
          ticker,
          shares: holdingsMap[ticker].totalShares,
          avgCost: holdingsMap[ticker].totalCost / holdingsMap[ticker].totalShares,
          currentPrice: priceInfo?.price || holdingsMap[ticker].totalCost / holdingsMap[ticker].totalShares,
          name: priceInfo?.name || ticker,
        };
      });

      setHoldings(holdingsArray);
    } catch (error) {
      console.error('Error fetching prices:', error);
      const holdingsArray: Holding[] = tickers.map(ticker => ({
        ticker,
        shares: holdingsMap[ticker].totalShares,
        avgCost: holdingsMap[ticker].totalCost / holdingsMap[ticker].totalShares,
        currentPrice: holdingsMap[ticker].totalCost / holdingsMap[ticker].totalShares,
        name: ticker,
      }));
      setHoldings(holdingsArray);
    } finally {
      setFetchingPrices(false);
    }
  };

  const calculateMetrics = () => {
    let totalValue = 0;
    let totalCost = 0;

    holdings.forEach(holding => {
      // Only include positive shares (ignore any negative positions or errors)
      if (holding.shares > 0 && holding.avgCost > 0) {
      totalValue += holding.shares * holding.currentPrice;
      totalCost += holding.shares * holding.avgCost;
      }
    });

    const totalGain = totalValue - totalCost;
    const totalGainPercent = totalCost > 0 ? ((totalGain / totalCost) * 100).toFixed(2) : '0.00';
    
    // Calculate daily change: Compare TODAY'S LIVE VALUE to YESTERDAY'S 4PM SNAPSHOT
    // Use filteredSnapshots (recalculated for current holdings) for accurate comparison
    let dailyGain = 0;
    let dailyGainPercent = 0;
    
    // Calculate yesterday's date (skip weekends)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    while (yesterday.getDay() === 0 || yesterday.getDay() === 6) {
      yesterday.setDate(yesterday.getDate() - 1);
    }
    const yesterdayDateStr = yesterday.toISOString().split('T')[0];
    
    // Use filteredSnapshots (recalculated for current holdings) - this has correct values
    const snapshotsToUse = filteredSnapshots.length > 0 ? filteredSnapshots : snapshots;
    
    // Find yesterday's snapshot from filteredSnapshots (recalculated for current holdings)
    const yesterdaySnapshot = snapshotsToUse.find(s => s.date === yesterdayDateStr);
    
    if (yesterdaySnapshot && yesterdaySnapshot.total_value > 0) {
      // Compare today's LIVE value to yesterday's recalculated snapshot (4pm close)
      const yesterdayValue = yesterdaySnapshot.total_value;
      dailyGain = totalValue - yesterdayValue;
      dailyGainPercent = (yesterdayValue > 0) 
        ? ((dailyGain / yesterdayValue) * 100) 
        : 0;
      
      console.log('Daily change: Today LIVE vs Yesterday Close (recalculated snapshot)', {
        todayLiveValue: totalValue.toFixed(2),
        yesterdayCloseValue: yesterdayValue.toFixed(2),
        yesterdayDate: yesterdayDateStr,
        dailyGain: dailyGain.toFixed(2),
        dailyGainPercent: dailyGainPercent.toFixed(2) + '%',
        usingFilteredSnapshots: filteredSnapshots.length > 0,
      });
    } else {
      // Fallback: Use calculated baseline from historical prices
      if (yesterdayBaseline !== null && yesterdayBaseline > 0) {
        dailyGain = totalValue - yesterdayBaseline;
        dailyGainPercent = (yesterdayBaseline > 0)
          ? ((dailyGain / yesterdayBaseline) * 100)
          : 0;

        console.log('Daily change: Today LIVE vs Yesterday Close (calculated baseline - fallback)', {
          todayLiveValue: totalValue.toFixed(2),
          yesterdayBaseline: yesterdayBaseline.toFixed(2),
          yesterdayDate: yesterdayDateStr,
          dailyGain: dailyGain.toFixed(2),
          dailyGainPercent: dailyGainPercent.toFixed(2) + '%',
          availableSnapshots: snapshotsToUse.map(s => s.date),
        });
      } else {
        console.log('Cannot calculate daily change - no yesterday snapshot or baseline', {
          snapshotsCount: snapshotsToUse.length,
          yesterdayDate: yesterdayDateStr,
          availableDates: snapshotsToUse.map(s => s.date),
        });
      }
    }

    console.log('Metrics calculated:', {
      totalValue: parseFloat(totalValue.toFixed(2)),
      totalCost: parseFloat(totalCost.toFixed(2)),
      totalGain: parseFloat(totalGain.toFixed(2)),
      dailyGain: parseFloat(dailyGain.toFixed(2)),
      dailyGainPercent: parseFloat(dailyGainPercent.toFixed(2)),
      holdingsCount: holdings.length,
      holdings: holdings.map(h => ({
        ticker: h.ticker,
        shares: h.shares,
        avgCost: h.avgCost,
        currentPrice: h.currentPrice,
        value: h.shares * h.currentPrice,
        cost: h.shares * h.avgCost
      }))
    });

    return { 
      totalValue, 
      totalCost, 
      totalGain, 
      totalGainPercent, 
      dailyGain: parseFloat(dailyGain.toFixed(2)), 
      dailyGainPercent: parseFloat(dailyGainPercent.toFixed(2))
    };
  };

  const metrics = calculateMetrics();

  // Calculate best and worst performers
  const getBestWorstPerformers = () => {
    if (holdings.length === 0) return { best: null, worst: null };
    
    const performers = holdings.map(holding => {
      const marketValue = holding.shares * holding.currentPrice;
      const totalCost = holding.shares * holding.avgCost;
      const gain = marketValue - totalCost;
      const gainPercent = totalCost > 0 ? (gain / totalCost) * 100 : 0;
      
      return {
        ticker: holding.ticker,
        name: holding.name,
        gain,
        gainPercent,
        value: marketValue,
      };
    }).sort((a, b) => b.gainPercent - a.gainPercent);
    
    return {
      best: performers[0],
      worst: performers[performers.length - 1],
    };
  };

  const performers = getBestWorstPerformers();

  const COLORS = ['#a78bfa', '#c084fc', '#e879f9', '#f0abfc', '#fda4af', '#fb923c', '#fbbf24', '#a3e635'];

  // Prepare data for charts - group holdings below 4% into "Others"
  const calculateAllocationData = () => {
    if (holdings.length === 0) return [];
    
    // Calculate total portfolio value
    const totalValue = holdings.reduce((sum, holding) => {
      return sum + (holding.shares * holding.currentPrice);
    }, 0);
    
    if (totalValue === 0) return [];
    
    // Calculate percentage for each holding
    const holdingsWithPercent = holdings.map((holding, idx) => {
      const value = holding.shares * holding.currentPrice;
      const percentage = (value / totalValue) * 100;
      return {
    name: holding.ticker,
        value: value,
        percentage: percentage,
    color: COLORS[idx % COLORS.length],
      };
    });
    
    // Separate holdings above and below 5%
    const significantHoldings = holdingsWithPercent.filter(h => h.percentage >= 5);
    const smallHoldings = holdingsWithPercent.filter(h => h.percentage < 5);
    
    // Group small holdings into "Others"
    const allocationData: Array<{ name: string; value: number; percentage: number; color: string }> = [...significantHoldings];
    
    if (smallHoldings.length > 0) {
      const othersValue = smallHoldings.reduce((sum, h) => sum + h.value, 0);
      const othersPercentage = (othersValue / totalValue) * 100;
      
      // Only add "Others" if it's > 0
      if (othersValue > 0) {
        allocationData.push({
          name: `Others (${smallHoldings.length})`,
          value: othersValue,
          percentage: othersPercentage,
          color: '#6b7280', // Gray color for "Others"
        });
      }
    }
    
    return allocationData;
  };
  
  const allocationData = calculateAllocationData();

  const plData = holdings.map((holding) => {
    const marketValue = holding.shares * holding.currentPrice;
    const totalCost = holding.shares * holding.avgCost;
    const pl = marketValue - totalCost;
    return {
      ticker: holding.ticker,
      pl: parseFloat(pl.toFixed(2)),
      fill: pl >= 0 ? '#4ade80' : '#f87171',
    };
  });

  // Filter snapshots based on selected time period
  const getFilteredSnapshotsByPeriod = () => {
    if (timePeriod === 'ALL') return filteredSnapshots;
    
    const now = new Date();
    const cutoffDate = new Date();
    
    switch (timePeriod) {
      case '1M':
        cutoffDate.setMonth(now.getMonth() - 1);
        break;
      case '3M':
        cutoffDate.setMonth(now.getMonth() - 3);
        break;
      case '6M':
        cutoffDate.setMonth(now.getMonth() - 6);
        break;
      case '1Y':
        cutoffDate.setFullYear(now.getFullYear() - 1);
        break;
    }
    
    return filteredSnapshots.filter(s => {
      const snapshotDate = new Date(s.date + 'T00:00:00');
      return snapshotDate >= cutoffDate;
    });
  };

  // Prepare historical performance data - format dates and calculate scaling
  const performanceData = getFilteredSnapshotsByPeriod()
    .filter(s => s.total_value > 0) // Only show dates with portfolio value
    .map((snapshot) => {
      // Parse the date properly (handle YYYY-MM-DD format)
      let date: Date;
      if (typeof snapshot.date === 'string') {
        // If it's already a string like "2025-01-07", parse it correctly
        date = new Date(snapshot.date + 'T00:00:00'); // Add time to avoid timezone issues
      } else {
        date = new Date(snapshot.date);
      }
      
      // Format date for display - include year to avoid confusion
      // Show abbreviated format: "Jan 7 '25" or "Jan 7, 2025" for older dates
      const now = new Date();
      const year = date.getFullYear();
      const month = date.toLocaleDateString('en-US', { month: 'short' });
      const day = date.getDate();
      
      // If same year, show "Jan 7" format, otherwise show year
      let formattedDate: string;
      if (year === now.getFullYear()) {
        formattedDate = `${month} ${day}`;
      } else {
        formattedDate = `${month} ${day}, ${year}`;
      }
      
      return {
        date: formattedDate,
        fullDate: snapshot.date, // Keep full date for reference
        dateObj: date, // Keep Date object for sorting/comparison
    value: snapshot.total_value,
    cost: snapshot.total_cost,
      };
    })
    .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime()); // Ensure sorted by date
  
  // Calculate Y-axis domain for better scaling
  const allValues = performanceData.length > 0 
    ? performanceData.map(d => [d.value, d.cost]).flat()
    : [0];
  const minValue = Math.min(...allValues, 0) * 0.95; // 5% padding below
  const maxValue = Math.max(...allValues) * 1.05; // 5% padding above

  const handleSubmit = async () => {
    if (!formData.ticker || !formData.shares || !formData.price || !formData.date) {
      alert('Please fill in all fields');
      return;
    }

    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: formData.ticker,
          shares: formData.shares,
          price: formData.price,
          date: formData.date,
        }),
      });

      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await res.text();
        console.error('Non-JSON response:', text);
        alert(`Error adding transaction: ${res.status} ${res.statusText}`);
        return;
      }

      const data = await res.json();

      if (res.ok) {
        setShowAddForm(false);
        setFormData({ ticker: '', shares: '', price: '', date: new Date().toISOString().split('T')[0] });
        fetchTransactions();
      } else {
        alert(`Error adding transaction: ${data.error || 'Unknown error'}`);
      }
    } catch (error: any) {
      console.error('Error:', error);
      alert(`Error adding transaction: ${error.message || 'Network error'}`);
    }
  };

  const handleDeleteStock = async (ticker: string) => {
    if (!confirm(`Delete all transactions for ${ticker}?`)) {
      return;
    }

    try {
      const transactionsToDelete = transactions.filter(t => t.ticker === ticker);
      
      for (const txn of transactionsToDelete) {
        const res = await fetch(`/api/transactions/${txn.id}`, {
          method: 'DELETE',
        });

        const contentType = res.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          const text = await res.text();
          console.error('Non-JSON response:', text);
          throw new Error(`Failed to delete transaction: ${res.status} ${res.statusText}`);
        }

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to delete transaction');
        }
      }

      fetchTransactions();
    } catch (error: any) {
      console.error('Error deleting transactions:', error);
      alert(`Error deleting transactions: ${error.message || 'Unknown error'}`);
    }
  };

  const handleClearAllTransactions = async () => {
    if (!confirm('Are you sure you want to delete ALL transactions? This action cannot be undone.')) {
      return;
    }

    if (!confirm('This will permanently delete all your transaction history. Are you absolutely sure?')) {
      return;
    }

    try {
      const res = await fetch('/api/transactions', {
        method: 'DELETE',
      });

      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await res.text();
        console.error('Non-JSON response:', text);
        throw new Error(`Failed to delete transactions: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete transactions');
      }

      await fetchTransactions();
      alert('All transactions deleted successfully!');
    } catch (error: any) {
      console.error('Error clearing transactions:', error);
      alert(`Error clearing transactions: ${error.message || 'Unknown error'}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-xl text-purple-300">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <div className="flex justify-between items-start">
            <div>
          <h1 className="text-5xl font-bold mb-2 bg-gradient-to-r from-purple-400 to-purple-200 bg-clip-text text-transparent">
                StockSight
          </h1>
              <p className="text-gray-400">Your personal trading partner</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleClearAllTransactions}
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors"
                title="Delete all transactions"
              >
                <Trash2 size={18} />
                Clear All Transactions
              </button>
              {questradeLinked ? (
                <>
                  <button
                    onClick={handleSyncQuestrade}
                    disabled={syncingQuestrade}
                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition-colors"
                  >
                    <RefreshCw size={18} className={syncingQuestrade ? 'animate-spin' : ''} />
                    {syncingQuestrade ? 'Syncing...' : 'Sync Questrade'}
                  </button>
                  <button
                    onClick={handleUnlinkQuestrade}
                    className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors"
                  >
                    <Unlink size={18} />
                    Unlink Questrade
                  </button>
                </>
              ) : (
                <button
                  onClick={handleLinkQuestrade}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  <Link2 size={18} />
                  Link Questrade Account
                </button>
              )}
            </div>
          </div>
        </div>

        {fetchingPrices && (
          <div className="mb-4 text-center text-purple-400 text-sm">
            Fetching live prices...
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-purple-500/50 transition-all">
            <p className="text-gray-400 text-sm mb-2">Total Portfolio Value</p>
            <p className="text-3xl font-bold mb-1 text-white">
              ${metrics.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <div className="flex items-center gap-2 text-sm">
              <span className={metrics.totalGain >= 0 ? 'text-green-400' : 'text-red-400'}>
                ${Math.abs(metrics.totalGain).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({metrics.totalGainPercent}%)
              </span>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-purple-500/50 transition-all">
            <p className="text-gray-400 text-sm mb-2">Today's Change</p>
            <div className="flex items-center gap-2 mb-1">
              {metrics.dailyGain >= 0 ? (
                <TrendingUp className="text-green-400" size={24} />
              ) : (
                <TrendingDown className="text-red-400" size={24} />
              )}
              <p className={`text-3xl font-bold ${metrics.dailyGain >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                ${Math.abs(metrics.dailyGain).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <p className={`text-sm ${metrics.dailyGainPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {metrics.dailyGainPercent >= 0 ? '+' : ''}{metrics.dailyGainPercent}%
            </p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-purple-500/50 transition-all">
            <p className="text-gray-400 text-sm mb-2">Total Invested</p>
            <p className="text-3xl font-bold mb-1 text-white">
              ${metrics.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-gray-400 text-sm">Across {holdings.length} positions</p>
          </div>
        </div>

        {/* Historical Performance Chart */}
        {snapshots.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Portfolio Performance Over Time</h3>
              <div className="flex gap-2">
                {(['1M', '3M', '6M', '1Y', 'ALL'] as const).map((period) => (
              <button
                    key={period}
                    onClick={() => setTimePeriod(period)}
                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                      timePeriod === period
                        ? 'bg-purple-600 text-white'
                        : 'bg-zinc-800 text-gray-300 hover:bg-zinc-700'
                    }`}
                  >
                    {period}
              </button>
                ))}
              </div>
            </div>

            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={performanceData} margin={{ bottom: 80, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                <XAxis 
                  dataKey="date" 
                  stroke="#9ca3af"
                  tick={{ fill: '#9ca3af', fontSize: 11 }}
                  angle={-45}
                  textAnchor="end"
                  height={100}
                  interval="preserveStartEnd"
                />
                <YAxis 
                  stroke="#9ca3af"
                  tick={{ fill: '#9ca3af', fontSize: 12 }}
                  domain={[minValue, maxValue]}
                  tickFormatter={(value) => {
                    if (value >= 1000) {
                      return `$${(value / 1000).toFixed(0)}k`;
                    }
                    return `$${value.toFixed(0)}`;
                  }}
                  width={80}
                />
                {/* @ts-ignore */}
                <Tooltip 
                  formatter={(value: any) => `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px' }}
                  labelStyle={{ color: '#fff' }}
                  labelFormatter={(label, payload) => {
                    if (payload && payload[0] && payload[0].payload) {
                      const fullDate = payload[0].payload.fullDate;
                      if (fullDate) {
                        const dateObj = typeof fullDate === 'string' 
                          ? new Date(fullDate + 'T00:00:00')
                          : new Date(fullDate);
                        return dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
                      }
                    }
                    return label;
                  }}
                />
                <Legend />
                <Line type="monotone" dataKey="value" stroke="#a78bfa" strokeWidth={2} name="Portfolio Value" dot={false} />
                <Line type="monotone" dataKey="cost" stroke="#9ca3af" strokeWidth={2} name="Total Invested" strokeDasharray="5 5" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Performance Metrics Section */}
        {holdings.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {/* ROI Card */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-purple-500/50 transition-all">
              <p className="text-gray-400 text-sm mb-2">Return on Investment</p>
              <p className={`text-3xl font-bold mb-1 ${metrics.totalGain >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {metrics.totalGainPercent}%
              </p>
              <p className="text-gray-400 text-xs">
                {metrics.totalGain >= 0 ? 'Profit' : 'Loss'} of ${Math.abs(metrics.totalGain).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>

            {/* Best Performer */}
            {performers.best && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-green-500/50 transition-all">
                <p className="text-gray-400 text-sm mb-2">Best Performer</p>
                <p className="text-xl font-bold mb-1 text-white">{performers.best.ticker}</p>
                <p className="text-green-400 text-2xl font-bold mb-1">
                  +{performers.best.gainPercent.toFixed(2)}%
                </p>
                <p className="text-gray-400 text-xs">
                  ${Math.abs(performers.best.gain).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            )}

            {/* Worst Performer */}
            {performers.worst && performers.worst.ticker !== performers.best?.ticker && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-red-500/50 transition-all">
                <p className="text-gray-400 text-sm mb-2">Worst Performer</p>
                <p className="text-xl font-bold mb-1 text-white">{performers.worst.ticker}</p>
                <p className="text-red-400 text-2xl font-bold mb-1">
                  {performers.worst.gainPercent.toFixed(2)}%
                </p>
                <p className="text-gray-400 text-xs">
                  ${Math.abs(performers.worst.gain).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            )}

            {/* Average Return */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-purple-500/50 transition-all">
              <p className="text-gray-400 text-sm mb-2">Average Return</p>
              <p className="text-3xl font-bold mb-1 text-white">
                {holdings.length > 0
                  ? (
                      holdings.reduce((sum, h) => {
                        const gain = (h.shares * h.currentPrice) - (h.shares * h.avgCost);
                        const gainPercent = h.shares * h.avgCost > 0 ? (gain / (h.shares * h.avgCost)) * 100 : 0;
                        return sum + gainPercent;
                      }, 0) / holdings.length
                    ).toFixed(2)
                  : '0.00'
                }%
              </p>
              <p className="text-gray-400 text-xs">Per position</p>
            </div>
          </div>
        )}    

        {/* Charts Section */}
        {holdings.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Portfolio Allocation Pie Chart */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Portfolio Allocation</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={allocationData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(1)}%`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {allocationData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number | undefined) => value !== undefined ? `$${value.toFixed(2)}` : ''}
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px' }}
                    labelStyle={{ color: '#fff' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* P&L Bar Chart */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Profit & Loss by Holding</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={plData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                  <XAxis dataKey="ticker" stroke="#9ca3af" />
                  <YAxis stroke="#9ca3af" />
                  <Tooltip 
                    formatter={(value: number | undefined) => value !== undefined ? `$${value.toFixed(2)}` : ''}
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px' }}
                    labelStyle={{ color: '#fff' }}
                  />
                  <Bar dataKey="pl" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden mb-6">
          <div className="flex justify-between items-center p-6 border-b border-zinc-800">
            <h2 className="text-xl font-semibold text-white">Holdings</h2>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  placeholder="Search by ticker..."
                  value={holdingsSearch}
                  onChange={(e) => setHoldingsSearch(e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 rounded-lg pl-10 pr-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors w-64"
                />
              </div>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              <Plus size={18} />
              Add Transaction
            </button>
            </div>
          </div>

          {showAddForm && (
            <div className="p-6 bg-black border-b border-zinc-800">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <input
                  type="text"
                  placeholder="Ticker (e.g. AAPL)"
                  value={formData.ticker}
                  onChange={(e) => setFormData({...formData, ticker: e.target.value.toUpperCase()})}
                  className="bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
                />
                <input
                  type="number"
                  step="0.001"
                  placeholder="Shares"
                  value={formData.shares}
                  onChange={(e) => setFormData({...formData, shares: e.target.value})}
                  className="bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Buy Price"
                  value={formData.price}
                  onChange={(e) => setFormData({...formData, price: e.target.value})}
                  className="bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
                />
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({...formData, date: e.target.value})}
                  className="bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500 transition-colors"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSubmit}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors font-medium"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => setShowAddForm(false)}
                    className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            {holdings.length === 0 ? (
              <div className="p-12 text-center text-gray-500">
                <p>No holdings yet. Click "Add Transaction" to get started!</p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-black">
                  <tr>
                    <th 
                      className="text-left p-4 text-gray-400 font-medium cursor-pointer hover:text-white transition-colors"
                      onClick={() => {
                        if (holdingsSortField === 'ticker') {
                          setHoldingsSortDirection(holdingsSortDirection === 'asc' ? 'desc' : 'asc');
                        } else {
                          setHoldingsSortField('ticker');
                          setHoldingsSortDirection('asc');
                        }
                      }}
                    >
                      <div className="flex items-center gap-2">
                        Symbol
                        {holdingsSortField === 'ticker' && (
                          holdingsSortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                        )}
                      </div>
                    </th>
                    <th className="text-left p-4 text-gray-400 font-medium">Name</th>
                    <th 
                      className="text-right p-4 text-gray-400 font-medium cursor-pointer hover:text-white transition-colors"
                      onClick={() => {
                        if (holdingsSortField === 'shares') {
                          setHoldingsSortDirection(holdingsSortDirection === 'asc' ? 'desc' : 'asc');
                        } else {
                          setHoldingsSortField('shares');
                          setHoldingsSortDirection('desc');
                        }
                      }}
                    >
                      <div className="flex items-center justify-end gap-2">
                        Shares
                        {holdingsSortField === 'shares' && (
                          holdingsSortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                        )}
                      </div>
                    </th>
                    <th 
                      className="text-right p-4 text-gray-400 font-medium cursor-pointer hover:text-white transition-colors"
                      onClick={() => {
                        if (holdingsSortField === 'avgCost') {
                          setHoldingsSortDirection(holdingsSortDirection === 'asc' ? 'desc' : 'asc');
                        } else {
                          setHoldingsSortField('avgCost');
                          setHoldingsSortDirection('desc');
                        }
                      }}
                    >
                      <div className="flex items-center justify-end gap-2">
                        Avg Cost
                        {holdingsSortField === 'avgCost' && (
                          holdingsSortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                        )}
                      </div>
                    </th>
                    <th 
                      className="text-right p-4 text-gray-400 font-medium cursor-pointer hover:text-white transition-colors"
                      onClick={() => {
                        if (holdingsSortField === 'currentPrice') {
                          setHoldingsSortDirection(holdingsSortDirection === 'asc' ? 'desc' : 'asc');
                        } else {
                          setHoldingsSortField('currentPrice');
                          setHoldingsSortDirection('desc');
                        }
                      }}
                    >
                      <div className="flex items-center justify-end gap-2">
                        Current Price
                        {holdingsSortField === 'currentPrice' && (
                          holdingsSortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                        )}
                      </div>
                    </th>
                    <th 
                      className="text-right p-4 text-gray-400 font-medium cursor-pointer hover:text-white transition-colors"
                      onClick={() => {
                        if (holdingsSortField === 'marketValue') {
                          setHoldingsSortDirection(holdingsSortDirection === 'asc' ? 'desc' : 'asc');
                        } else {
                          setHoldingsSortField('marketValue');
                          setHoldingsSortDirection('desc');
                        }
                      }}
                    >
                      <div className="flex items-center justify-end gap-2">
                        Market Value
                        {holdingsSortField === 'marketValue' && (
                          holdingsSortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                        )}
                      </div>
                    </th>
                    <th 
                      className="text-right p-4 text-gray-400 font-medium cursor-pointer hover:text-white transition-colors"
                      onClick={() => {
                        if (holdingsSortField === 'totalPL') {
                          setHoldingsSortDirection(holdingsSortDirection === 'asc' ? 'desc' : 'asc');
                        } else {
                          setHoldingsSortField('totalPL');
                          setHoldingsSortDirection('desc');
                        }
                      }}
                    >
                      <div className="flex items-center justify-end gap-2">
                        Total P&L
                        {holdingsSortField === 'totalPL' && (
                          holdingsSortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                        )}
                      </div>
                    </th>
                    <th className="text-right p-4 text-gray-400 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    // Filter holdings by search term
                    let filtered = holdings.filter(h => 
                      h.ticker.toLowerCase().includes(holdingsSearch.toLowerCase()) ||
                      h.name.toLowerCase().includes(holdingsSearch.toLowerCase())
                    );

                    // Sort holdings
                    if (holdingsSortField) {
                      filtered = [...filtered].sort((a, b) => {
                        let aVal: any;
                        let bVal: any;

                        switch (holdingsSortField) {
                          case 'ticker':
                            aVal = a.ticker.toLowerCase();
                            bVal = b.ticker.toLowerCase();
                            break;
                          case 'shares':
                            aVal = a.shares;
                            bVal = b.shares;
                            break;
                          case 'avgCost':
                            aVal = a.avgCost;
                            bVal = b.avgCost;
                            break;
                          case 'currentPrice':
                            aVal = a.currentPrice;
                            bVal = b.currentPrice;
                            break;
                          case 'marketValue':
                            aVal = a.shares * a.currentPrice;
                            bVal = b.shares * b.currentPrice;
                            break;
                          case 'totalPL':
                            const aMarketValue = a.shares * a.currentPrice;
                            const aCost = a.shares * a.avgCost;
                            const aPL = aMarketValue - aCost;
                            const bMarketValue = b.shares * b.currentPrice;
                            const bCost = b.shares * b.avgCost;
                            const bPL = bMarketValue - bCost;
                            aVal = aPL;
                            bVal = bPL;
                            break;
                          default:
                            return 0;
                        }

                        if (aVal < bVal) return holdingsSortDirection === 'asc' ? -1 : 1;
                        if (aVal > bVal) return holdingsSortDirection === 'asc' ? 1 : -1;
                        return 0;
                      });
                    }

                    return filtered.map((holding, idx) => {
                    const marketValue = holding.shares * holding.currentPrice;
                    const totalCost = holding.shares * holding.avgCost;
                    const totalPL = marketValue - totalCost;
                    const totalPLPercent = ((totalPL / totalCost) * 100).toFixed(2);

                    return (
                      <tr key={idx} className="border-t border-zinc-800 hover:bg-zinc-900/50 transition-colors">
                        <td className="p-4 font-semibold text-purple-400">{holding.ticker}</td>
                        <td className="p-4 text-gray-300">{holding.name}</td>
                        <td className="p-4 text-right text-gray-300">{holding.shares.toFixed(3)}</td>
                        <td className="p-4 text-right text-gray-300">${holding.avgCost.toFixed(2)}</td>
                        <td className="p-4 text-right text-gray-300">${holding.currentPrice.toFixed(2)}</td>
                        <td className="p-4 text-right font-semibold text-white">${marketValue.toFixed(2)}</td>
                        <td className={`p-4 text-right font-semibold ${totalPL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          ${totalPL.toFixed(2)} ({totalPLPercent}%)
                        </td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => handleDeleteStock(holding.ticker)}
                            className="text-gray-400 hover:text-red-500 transition-colors p-2"
                            title="Delete all transactions"
                          >
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </tr>
                    );
                    });
                  })()}
                </tbody>
              </table>
            )}
          </div>
          {holdingsSearch && (
            <div className="p-4 border-t border-zinc-800 text-sm text-gray-400">
              Showing {holdings.filter(h => 
                h.ticker.toLowerCase().includes(holdingsSearch.toLowerCase()) ||
                h.name.toLowerCase().includes(holdingsSearch.toLowerCase())
              ).length} of {holdings.length} holdings
            </div>
          )}
        </div>

        <div className="text-center text-gray-600 text-sm">
          <p>Live prices from Yahoo Finance • Daily change is simulated</p>
        </div>
      </div>
    </div>
  );
}