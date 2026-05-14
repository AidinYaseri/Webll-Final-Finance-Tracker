import { Router } from 'express';
import pool from '../db.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware.js';

const router = Router();

// Get all transactions for current user
router.get('/', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await pool.query(
      `SELECT t.transaction_id, t.user_id, t.amount::float8 as amount, t.type, t.category_id, c.name as category_name, t.date, t.description, t.created_at
       FROM transactions t
       JOIN categories c ON t.category_id = c.category_id
       WHERE t.user_id = $1
       ORDER BY t.date DESC`,
      [req.userId]
    );

    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get single transaction
router.get('/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await pool.query(
      `SELECT t.transaction_id, t.user_id, t.amount::float8 as amount, t.type, t.category_id, c.name as category_name, t.date, t.description, t.created_at
       FROM transactions t
       JOIN categories c ON t.category_id = c.category_id
       WHERE t.transaction_id = $1 AND t.user_id = $2`,
      [req.params.id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create transaction
router.post('/', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const { amount, type, category_id, date, description } = req.body;

    if (!amount || !type || !category_id || !date) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!['income', 'expense'].includes(type)) {
      return res.status(400).json({ error: 'Type must be income or expense' });
    }

    const result = await pool.query(
      `INSERT INTO transactions (user_id, amount, type, category_id, date, description)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING transaction_id, user_id, amount::float8 as amount, type, category_id, date, description, created_at`,
      [req.userId, amount, type, category_id, date, description || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update transaction
router.put('/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const { amount, type, category_id, date, description } = req.body;

    const checkResult = await pool.query('SELECT * FROM transactions WHERE transaction_id = $1 AND user_id = $2', [
      req.params.id,
      req.userId,
    ]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const result = await pool.query(
      `UPDATE transactions 
       SET amount = COALESCE($1, amount),
           type = COALESCE($2, type),
           category_id = COALESCE($3, category_id),
           date = COALESCE($4, date),
           description = COALESCE($5, description),
           updated_at = CURRENT_TIMESTAMP
       WHERE transaction_id = $6 AND user_id = $7
       RETURNING transaction_id, user_id, amount::float8 as amount, type, category_id, date, description, updated_at`,
      [amount, type, category_id, date, description, req.params.id, req.userId]
    );

    res.json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete transaction
router.delete('/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM transactions WHERE transaction_id = $1 AND user_id = $2 RETURNING transaction_id',
      [req.params.id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    res.json({ message: 'Transaction deleted successfully', transaction_id: result.rows[0].transaction_id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
