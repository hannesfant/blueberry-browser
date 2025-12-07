import { Database } from "bun:sqlite";
import * as cron from "cron";

const db = new Database("store.db", { create: true });

export const setup = async (): Promise<void> => {
  db.run("CREATE TABLE IF NOT EXISTS users (uid TEXT PRIMARY KEY, data TEXT)");
  db.run(`CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schedule TEXT NOT NULL,
    prompt TEXT NOT NULL,
    next_run INTEGER,
    last_run INTEGER,
    user_id TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(uid)
  )`);
};

export const store = async (
  uid: string,
  data: Record<string, unknown>,
): Promise<void> => {
  db.prepare("INSERT OR REPLACE INTO users (uid, data) VALUES (?, ?)").run(
    uid,
    JSON.stringify(data),
  );
};

export const get = async (
  uid: string,
): Promise<Record<string, unknown> | undefined> => {
  const row = db.prepare("SELECT data FROM users WHERE uid = ?").get(uid) as
    | { data: string }
    | undefined;
  if (!row) return undefined;
  return JSON.parse(row.data) as Record<string, unknown>;
};

export const scheduleTask = async (
  userId: string,
  schedule: string,
  instruction: string,
): Promise<void> => {
  const nextRun = cron.sendAt(schedule);
  db.prepare(
    "INSERT INTO scheduled_tasks (schedule, prompt, user_id, next_run) VALUES (?, ?, ?, ?)",
  ).run(schedule, instruction, userId, nextRun.toSeconds());
};

interface ScheduledTask {
  id: number;
  schedule: string;
  prompt: string;
  next_run: number;
  last_run: number;
  user_id: string;
}

export const getPendingTasks = async (): Promise<ScheduledTask[]> => {
  const tasks = db
    .prepare(
      "SELECT * FROM scheduled_tasks WHERE next_run <= ? ORDER BY next_run ASC",
    )
    .all(Math.floor(Date.now() / 1000)) as ScheduledTask[];
  return tasks;
};

export const getScheduledTasks = async (
  userId: string,
): Promise<ScheduledTask[]> => {
  const tasks = db
    .prepare("SELECT * FROM scheduled_tasks WHERE user_id = ?")
    .all(userId) as ScheduledTask[];
  return tasks;
};

export const updateTask = async (
  taskId: number,
  nextRun: number,
): Promise<void> => {
  db.prepare("UPDATE scheduled_tasks SET next_run = ? WHERE id = ?").run(
    nextRun,
    taskId,
  );
};

export const getTask = async (
  taskId: number,
): Promise<ScheduledTask | undefined> => {
  const task = db
    .prepare("SELECT * FROM scheduled_tasks WHERE id = ?")
    .get(taskId) as ScheduledTask | undefined;
  return task;
};

export const deleteTask = async (taskId: number): Promise<void> => {
  db.prepare("DELETE FROM scheduled_tasks WHERE id = ?").run(taskId);
};
