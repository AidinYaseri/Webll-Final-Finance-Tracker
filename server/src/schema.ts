import { getPool } from './db.js';

export const initializeDatabase = async () => {
  try {
    const pool = await getPool();

    // Create Users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        user_id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create Categories table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS categories (
        category_id SERIAL PRIMARY KEY,
        name VARCHAR(50) NOT NULL UNIQUE,
        type VARCHAR(10) CHECK (type IN ('income', 'expense')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert default categories
    await pool.query(`
      INSERT INTO categories (name, type) VALUES
      ('Salary', 'income'),
      ('Bonus', 'income'),
      ('Investment', 'income'),
      ('Other Income', 'income'),
      ('Food & Dining', 'expense'),
      ('Transportation', 'expense'),
      ('Utilities', 'expense'),
      ('Entertainment', 'expense'),
      ('Shopping', 'expense'),
      ('Health', 'expense'),
      ('Education', 'expense'),
      ('Other Expense', 'expense')
      ON CONFLICT (name) DO NOTHING
    `);

    // Create Transactions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        transaction_id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        amount DECIMAL(10, 2) NOT NULL,
        type VARCHAR(10) NOT NULL CHECK (type IN ('income', 'expense')),
        category_id INTEGER NOT NULL REFERENCES categories(category_id),
        date DATE NOT NULL,
        description VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
};
