import pkg from 'pg';
const { Client, Pool, types } = pkg;
import dotenv from 'dotenv';

dotenv.config();

// Parse PostgreSQL NUMERIC and BIGINT into JS numbers for API responses.
types.setTypeParser(1700, (value: string) => parseFloat(value));
types.setTypeParser(20, (value: string) => parseInt(value, 10));

let pool: InstanceType<typeof Pool> | null = null;

const getDatabaseName = () => {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  return new URL(connectionString).pathname.replace(/^\//, '') || 'postgres';
};

const getAdminConnectionString = () => {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  const url = new URL(connectionString);
  url.pathname = '/postgres';
  return url.toString();
};

const ensureDatabaseExists = async () => {
  const databaseName = getDatabaseName();
  const client = new Client({ connectionString: getAdminConnectionString() });

  await client.connect();

  try {
    const result = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);

    if (result.rowCount === 0) {
      try {
        await client.query(`CREATE DATABASE "${databaseName.replace(/"/g, '""')}"`);
      } catch (err: any) {
        // If another process created the DB concurrently, ignore unique violation
        if (err && err.code === '23505') {
          // already created by another process, ignore
        } else {
          throw err;
        }
      }
    }
  } finally {
    await client.end();
  }
};

export const getPool = async () => {
  if (pool) {
    return pool;
  }

  await ensureDatabaseExists();

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  pool.on('error', (err: Error) => {
    console.error('Unexpected error on idle client', err);
  });

  return pool;
};

const poolProxy = new Proxy({} as InstanceType<typeof Pool>, {
  get(_target, property) {
    if (property === 'then') {
      return undefined;
    }

    return (...args: unknown[]) => getPool().then((resolvedPool) => {
      const value = (resolvedPool as any)[property];

      if (typeof value === 'function') {
        return value.apply(resolvedPool, args);
      }

      return value;
    });
  },
}) as InstanceType<typeof Pool>;

export default poolProxy;
