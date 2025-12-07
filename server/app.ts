import { Hono } from "hono";
import { app as syncApp } from "./routes/sync";
import { app as browserApp } from "./routes/browser";
import { app as tasksApp } from "./routes/tasks";
import * as store from "./lib/store";
import { logger } from "hono/logger";
import * as processScheduledTasks from "./tasks/process-scheduled-tasks";
import { CronJob } from "cron";

store.setup();

const app = new Hono()
  .use(logger())
  .route("/sync", syncApp)
  .route("/browser", browserApp)
  .route("/tasks", tasksApp);

// load cron tasks
const tasks = [
  {
    id: "process-scheduled-tasks",
    ...processScheduledTasks,
  },
];

for (const task of tasks) {
  const job = new CronJob(task.schedule, task.fn);
  job.start();
  console.log(`Loaded cron task: ${task.id}. Next run: ${job.nextDate()}`);
}

export default app;
