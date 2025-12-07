import * as store from "../lib/store";
import * as cron from "cron";
import { executeAgent } from "../lib/agent";

export const fn = async () => {
  const tasks = await store.getPendingTasks();

  console.log(`Processing ${tasks.length} scheduled tasks`);

  for (const task of tasks) {
    const nextRun = cron.sendAt(task.schedule);

    // execute agent in background
    executeAgent(task.user_id, task.prompt);

    await store.updateTask(task.id, nextRun.toSeconds());
  }
};

// run every minute
export const schedule = "0 * * * * *";
