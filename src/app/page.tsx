'use client';

import React, { useState } from 'react';
import { TrendingUp, TrendingDown, Plus, X } from 'lucide-react';

// Mock data - we'll replace this with real API data later
const mockHoldings = [
  { ticker: 'AAPL', shares: 10.5, avgCost: 150.25, currentPrice: 178.50, name: 'Apple Inc.' },
  { ticker: 'GOOGL', shares: 5, avgCost: 125.80, currentPrice: 142.30, name: 'Alphabet Inc.' },
  { ticker: 'MSFT', shares: 8, avgCost: 310.50, currentPrice: 378.90, name: 'Microsoft Corp.' },
  { ticker: 'TSLA', shares: 3.25, avgCost: 245.00, currentPrice: 238.50, name: 'Tesla Inc.' },
];

export default function PortfolioDashboard() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    ticker: '',
    shares: '',
    price: '',
    date: new Date().toISOString().split('T')[0]
  });

  const calculateMetrics = () => {
    let totalValue = 0;
    let totalCost = 0;

    mockHoldings.forEach(holding => {
      totalValue += holding.shares * holding.currentPrice;
      totalCost += holding.shares * holding.avgCost;
    });

    const totalGain = totalValue - totalCost;
    const totalGainPercent = ((totalGain / totalCost) * 100).toFixed(2);
    const dailyGain = totalValue * 0.012;
    const dailyGainPercent = 1.2;

    return { totalValue, totalCost, totalGain, totalGainPercent, dailyGain, dailyGainPercent };
  };

  const metrics = calculateMetrics();

  const handleSubmit = (e: React.MouseEvent) => {
    e.preventDefault();
    console.log('Transaction:', formData);
    setShowAddForm(false);
    setFormData({ ticker: '', shares: '', price: '', date: new Date().toISOString().split('T')[0] });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            StockSight
          </h1>
          <p className="text-slate-400">Track your investments in real-time</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-xl p-6">
            <p className="text-slate-400 text-sm mb-2">Total Portfolio Value</p>
            <p className="text-3xl font-bold mb-1">
              ${metrics.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <div className="flex items-center gap-2 text-sm">
              <span className={metrics.totalGain >= 0 ? 'text-green-400' : 'text-red-400'}>
                ${Math.abs(metrics.totalGain).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({metrics.totalGainPercent}%)
              </span>
            </div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-xl p-6">
            <p className="text-slate-400 text-sm mb-2">Today's Change</p>
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

          <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-xl p-6">
            <p className="text-slate-400 text-sm mb-2">Total Invested</p>
            <p className="text-3xl font-bold mb-1">
              ${metrics.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-slate-400 text-sm">Across {mockHoldings.length} positions</p>
          </div>
        </div>

        <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-xl overflow-hidden mb-6">
          <div className="flex justify-between items-center p-6 border-b border-slate-700">
            <h2 className="text-xl font-semibold">Holdings</h2>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition-colors"
            >
              <Plus size={18} />
              Add Transaction
            </button>
          </div>

          {showAddForm && (
            <div className="p-6 bg-slate-900/50 border-b border-slate-700">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <input
                  type="text"
                  placeholder="Ticker (e.g. AAPL)"
                  value={formData.ticker}
                  onChange={(e) => setFormData({...formData, ticker: e.target.value.toUpperCase()})}
                  className="bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 focus:outline-none focus:border-blue-500"
                />
                <input
                  type="number"
                  step="0.001"
                  placeholder="Shares"
                  value={formData.shares}
                  onChange={(e) => setFormData({...formData, shares: e.target.value})}
                  className="bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 focus:outline-none focus:border-blue-500"
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Buy Price"
                  value={formData.price}
                  onChange={(e) => setFormData({...formData, price: e.target.value})}
                  className="bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 focus:outline-none focus:border-blue-500"
                />
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({...formData, date: e.target.value})}
                  className="bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 focus:outline-none focus:border-blue-500"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSubmit}
                    className="flex-1 bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg transition-colors"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => setShowAddForm(false)}
                    className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-900/50">
                <tr>
                  <th className="text-left p-4 text-slate-400 font-medium">Symbol</th>
                  <th className="text-left p-4 text-slate-400 font-medium">Name</th>
                  <th className="text-right p-4 text-slate-400 font-medium">Shares</th>
                  <th className="text-right p-4 text-slate-400 font-medium">Avg Cost</th>
                  <th className="text-right p-4 text-slate-400 font-medium">Current Price</th>
                  <th className="text-right p-4 text-slate-400 font-medium">Market Value</th>
                  <th className="text-right p-4 text-slate-400 font-medium">Total P&L</th>
                </tr>
              </thead>
              <tbody>
                {mockHoldings.map((holding, idx) => {
                  const marketValue = holding.shares * holding.currentPrice;
                  const totalCost = holding.shares * holding.avgCost;
                  const totalPL = marketValue - totalCost;
                  const totalPLPercent = ((totalPL / totalCost) * 100).toFixed(2);

                  return (
                    <tr key={idx} className="border-t border-slate-700 hover:bg-slate-800/30 transition-colors">
                      <td className="p-4 font-semibold text-blue-400">{holding.ticker}</td>
                      <td className="p-4 text-slate-300">{holding.name}</td>
                      <td className="p-4 text-right text-slate-300">{holding.shares}</td>
                      <td className="p-4 text-right text-slate-300">${holding.avgCost.toFixed(2)}</td>
                      <td className="p-4 text-right text-slate-300">${holding.currentPrice.toFixed(2)}</td>
                      <td className="p-4 text-right font-semibold">${marketValue.toFixed(2)}</td>
                      <td className={`p-4 text-right font-semibold ${totalPL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        ${totalPL.toFixed(2)} ({totalPLPercent}%)
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="text-center text-slate-500 text-sm">
          <p>Mock data • Real API integration coming next</p>
        </div>
      </div>
    </div>
  );
}