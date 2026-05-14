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
