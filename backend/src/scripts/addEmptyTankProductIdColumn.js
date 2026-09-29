import 'dotenv/config';
import pg from 'pg';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. This script requires a database connection.');
  process.exit(1);
}

const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

try {
  await client.connect();
  await client.query(
    "ALTER TABLE public.sales_records ADD COLUMN IF NOT EXISTS empty_tank_product_id VARCHAR(20) NULL;",
  );

  const result = await client.query(
    "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sales_records' AND column_name = 'empty_tank_product_id'",
  );

  console.log(JSON.stringify(result.rows, null, 2));
} finally {
  await client.end();
}
