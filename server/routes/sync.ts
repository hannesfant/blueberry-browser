import { Hono } from "hono";
import * as store from "../lib/store";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { authMiddleware } from "../middleware/auth";

// TODO:
// [ ] envelope encryption

export const app = new Hono()
  .use(authMiddleware)
  .post(
    "/",
    zValidator("json", z.object({ data: z.record(z.string(), z.unknown()) })),
    async (c) => {
      const userId = c.get("userId");
      const { data } = c.req.valid("json");
      await store.store(userId, data);
      return c.json({ success: true });
    },
  )
  .get("/", async (c) => {
    const userId = c.get("userId");
    const data = await store.get(userId);
    if (!data) return c.json({ error: "No data found" }, 404);
    return c.json(data);
  });
