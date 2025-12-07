import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { Stagehand } from "@browserbasehq/stagehand";
import puppeteer from "puppeteer-core";
import * as store from "../lib/store";

const userId = "123";

export const app = new Hono().post(
  "/act",
  zValidator("json", z.object({ prompt: z.string() })),
  async (c) => {
    const { prompt } = c.req.valid("json");
    const stagehand = new Stagehand({
      env: "LOCAL",
      localBrowserLaunchOptions: {
        executablePath: "/Applications/Chromium.app/Contents/MacOS/Chromium",
        headless: false,
        preserveUserDataDir: false,
        devtools: true,
      },
      systemPrompt:
        "You are a helpful assistant that completes tasks for the user on the web. Try and login and only stop when you're greeted by a form that you cannot fill",
    });
    const agent = stagehand.agent({
      cua: true,
      model: "google/gemini-2.5-computer-use-preview-10-2025",
    });
    await stagehand.init();

    // Load cookies from store via CDP
    const storedData = await store.get(userId);
    if (storedData?.cookies) {
      const cookies = storedData.cookies as any[];
      const cdpUrl = stagehand.connectURL();

      console.log("cdpUrl", cdpUrl);

      // Connect to browser via CDP and inject cookies
      const browser = await puppeteer.connect({ browserWSEndpoint: cdpUrl });

      // Convert cookies to CDP format
      const cdpCookies = cookies.map((cookie) => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path || "/",
        expires: cookie.expires || -1,
        httpOnly: cookie.httpOnly || false,
        secure: cookie.secure || false,
        sameSite: cookie.sameSite || "Lax",
      }));

      await browser.setCookie(...cdpCookies);
      console.log(
        `Injected ${cdpCookies.length} cookies via CDP (url: ${cdpUrl})`,
      );

      // Disconnect puppeteer (doesn't close browser, just disconnects)
      browser.disconnect();
    }

    await agent.execute({
      instruction: prompt,
      maxSteps: 50,
    });

    stagehand.close()

    return c.json({ message: "done" });
  },
);
