import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import * as store from "../lib/store";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

export const app = new Hono()
  .use(authMiddleware)
  .post(
    "/schedule",
    zValidator("json", z.object({ cron: z.string(), instruction: z.string() })),
    async (c) => {
      const userId = c.get("userId");
      const { cron, instruction } = c.req.valid("json");
      await store.scheduleTask(userId, cron, instruction);
      return c.json({ success: true });
    },
  )
  .get("/", async (c) => {
    const userId = c.get("userId");
    const tasks = await store.getScheduledTasks(userId);
    return c.json({ tasks });
  })
  .delete("/:id", async (c) => {
    const userId = c.get("userId");
    const { id } = c.req.param();

    const task = await store.getTask(parseInt(id));
    if (!task) return c.json({ error: "Task not found" }, 404);
    if (task.user_id !== userId) return c.json({ error: "Unauthorized" }, 403);

    await store.deleteTask(task.id);
    return c.json({ success: true });
  });
