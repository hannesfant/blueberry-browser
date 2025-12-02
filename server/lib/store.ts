import { Database } from "bun:sqlite";

const db = new Database("store.db", { create: true });

export const setup = async (): Promise<void> => {
  db.run("CREATE TABLE IF NOT EXISTS data (uid TEXT PRIMARY KEY, data TEXT)");
};

const insertStmt = db.prepare(
  "INSERT OR REPLACE INTO data (uid, data) VALUES (?, ?)",
);
const selectStmt = db.prepare("SELECT data FROM data WHERE uid = ?");

export const store = async (
  uid: string,
  data: Record<string, unknown>,
): Promise<void> => {
  insertStmt.run(uid, JSON.stringify(data));
};

export const get = async (
  uid: string,
): Promise<Record<string, unknown> | undefined> => {
  const row = selectStmt.get(uid) as { data: string } | undefined;
  if (!row) return undefined;
  return JSON.parse(row.data) as Record<string, unknown>;
};
