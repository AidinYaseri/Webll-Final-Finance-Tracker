import { Router } from "express";
import pool from "../db.js";
import { authMiddleware, isAdmin } from "../middleware.js";

const router = Router();

// Apply auth and admin check to all admin routes
router.use(authMiddleware, isAdmin);

// Get all users (omit password)
router.get("/users", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT user_id, username, email, created_at, is_admin FROM users ORDER BY created_at DESC",
    );

    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a user by id
router.delete("/users/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);

    const result = await pool.query(
      "DELETE FROM users WHERE user_id = $1 RETURNING user_id",
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(204).send();
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get basic stats
router.get("/stats", async (req, res) => {
  try {
    const usersRes = await pool.query("SELECT COUNT(*) FROM users");
    const txRes = await pool.query("SELECT COUNT(*) FROM transactions");

    const totalUsers = parseInt(usersRes.rows[0].count, 10);
    const totalTransactions = parseInt(txRes.rows[0].count, 10);

    res.json({ totalUsers, totalTransactions });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
