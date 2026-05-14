import pkg from 'pg';
const { Pool, types } = pkg;
import dotenv from 'dotenv';

dotenv.config();

// Parse PostgreSQL NUMERIC and BIGINT into JS numbers for API responses.
types.setTypeParser(1700, (value) => parseFloat(value));
types.setTypeParser(20, (value) => parseInt(value, 10));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

export default pool;
