import mysql from "mysql2/promise";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export let pool: mysql.Pool;

export async function initDb(): Promise<void> {
  pool = mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.name,
    charset: "utf8mb4",
    waitForConnections: true,
    connectionLimit: 10,
  });

  await runMigrations();
}

async function runMigrations(): Promise<void> {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename VARCHAR(255) PRIMARY KEY,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const migrationsDir = path.join(__dirname, "migrations");
  let files: string[];
  try {
    files = (await fs.readdir(migrationsDir))
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch {
    return;
  }

  const [applied] = await pool.execute<mysql.RowDataPacket[]>(
    "SELECT filename FROM _migrations"
  );
  const appliedSet = new Set(applied.map((r) => r.filename as string));

  for (const file of files) {
    if (appliedSet.has(file)) continue;
    const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      // Split on semicolons to allow multi-statement files
      const statements = sql
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const stmt of statements) {
        await conn.execute(stmt);
      }
      await conn.execute("INSERT INTO _migrations (filename) VALUES (?)", [file]);
      await conn.commit();
      console.log(`[db] migration applied: ${file}`);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
}

export function query<T extends mysql.RowDataPacket[]>(
  sql: string,
  params?: unknown[]
): Promise<[T, mysql.FieldPacket[]]> {
  return pool.execute<T>(sql, params);
}
