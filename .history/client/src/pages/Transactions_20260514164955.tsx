import { useState, useEffect } from 'react';
import { transactionAPI, categoryAPI } from '../services/api';
import { TransactionForm } from '../components/TransactionForm';
import { TransactionList } from '../components/TransactionList';
import '../styles/Transactions.css';

export const Transactions = () => {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [filterCategory, setFilterCategory] = useState<number | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [transRes, catRes] = await Promise.all([
        transactionAPI.getAll(),
        categoryAPI.getAll(),
      ]);
      setTransactions(transRes.data);
      setCategories(catRes.data);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddTransaction = async (data: any) => {
    try {
      if (editingId) {
        await transactionAPI.update(editingId, data);
        setEditingId(null);
      } else {
        await transactionAPI.create(data);
      }
      await loadData();
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save transaction');
    }
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this transaction?')) {
      try {
        await transactionAPI.delete(id);
        await loadData();
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to delete transaction');
      }
    }
  };

  const handleEdit = (id: number) => {
    setEditingId(id);
  };

  const handleCancel = () => {
    setEditingId(null);
  };

  const filteredTransactions = transactions.filter((t) => {
    if (filterType !== 'all' && t.type !== filterType) return false;
    if (filterCategory && t.category_id !== filterCategory) return false;
    return true;
  });

  if (isLoading) return <div className="loading">Loading transactions...</div>;

  return (
    <div className="transactions">
      <h1>Transactions</h1>

      {error && <div className="error-message">{error}</div>}

      <div className="transactions-container">
        <div className="transaction-form-section">
          <TransactionForm
            categories={categories}
            onSubmit={handleAddTransaction}
            editingId={editingId}
            onCancel={handleCancel}
          />
        </div>

        <div className="transaction-list-section">
          <div className="filters">
            <div className="filter-group">
              <label>Type:</label>
              <select value={filterType} onChange={(e) => setFilterType(e.target.value as any)}>
                <option value="all">All</option>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>
            </div>
            <div className="filter-group">
              <label>Category:</label>
              <select
                value={filterCategory || ''}
                onChange={(e) => setFilterCategory(e.target.value ? parseInt(e.target.value) : null)}
              >
                <option value="">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat.category_id} value={cat.category_id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <TransactionList
            transactions={filteredTransactions}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        </div>
      </div>
    </div>
  );
};
