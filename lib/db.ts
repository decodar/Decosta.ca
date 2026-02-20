import { Pool, type QueryResultRow } from "pg";

let pool: Pool | null = null;

function getPool() {
  if (pool) {
    return pool;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Missing DATABASE_URL.");
  }

  pool = new Pool({
    connectionString
  });

  return pool;
}

export async function dbQuery<T extends QueryResultRow>(text: string, params: unknown[] = []) {
  return getPool().query<T>(text, params);
}

