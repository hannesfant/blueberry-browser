import { createMiddleware } from "hono/factory";

// super crude "auth" just for the poc
export const authMiddleware = createMiddleware<{
  Variables: {
    userId: string;
  };
}>(async (c, next) => {
  const userId = c.req.header("X-User-Id");

  if (!userId || userId.trim() === "")
    return c.json({ error: "Unauthorized: X-User-Id header required" }, 401);

  c.set("userId", userId);
  await next();
});
