'use client';

import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Plus, X, Trash2 } from 'lucide-react';
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
  const [showAllHistory, setShowAllHistory] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchTransactions();
    fetchSnapshots();
  }, []);

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
      setTransactions(data);
      await processHoldings(data);
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
      setFilteredSnapshots(data);
    } catch (error) {
      console.error('Error fetching snapshots:', error);
    }
  };

  const filterToCurrentHoldings = async () => {
    if (showAllHistory === false) return; // Already filtered, don't do anything
    
    if (transactions.length === 0 || holdings.length === 0) {
      alert('No transactions or holdings available to filter');
      return;
    }

    // Get all tickers in current holdings
    const currentTickers = holdings.map(h => h.ticker);

    // Find the earliest transaction date for current holdings
    const currentHoldingsTxns = transactions.filter(t => currentTickers.includes(t.ticker));
    
    if (currentHoldingsTxns.length === 0) {
      setFilteredSnapshots([]);
      setShowAllHistory(false);
      return;
    }

    const earliestDate = new Date(
      Math.min(...currentHoldingsTxns.map(t => new Date(t.transaction_date).getTime()))
    );

    // Filter snapshots to only show dates after the earliest current holding
    const dateFiltered = snapshots.filter(s => new Date(s.date) >= earliestDate);

    // Get unique dates for fetching historical prices
    const uniqueDates = [...new Set(dateFiltered.map(s => s.date))];

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
        priceData.forEach((price: any) => {
          if (!historicalPrices[price.ticker]) {
            historicalPrices[price.ticker] = {};
          }
          historicalPrices[price.ticker][price.date] = price.close;
        });
      }
    } catch (error) {
      console.error('Error fetching historical prices:', error);
      // Fall back to proportional estimation if API fails
    }

    // Recalculate cost and value for each snapshot based only on current holdings
    const recalculated = dateFiltered.map(snapshot => {
      const snapshotDate = new Date(snapshot.date);
      const snapshotDateStr = snapshotDate.toISOString().split('T')[0];
      
      // Get all transactions for current holdings up to this snapshot date
      const txnsUpToDate = currentHoldingsTxns.filter(
        t => new Date(t.transaction_date) <= snapshotDate
      );

      if (txnsUpToDate.length === 0) {
        return {
          ...snapshot,
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
      let hasHistoricalPrices = false;

      // Check if this is today's date
      const today = new Date();
      const isToday = snapshotDateStr === today.toISOString().split('T')[0];

      // For today's date, use current live prices from holdings
      if (isToday) {
        Object.entries(holdingsMap).forEach(([ticker, holding]) => {
          const currentHolding = holdings.find(h => h.ticker === ticker);
          if (currentHolding) {
            recalculatedValue += holding.shares * currentHolding.currentPrice;
            hasHistoricalPrices = true;
          }
        });
      } else {
        // For historical dates, use historical prices from database
        Object.entries(holdingsMap).forEach(([ticker, holding]) => {
          const price = historicalPrices[ticker]?.[snapshotDateStr];
          if (price !== undefined) {
            recalculatedValue += holding.shares * price;
            hasHistoricalPrices = true;
          }
        });
      }

      // If we don't have historical prices (and it's not today), fall back to proportional estimation
      if (!hasHistoricalPrices && !isToday) {
        const allTxnsUpToDate = transactions.filter(
          t => new Date(t.transaction_date) <= snapshotDate
        );
        const allTimeTotalCost = allTxnsUpToDate.reduce(
          (sum, txn) => sum + (txn.shares * txn.price),
          0
        );
        const costRatio = allTimeTotalCost > 0 ? recalculatedCost / allTimeTotalCost : 0;
        recalculatedValue = snapshot.total_value * costRatio;
      }

      const recalculatedGain = recalculatedValue - recalculatedCost;

      return {
        ...snapshot,
        total_cost: Math.round(recalculatedCost * 100) / 100,
        total_value: Math.round(recalculatedValue * 100) / 100,
        total_gain: Math.round(recalculatedGain * 100) / 100,
      };
    });

    setFilteredSnapshots(recalculated);
    setShowAllHistory(false);
  };

  const showAllSnapshots = () => {
    if (showAllHistory === true) return; // Already showing all, don't do anything
    
    setFilteredSnapshots(snapshots);
    setShowAllHistory(true);
  };

  const handleRefreshData = async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/refresh-snapshots', {
        method: 'POST',
      });
      
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await res.text();
        console.error('Non-JSON response:', text);
        alert('Failed to refresh data. Check console for errors.');
        return;
      }

      const data = await res.json();
      
      if (res.ok) {
        await fetchSnapshots();
        alert('Data refreshed successfully!');
      } else {
        alert(`Failed to refresh data: ${data.error || 'Unknown error'}`);
      }
    } catch (error: any) {
      console.error('Error refreshing data:', error);
      alert(`Error refreshing data: ${error.message || 'Network error'}`);
    } finally {
      setRefreshing(false);
    }
  };

  const processHoldings = async (txns: Transaction[]) => {
    const holdingsMap: { [key: string]: { totalShares: number; totalCost: number } } = {};

    txns.forEach(txn => {
      if (!holdingsMap[txn.ticker]) {
        holdingsMap[txn.ticker] = { totalShares: 0, totalCost: 0 };
      }
      holdingsMap[txn.ticker].totalShares += txn.shares;
      holdingsMap[txn.ticker].totalCost += txn.shares * txn.price;
    });

    const tickers = Object.keys(holdingsMap);
    
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
      totalValue += holding.shares * holding.currentPrice;
      totalCost += holding.shares * holding.avgCost;
    });

    const totalGain = totalValue - totalCost;
    const totalGainPercent = totalCost > 0 ? ((totalGain / totalCost) * 100).toFixed(2) : '0.00';
    const dailyGain = totalValue * 0.012;
    const dailyGainPercent = 1.2;

    return { totalValue, totalCost, totalGain, totalGainPercent, dailyGain, dailyGainPercent };
  };

  const metrics = calculateMetrics();

  const COLORS = ['#a78bfa', '#c084fc', '#e879f9', '#f0abfc', '#fda4af', '#fb923c', '#fbbf24', '#a3e635'];

  // Prepare data for charts
  const allocationData = holdings.map((holding, idx) => ({
    name: holding.ticker,
    value: holding.shares * holding.currentPrice,
    color: COLORS[idx % COLORS.length],
  }));

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

  // Prepare historical performance data
  const performanceData = filteredSnapshots.map((snapshot) => ({
    date: new Date(snapshot.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    value: snapshot.total_value,
    cost: snapshot.total_cost,
  }));

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
          <h1 className="text-5xl font-bold mb-2 bg-gradient-to-r from-purple-400 to-purple-200 bg-clip-text text-transparent">
            StockSight
          </h1>
          <p className="text-gray-400">Your personal trading partner</p>
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
            <h3 className="text-lg font-semibold text-white mb-4">Portfolio Performance Over Time</h3>
            
            <div className="flex flex-wrap gap-3 mb-4">
              <button
                onClick={filterToCurrentHoldings}
                disabled={!showAllHistory}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all
                  ${!showAllHistory
                    ? 'bg-purple-800/50 text-purple-300 cursor-not-allowed opacity-50'
                    : 'bg-purple-600 hover:bg-purple-700 text-white cursor-pointer'}
                `}
              >
                Current Holdings Only
              </button>

              <button
                onClick={showAllSnapshots}
                disabled={showAllHistory}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all
                  ${showAllHistory
                    ? 'bg-zinc-700/50 text-zinc-400 cursor-not-allowed opacity-50'
                    : 'bg-zinc-600 hover:bg-zinc-500 text-white cursor-pointer'}
                `}
              >
                Show All History
              </button>

              <button
                onClick={handleRefreshData}
                disabled={refreshing}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition
                  ${refreshing
                    ? 'bg-green-800 text-green-300 cursor-not-allowed'
                    : 'bg-green-600 hover:bg-green-700 text-white'}
                `}
              >
                {refreshing ? 'Refreshing…' : 'Refresh Data'}
              </button>
            </div>

            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={performanceData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                <XAxis dataKey="date" stroke="#9ca3af" />
                <YAxis stroke="#9ca3af" />
                {/* @ts-ignore */}
                <Tooltip 
                  formatter={(value: any) => `$${Number(value).toFixed(2)}`}
                  contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px' }}
                  labelStyle={{ color: '#fff' }}
                />
                <Legend />
                <Line type="monotone" dataKey="value" stroke="#a78bfa" strokeWidth={2} name="Portfolio Value" />
                <Line type="monotone" dataKey="cost" stroke="#9ca3af" strokeWidth={2} name="Total Invested" strokeDasharray="5 5" />
              </LineChart>
            </ResponsiveContainer>
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
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              <Plus size={18} />
              Add Transaction
            </button>
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
                    <th className="text-left p-4 text-gray-400 font-medium">Symbol</th>
                    <th className="text-left p-4 text-gray-400 font-medium">Name</th>
                    <th className="text-right p-4 text-gray-400 font-medium">Shares</th>
                    <th className="text-right p-4 text-gray-400 font-medium">Avg Cost</th>
                    <th className="text-right p-4 text-gray-400 font-medium">Current Price</th>
                    <th className="text-right p-4 text-gray-400 font-medium">Market Value</th>
                    <th className="text-right p-4 text-gray-400 font-medium">Total P&L</th>
                    <th className="text-right p-4 text-gray-400 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((holding, idx) => {
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
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="text-center text-gray-600 text-sm">
          <p>Live prices from Yahoo Finance • Daily change is simulated</p>
        </div>
      </div>
    </div>
  );
}