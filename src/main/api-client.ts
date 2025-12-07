import { auth } from "./Auth";

const SYNC_SERVER_URL = process.env.SYNC_SERVER_URL || "http://localhost:3000";

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: any;
  headers?: Record<string, string>;
}

export const syncServerRequest = async (
  endpoint: string,
  options: RequestOptions = {},
) => {
  await auth.ensureInitialized();
  const userId = auth.userId;

  const { method = "GET", body, headers = {} } = options;

  const requestHeaders: Record<string, string> = {
    "X-User-Id": userId,
    ...headers,
  };

  // Add Content-Type for requests with body
  if (body && !requestHeaders["Content-Type"]) {
    requestHeaders["Content-Type"] = "application/json";
  }

  const requestInit: RequestInit = {
    method,
    headers: requestHeaders,
  };

  if (body) {
    requestInit.body = JSON.stringify(body);
  }

  const url = `${SYNC_SERVER_URL}${endpoint}`;
  const response = await fetch(url, requestInit);

  return response;
};
