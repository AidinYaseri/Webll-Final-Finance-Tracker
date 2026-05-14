import { useEffect, useState } from 'react';
import { dashboardAPI } from '../services/api';
import '../styles/Dashboard.css';

interface Summary {
  total_income: number;
  total_expenses: number;
  balance: number;
  transaction_count: number;
}

interface Monthly {
  month: string;
  income: number;
  expenses: number;
}

interface Daily {
  date: string;
  income: number;
  expenses: number;
}

const generateAreaPath = (data: Daily[], valueKey: 'income' | 'expenses', maxValue: number, width: number, height: number) => {
  const padding = 40;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  
  const points = data.map((item, i) => {
    const x = padding + (i / Math.max(data.length - 1, 1)) * chartWidth;
    const y = height - padding - (item[valueKey] / maxValue) * chartHeight;
    return [x, y];
  });

  let path = `M ${points[0][0]},${points[0][1]}`;
  
  for (let i = 1; i < points.length; i++) {
    const x1 = (points[i - 1][0] + points[i][0]) / 2;
    const y1 = points[i - 1][1];
    const x2 = (points[i - 1][0] + points[i][0]) / 2;
    const y2 = points[i][1];
    path += ` Q ${x1},${y1} ${x2},${y2}`;
  }

  // Complete the area by drawing down to baseline
  path += ` L ${points[points.length - 1][0]},${height - padding}`;
  path += ` L ${points[0][0]},${height - padding} Z`;

  return path;
};

