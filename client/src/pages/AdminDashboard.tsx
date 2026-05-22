import { useEffect, useState } from "react";
import { adminAPI, categoryAPI } from "../services/api";
import "../styles/AdminDashboard.css";

interface UserRow {
  user_id: number;
  username: string;
  email: string;
  created_at: string;
  is_admin: boolean;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<{
    totalUsers: number;
    totalTransactions: number;
  } | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryType, setNewCategoryType] = useState<"income" | "expense">(
    "expense",
  );

  const loadStats = async () => {
    const res = await adminAPI.getAdminStats();
    setStats(res.data);
  };

  const loadUsers = async () => {
    const res = await adminAPI.getAdminUsers();
    setUsers(res.data);
  };

  const loadCategories = async () => {
    const res = await categoryAPI.getAll();
    setCategories(res.data);
  };

  useEffect(() => {
    loadStats();
    loadUsers();
    loadCategories();
  }, []);

  const handleDeleteUser = async (id: number) => {
    if (!confirm("Delete this user? This action is irreversible.")) return;
    await adminAPI.deleteAdminUser(id);
    await loadUsers();
    await loadStats();
  };

  const handleCreateCategory = async (e: any) => {
    e.preventDefault();
    try {
      await categoryAPI.create({
        name: newCategoryName,
        type: newCategoryType,
      });
      setNewCategoryName("");
      await loadCategories();
    } catch (err) {
      console.error(err);
      alert("Failed to create category");
    }
  };

  const handleDeleteCategory = async (id: number) => {
    if (!confirm("Delete this category?")) return;
    try {
      await categoryAPI.delete(id);
      await loadCategories();
    } catch (err) {
      console.error(err);
      alert("Failed to delete category");
    }
  };

  return (
    <div className="admin-dashboard">
      <h1>Admin Dashboard</h1>

      <section className="stats">
        <h2>Stats Overview</h2>
        {stats ? (
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-value">{stats.totalUsers}</div>
              <div className="stat-label">Total Users</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.totalTransactions}</div>
              <div className="stat-label">Total Transactions</div>
            </div>
          </div>
        ) : (
          <div>Loading stats...</div>
        )}
      </section>

      <section className="users">
        <h2>User Management</h2>
        <table>
          <thead>
            <tr>
              <th>Username</th>
              <th>Email</th>
              <th>Admin</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.user_id}>
                <td>{u.username}</td>
                <td>{u.email}</td>
                <td>{u.is_admin ? "Yes" : "No"}</td>
                <td>{new Date(u.created_at).toLocaleString()}</td>
                <td>
                  <button onClick={() => handleDeleteUser(u.user_id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="categories">
        <h2>Category Management</h2>
        <form onSubmit={handleCreateCategory} className="category-form">
          <input
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="Category name"
            required
          />
          <select
            value={newCategoryType}
            onChange={(e) => setNewCategoryType(e.target.value as any)}
          >
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
          <button type="submit">Add Category</button>
        </form>

        <ul className="category-list">
          {categories.map((c: any) => (
            <li key={c.category_id}>
              {c.name} <em>({c.type})</em>
              <button onClick={() => handleDeleteCategory(c.category_id)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
