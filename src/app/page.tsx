'use client';

import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Plus, X } from 'lucide-react';

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

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    try {
      const res = await fetch('/api/transactions');
      const data = await res.json();
      setTransactions(data);
      await processHoldings(data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      setLoading(false);
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

      if (res.ok) {
        setShowAddForm(false);
        setFormData({ ticker: '', shares: '', price: '', date: new Date().toISOString().split('T')[0] });
        fetchTransactions();
      } else {
        alert('Error adding transaction');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error adding transaction');
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
            StockShelf
          </h1>
          <p className="text-gray-400">Your personal investment shelf</p>
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