export const Insights = () => {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [dailyData, setDailyData] = useState<Daily[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [hoveredPoint, setHoveredPoint] = useState<{ index: number; type: 'income' | 'expenses' } | null>(null);
  
  const today = new Date();
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth() + 1);

  const chartData = dailyData;
  const chartMaxValue = Math.max(...chartData.map((item) => Math.max(item.income, item.expenses)), 1);

  useEffect(() => {
    loadInsights();
  }, [selectedYear, selectedMonth]);

  const loadInsights = async () => {
    setIsLoading(true);
    try {
      const [summaryRes, dailyRes] = await Promise.all([
        dashboardAPI.getSummary(),
        dashboardAPI.getDaily(selectedYear, selectedMonth),
      ]);

      setSummary(summaryRes.data);
      setDailyData(dailyRes.data || []);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load insights data');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedYear(selectedYear - 1);
      setSelectedMonth(12);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedYear(selectedYear + 1);
      setSelectedMonth(1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  const monthName = new Date(selectedYear, selectedMonth - 1).toLocaleDateString('en-US', { 
    month: 'long', 
    year: 'numeric' 
  });

  if (isLoading) return <div className="loading">Loading insights...</div>;

  return (
    <div className="dashboard insights-page">
      <h1>Insights</h1>
      <p className="insights-intro">A dedicated view of your monthly cashflow and spending pattern.</p>

      {error && <div className="error-message">{error}</div>}

      {summary && (
        <div className="summary-cards">
          <div className="summary-card balance">
            <h3>Current Balance</h3>
            <p className={summary.balance >= 0 ? 'positive' : 'negative'}>${summary.balance.toFixed(2)}</p>
          </div>
          <div className="summary-card income">
            <h3>Total Income</h3>
            <p>${summary.total_income.toFixed(2)}</p>
          </div>
          <div className="summary-card expense">
            <h3>Total Expenses</h3>
            <p>${summary.total_expenses.toFixed(2)}</p>
          </div>
          <div className="summary-card count">
            <h3>Transactions</h3>
            <p>{summary.transaction_count}</p>
          </div>
        </div>
      )}

      <div className="dashboard-section chart-section">
        <div className="section-header">
          <div>
            <h2>Daily Cashflow Trend</h2>
            <p>Daily income versus expenses for {monthName}.</p>
          </div>
          <div className="chart-controls">
            <button className="month-btn" onClick={handlePrevMonth}>&larr; Prev</button>
            <span className="month-display">{monthName}</span>
            <button className="month-btn" onClick={handleNextMonth}>Next &rarr;</button>
          </div>
        </div>

        {chartData.length > 0 ? (
          <div className="chart-wrap line-chart">
            <svg width="100%" height="320" viewBox="0 0 800 320" className="line-chart-svg">
              {/* Grid lines */}
              <defs>
                <linearGradient id="incomeGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" style={{ stopColor: '#7dd3fc', stopOpacity: 0.3 }} />
                  <stop offset="100%" style={{ stopColor: '#0ea5e9', stopOpacity: 0.05 }} />
                </linearGradient>
                <linearGradient id="expenseGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" style={{ stopColor: '#fda4af', stopOpacity: 0.3 }} />
                  <stop offset="100%" style={{ stopColor: '#ef4444', stopOpacity: 0.05 }} />
                </linearGradient>
              </defs>

              {/* Grid lines */}
              {[0, 1, 2, 3, 4].map((i) => (
                <line
                  key={`grid-${i}`}
                  x1="40"
                  y1={40 + (i * (320 - 80)) / 4}
                  x2="800"
                  y2={40 + (i * (320 - 80)) / 4}
                  stroke="rgba(148, 163, 184, 0.1)"
                  strokeWidth="1"
                  strokeDasharray="4,4"
                />
              ))}

              {/* Area fills */}
              <path
                d={generateAreaPath(chartData, 'income', chartMaxValue, 800, 320)}
                fill="url(#incomeGradient)"
              />
              <path
                d={generateAreaPath(chartData, 'expenses', chartMaxValue, 800, 320)}
                fill="url(#expenseGradient)"
              />

              {/* Lines */}
              <polyline
                points={
                  chartData
                    .map((item, i) => {
                      const padding = 40;
                      const chartWidth = 800 - padding * 2;
                      const chartHeight = 320 - padding * 2;
                      const x = padding + (i / Math.max(chartData.length - 1, 1)) * chartWidth;
                      const y = 320 - padding - (item.income / chartMaxValue) * chartHeight;
                      return `${x},${y}`;
                    })
                    .join(' ')
                }
                fill="none"
                stroke="url(#incomeGradient)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="line-income"
              />
              <polyline
                points={
                  chartData
                    .map((item, i) => {
                      const padding = 40;
                      const chartWidth = 800 - padding * 2;
                      const chartHeight = 320 - padding * 2;
                      const x = padding + (i / Math.max(chartData.length - 1, 1)) * chartWidth;
                      const y = 320 - padding - (item.expenses / chartMaxValue) * chartHeight;
                      return `${x},${y}`;
                    })
                    .join(' ')
                }
                fill="none"
                stroke="url(#expenseGradient)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="line-expense"
              />

              {/* Data points */}
              {chartData.map((item, i) => {
                const padding = 40;
                const chartWidth = 800 - padding * 2;
                const chartHeight = 320 - padding * 2;
                const xIncome = padding + (i / Math.max(chartData.length - 1, 1)) * chartWidth;
                const yIncome = 320 - padding - (item.income / chartMaxValue) * chartHeight;
                const xExpense = padding + (i / Math.max(chartData.length - 1, 1)) * chartWidth;
                const yExpense = 320 - padding - (item.expenses / chartMaxValue) * chartHeight;

                return (
                  <g key={`points-${i}`}>
                    <circle
                      cx={xIncome}
                      cy={yIncome}
                      r="4"
                      fill="#0ea5e9"
                      className="data-point income"
                      onMouseEnter={() => setHoveredPoint({ index: i, type: 'income' })}
                      onMouseLeave={() => setHoveredPoint(null)}
                    >
                      <title>${item.income.toFixed(2)}</title>
                    </circle>
                    <circle
                      cx={xExpense}
                      cy={yExpense}
                      r="4"
                      fill="#ef4444"
                      className="data-point expense"
                      onMouseEnter={() => setHoveredPoint({ index: i, type: 'expenses' })}
                      onMouseLeave={() => setHoveredPoint(null)}
                    >
                      <title>${item.expenses.toFixed(2)}</title>
                    </circle>
                  </g>
                );
              })}
            </svg>

            {/* X-axis labels (days) */}
            <div className="chart-labels">
              {chartData.map((item, i) => (
                <div key={`label-${i}`} className="chart-label-item">
                  {new Date(item.date).toLocaleDateString('en-US', { day: 'numeric' })}
                </div>
              ))}
            </div>

            {/* Tooltip */}
            {hoveredPoint && (
              <div className="chart-tooltip">
                <div className="tooltip-label">
                  {new Date(chartData[hoveredPoint.index].date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </div>
                <div className={`tooltip-value ${hoveredPoint.type}`}>
                  ${chartData[hoveredPoint.index][hoveredPoint.type].toFixed(2)}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="empty-message">No transactions for {monthName}.</p>
        )}
        
        <div className="chart-legend">
          <span className="legend-item income">Income</span>
          <span className="legend-item expense">Expenses</span>
        </div>
      </div>
    </div>
  );
};