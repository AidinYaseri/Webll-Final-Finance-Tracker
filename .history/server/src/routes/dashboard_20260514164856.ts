import { Router } from 'express';
import pool from '../db.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware.js';

const router = Router();

// Get dashboard summary (total balance, income, expenses)
router.get('/summary', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as total_expenses,
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) as balance,
        COUNT(*) as transaction_count
       FROM transactions
       WHERE user_id = $1`,
      [req.userId]
    );

    res.json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get monthly breakdown
router.get('/monthly', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        DATE_TRUNC('month', date) as month,
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as expenses
       FROM transactions
       WHERE user_id = $1
       GROUP BY DATE_TRUNC('month', date)
       ORDER BY month DESC
       LIMIT 12`,
      [req.userId]
    );

    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get category breakdown
router.get('/categories', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        c.category_id,
        c.name,
        c.type,
        COUNT(*) as transaction_count,
        COALESCE(SUM(amount), 0) as total_amount
       FROM transactions t
       JOIN categories c ON t.category_id = c.category_id
       WHERE t.user_id = $1
       GROUP BY c.category_id, c.name, c.type
       ORDER BY total_amount DESC`,
      [req.userId]
    );

    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
