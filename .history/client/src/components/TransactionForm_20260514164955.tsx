import { useState, useEffect } from 'react';
import { transactionAPI } from '../services/api';
import '../styles/TransactionForm.css';

interface TransactionFormProps {
  categories: any[];
  onSubmit: (data: any) => Promise<void>;
  editingId: number | null;
  onCancel: () => void;
}

export const TransactionForm = ({ categories, onSubmit, editingId, onCancel }: TransactionFormProps) => {
  const [formData, setFormData] = useState({
    amount: '',
    type: 'expense',
    category_id: '',
    date: new Date().toISOString().split('T')[0],
    description: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (editingId) {
      // Load transaction data for editing
      transactionAPI.getById(editingId).then((res) => {
        const transaction = res.data;
        setFormData({
          amount: transaction.amount,
          type: transaction.type,
          category_id: transaction.category_id,
          date: transaction.date,
          description: transaction.description || '',
        });
      });
    }
  }, [editingId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await onSubmit({
        ...formData,
        amount: parseFloat(formData.amount),
        category_id: parseInt(formData.category_id),
      });
      setFormData({
        amount: '',
        type: 'expense',
        category_id: '',
        date: new Date().toISOString().split('T')[0],
        description: '',
      });
    } catch (err: any) {
      setError(err.message || 'Failed to save transaction');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="transaction-form">
      <h2>{editingId ? 'Edit Transaction' : 'Add Transaction'}</h2>
      {error && <div className="error-message">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Amount *</label>
          <input
            type="number"
            step="0.01"
            name="amount"
            value={formData.amount}
            onChange={handleChange}
            required
            disabled={isLoading}
            placeholder="0.00"
          />
        </div>

        <div className="form-group">
          <label>Type *</label>
          <select name="type" value={formData.type} onChange={handleChange} disabled={isLoading}>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
        </div>

        <div className="form-group">
          <label>Category *</label>
          <select name="category_id" value={formData.category_id} onChange={handleChange} required disabled={isLoading}>
            <option value="">Select a category</option>
            {categories.map((cat) => (
              <option key={cat.category_id} value={cat.category_id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Date *</label>
          <input
            type="date"
            name="date"
            value={formData.date}
            onChange={handleChange}
            required
            disabled={isLoading}
          />
        </div>

        <div className="form-group">
          <label>Description</label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            disabled={isLoading}
            placeholder="Optional description"
          />
        </div>

        <div className="form-buttons">
          <button type="submit" disabled={isLoading}>
            {isLoading ? 'Saving...' : editingId ? 'Update Transaction' : 'Add Transaction'}
          </button>
          {editingId && (
            <button type="button" onClick={onCancel} disabled={isLoading}>
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
};
