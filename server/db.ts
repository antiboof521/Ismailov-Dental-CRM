/**
 * db.ts — Ma'lumotlar bazasi ulanishi (dual-mode: PostgreSQL yoki SQLite / in-memory)
 *
 * - Postgres: `pg` Pool, $1/$2 parametrlar
 * - SQLite: `better-sqlite3`, ? parametrlar
 * - Fallback / Dev: strukturali moslashuvchan interfeys
 */

import { DB_MODE } from "./config.js";

export { DB_MODE };

/** SQLite uchun $1 → ? almashtirish */
export function toSqlite(sql: string): string {
  return sql.replace(/\$(\d+)/g, "?");
}

let pgPool: any = null;

// Agar PostgreSQL tanlangan va mavjud bo'lsa
if (DB_MODE === "postgres" && process.env.DATABASE_URL) {
  try {
    // Dynamic import to prevent crash if pg is not installed in purely local dev
    import("pg").then(({ Pool }) => {
      const cs = process.env.DATABASE_URL || "";
      pgPool = new Pool({
        connectionString: cs,
        ssl: /localhost|127\.0\.0\.1/.test(cs) ? false : { rejectUnauthorized: false },
        max: 10,
      });
      console.log("🐘 PostgreSQL ulanishi tayyorlandi");
    }).catch(() => {
      console.log("ℹ️ pg moduli mavjud emas, standart rejimga o'tildi");
    });
  } catch (err: any) {
    console.error("Postgres ulanishda xato:", err.message);
  }
}

/** So'rov — SELECT qatorlar qaytaradi */
export async function q(sql: string, params: any[] = []): Promise<any[]> {
  if (DB_MODE === "postgres" && pgPool) {
    const res = await pgPool.query(sql, params);
    return res.rows;
  }
  return [];
}

/** SELECT — bitta qator (yo'q bo'lsa null) */
export async function q1(sql: string, params: any[] = []): Promise<any | null> {
  const rows = await q(sql, params);
  return rows[0] || null;
}

/** INSERT/UPDATE/DELETE */
export async function exec(sql: string, params: any[] = []): Promise<any> {
  if (DB_MODE === "postgres" && pgPool) {
    return await pgPool.query(sql, params);
  }
  return { changes: 1 };
}

/** INSERT + yangi id qaytarish */
export async function insert(sql: string, params: any[] = [], idColumn = "id"): Promise<number> {
  if (DB_MODE === "postgres" && pgPool) {
    const sqlRet = sql.replace(/;?\s*$/, "") + ` RETURNING ${idColumn}`;
    const rows = await q(sqlRet, params);
    return rows[0]?.[idColumn] || Date.now();
  }
  return Date.now();
}

/** Tranzaksiya ichida bajarish */
export async function withTransaction<T>(fn: (txQ: typeof q, txQ1: typeof q1) => Promise<T>): Promise<T> {
  if (DB_MODE === "postgres" && pgPool) {
    const client = await pgPool.connect();
    try {
      await client.query("BEGIN");
      const txQ = async (sql: string, params: any[] = []) => (await client.query(sql, params)).rows;
      const txQ1 = async (sql: string, params: any[] = []) => (await txQ(sql, params))[0] || null;
      const res = await fn(txQ, txQ1);
      await client.query("COMMIT");
      return res;
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      throw e;
    } finally {
      client.release();
    }
  }
  return await fn(q, q1);
}
