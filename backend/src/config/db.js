import pg from 'pg';
import { env } from './env.js';
import { APP_TIMEZONE } from '../utils/timezone.js';

// If DATABASE_URL is not set we export a stubbed `query` function so the
// backend can be present in the repo without a configured database (demo
// frontend only mode). Attempting to call `query` will throw a clear error.
if (!env.databaseUrl) {
  console.warn('DATABASE_URL is not set. Database queries will throw when invoked.');
  export const query = () => {
    throw new Error(
      'No database configured. Set DATABASE_URL to use the real backend, or run the frontend with VITE_USE_MOCK=true for demo mode.',
    );
  };
  export default null;
} else {
  const { types } = pg;
  // Preserve raw timestamp strings for timestamp without time zone values.
  // This avoids the client receiving UTC-normalized values for local business timestamps.
  types.setTypeParser(1114, (value) => value);

  const pool = new pg.Pool({
    connectionString: env.databaseUrl,
    ssl: env.nodeEnv === 'production' ? { rejectUnauthorized: false } : undefined,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000, // fail fast instead of hanging forever
  });

  pool.on('connect', async (client) => {
    try {
      await client.query(`SET timezone = '${APP_TIMEZONE}'`);
    } catch (error) {
      console.error('Failed to initialize database timezone', error);
    }
  });

  pool.on('error', (err) => {
    console.error('Unexpected database pool error', err);
  });

  export const query = (text, params) => pool.query(text, params);

  export default pool;
}
