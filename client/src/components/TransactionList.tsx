import '../styles/TransactionList.css';

interface Transaction {
  transaction_id: number;
  amount: number;
  type: string;
  category_name: string;
  date: string;
  description: string;
}

interface TransactionListProps {
  transactions: Transaction[];
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
}

export const TransactionList = ({ transactions, onEdit, onDelete }: TransactionListProps) => {
  if (transactions.length === 0) {
    return <div className="empty-message">No transactions found</div>;
  }

  return (
    <div className="transaction-list">
      <h2>Transaction History</h2>
      <div className="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Category</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Description</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <tr key={t.transaction_id} className={`transaction-row ${t.type}`}>
                <td>{new Date(t.date).toLocaleDateString()}</td>
                <td>{t.category_name}</td>
                <td>
                  <span className={`type-badge ${t.type}`}>{t.type}</span>
                </td>
                <td className="amount">
                  <span className={t.type === 'income' ? 'positive' : 'negative'}>
                    {t.type === 'income' ? '+' : '-'}${t.amount.toFixed(2)}
                  </span>
                </td>
                <td className="description">{t.description || '-'}</td>
                <td className="actions">
                  <button className="btn-edit" onClick={() => onEdit(t.transaction_id)}>
                    Edit
                  </button>
                  <button className="btn-delete" onClick={() => onDelete(t.transaction_id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
