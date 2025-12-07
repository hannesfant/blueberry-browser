import { Stagehand } from "@browserbasehq/stagehand";
import puppeteer from "puppeteer-core";
import * as store from "./store";

interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: string;
}

export const executeAgent = async (
  userId: string,
  prompt: string,
): Promise<void> => {
  // Load user agent from stored session data
  const storedData = await store.get(userId);
  const userAgent = storedData?.userAgent as string | undefined;

  const launchOptions = {
    executablePath: "/Applications/Chromium.app/Contents/MacOS/Chromium",
    headless: false,
    preserveUserDataDir: false,
    devtools: true,
  };

  // Add user agent if available
  if (userAgent) launchOptions.args = [`--user-agent="${userAgent}"`];

  const stagehand = new Stagehand({
    env: "LOCAL",
    localBrowserLaunchOptions: launchOptions,
    systemPrompt: [
      "You are a helpful assistant that completes tasks for the user on the web.",
      "Try and login and only stop when you're greeted by a form that you cannot fill",
      "Go directly to urls instead of searching for them first.",
    ].join(" "),
  });

  const agent = stagehand.agent({
    cua: true,
    model: "anthropic/claude-haiku-4-5-20251001",
  });

  await stagehand.init();

  // Load cookies from store via CDP
  if (storedData?.cookies) {
    const cookies = storedData.cookies as Cookie[];
    const cdpUrl = stagehand.connectURL();

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

  stagehand.close();
};
