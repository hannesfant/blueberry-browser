import { Hono } from "hono";
import { app as syncApp } from "./routes/sync";
import { app as browserApp } from "./routes/browser";
import * as store from "./lib/store";
import { logger } from "hono/logger";

store.setup();

const app = new Hono()
  .use(logger())
  .route("/sync", syncApp)
  .route("/browser", browserApp);

export default app;
