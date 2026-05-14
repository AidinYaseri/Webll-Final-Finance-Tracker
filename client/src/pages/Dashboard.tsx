import { useState, useEffect } from 'react';
import { dashboardAPI, categoryAPI, transactionAPI } from '../services/api';
import '../styles/Dashboard.css';

interface Summary {
  total_income: number;
  total_expenses: number;
  balance: number;
  transaction_count: number;
}

interface Category {
  category_id: number;
  name: string;
  type: string;
  transaction_count: number;
  total_amount: number;
}

interface Monthly {
  month: string;
  income: number;
  expenses: number;
}

export const Dashboard = () => {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [monthly, setMonthly] = useState<Monthly[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const chartData = [...monthly].reverse();
  const chartMaxValue = Math.max(...chartData.map((item) => Math.max(item.income, item.expenses)), 1);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const [summaryRes, categoriesRes, monthlyRes] = await Promise.all([
        dashboardAPI.getSummary(),
        dashboardAPI.getCategories(),
        dashboardAPI.getMonthly(),
      ]);

      setSummary(summaryRes.data);
      setCategories(categoriesRes.data);
      setMonthly(monthlyRes.data);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load dashboard data');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) return <div className="loading">Loading dashboard...</div>;

  return (
    <div className="dashboard">
      <h1>Financial Dashboard</h1>

      {error && <div className="error-message">{error}</div>}

      {summary && (
        <div className="summary-cards">
          <div className="summary-card balance">
            <h3>Balance</h3>
            <p className={summary.balance >= 0 ? 'positive' : 'negative'}>
              ${summary.balance.toFixed(2)}
            </p>
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
            <h2>Cashflow Trend</h2>
            <p>Monthly income vs expenses over the last 12 months.</p>
          </div>
          <div className="chart-legend">
            <span className="legend-item income">Income</span>
            <span className="legend-item expense">Expenses</span>
          </div>
        </div>

        {chartData.length > 0 ? (
          <div className="chart-wrap">
            <div className="chart-grid-lines">
              <span />
              <span />
              <span />
              <span />
            </div>

            <div className="chart-bars">
              {chartData.map((month) => {
                const incomeHeight = (month.income / chartMaxValue) * 100;
                const expenseHeight = (month.expenses / chartMaxValue) * 100;
                return (
                  <div key={month.month} className="chart-column">
                    <div className="chart-bars-inner">
                      <div className="bar-group income">
                        <div className="bar-value">${month.income.toFixed(0)}</div>
                        <div className="bar-track">
                          <div className="bar-fill income" style={{ height: `${Math.max(incomeHeight, 4)}%` }} />
                        </div>
                      </div>
                      <div className="bar-group expense">
                        <div className="bar-value">${month.expenses.toFixed(0)}</div>
                        <div className="bar-track">
                          <div className="bar-fill expense" style={{ height: `${Math.max(expenseHeight, 4)}%` }} />
                        </div>
                      </div>
                    </div>
                    <div className="chart-label">
                      {new Date(month.month).toLocaleDateString('en-US', { month: 'short' })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="empty-message">Add a few transactions to see the trend chart.</p>
        )}
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-section">
          <h2>Category Breakdown</h2>
          {categories.length > 0 ? (
            <div className="category-list">
              {categories.map((cat) => (
                <div key={cat.category_id} className="category-item">
                  <div className="category-info">
                    <h4>{cat.name}</h4>
                    <span className={`type ${cat.type}`}>{cat.type}</span>
                  </div>
                  <div className="category-stats">
                    <span className="amount">${cat.total_amount.toFixed(2)}</span>
                    <span className="count">{cat.transaction_count} transaction(s)</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-message">No transactions yet</p>
          )}
        </div>

        <div className="dashboard-section">
          <h2>Monthly Overview (Last 12 Months)</h2>
          {monthly.length > 0 ? (
            <div className="monthly-list">
              {monthly.map((month, idx) => (
                <div key={idx} className="monthly-item">
                  <h4>{new Date(month.month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h4>
                  <div className="monthly-breakdown">
                    <div>
                      <span>Income:</span>
                      <span className="amount income">${month.income.toFixed(2)}</span>
                    </div>
                    <div>
                      <span>Expenses:</span>
                      <span className="amount expense">${month.expenses.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-message">No monthly data yet</p>
          )}
        </div>
      </div>

      <button className="refresh-btn" onClick={loadDashboardData}>
        Refresh
      </button>
    </div>
  );
};
