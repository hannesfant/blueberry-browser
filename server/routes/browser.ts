import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { executeAgent } from "../lib/agent";
import { authMiddleware } from "../middleware/auth";

export const app = new Hono()
  .use(authMiddleware)
  .post(
    "/act",
    zValidator("json", z.object({ prompt: z.string() })),
    async (c) => {
      const userId = c.get("userId");
      const { prompt } = c.req.valid("json");

      await executeAgent(userId, prompt);

      return c.json({ message: "done" });
    },
  );
