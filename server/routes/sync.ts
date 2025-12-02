import { Hono } from "hono";
import * as store from "../lib/store";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

// TODO:
// [ ] per-user storage, this just a local poc :)
// [ ] envelope encryption

const userId = "123";

export const app = new Hono()
  .post(
    "/",
    zValidator("json", z.object({ data: z.record(z.string(), z.unknown()) })),
    async (c) => {
      const { data } = c.req.valid("json");
      await store.store(userId, data);
      return c.json({ success: true });
    },
  )
  .get("/", async (c) => {
    const data = await store.get(userId);
    if (!data) return c.json({ error: "No data found" }, 404);
    return c.json(data);
  });
