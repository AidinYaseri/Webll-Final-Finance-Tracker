import { Router } from "express";
import pool from "../db.js";
import { authMiddleware, isAdmin } from "../middleware.js";

const router = Router();

// Get all categories
router.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM categories ORDER BY name");
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create custom category (optional)
router.post("/", authMiddleware, isAdmin, async (req, res) => {
  try {
    const { name, type } = req.body;

    if (!name || !type) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (!["income", "expense"].includes(type)) {
      return res.status(400).json({ error: "Type must be income or expense" });
    }

    const result = await pool.query(
      "INSERT INTO categories (name, type) VALUES ($1, $2) RETURNING *",
      [name, type],
    );

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    if (error.code === "23505") {
      return res.status(400).json({ error: "Category already exists" });
    }
    res.status(500).json({ error: error.message });
  }
});

// Delete category
router.delete("/:id", authMiddleware, isAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM categories WHERE category_id = $1 RETURNING category_id",
      [req.params.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Category not found" });
    }

    res.json({ message: "Category deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
