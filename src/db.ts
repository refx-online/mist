import mysql2 from "mysql2/promise";

let pool: mysql2.Pool;

export function getDb(): mysql2.Pool {
  if (!pool) {
    pool = mysql2.createPool({
      host: process.env.DB_HOST ?? "localhost",
      port: parseInt(process.env.DB_PORT ?? "3306", 10),
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      rowsAsArray: false,
    });
  }
  return pool;
}

export async function fetchOne<T = Record<string, unknown>>(
  sql: string,
  params?: any[]
): Promise<T | null> {
  const [rows] = await getDb().execute<mysql2.RowDataPacket[]>(sql, params ?? []);
  return (rows[0] as T) ?? null;
}

export async function fetchAll<T = Record<string, unknown>>(
  sql: string,
  params?: any[]
): Promise<T[]> {
  const [rows] = await getDb().execute<mysql2.RowDataPacket[]>(sql, params ?? []);
  return rows as T[];
}
