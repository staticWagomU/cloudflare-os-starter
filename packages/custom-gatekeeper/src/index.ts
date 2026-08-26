export * from "./custom.js";
export * from "./connect.js";

import { verifiedAccessEmail } from "./access.js";

const CONNECT_PATH = /^\/gatekeeper\/custom\/([0-9a-f]{64})\/([a-zA-Z0-9_-]{32,128})\/?$/;

const htmlHeaders = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
};

function closingPage(message: string): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Restricted Knowledge</title>` +
      `<p>${message}</p><script>window.close()</script>`,
    { headers: htmlHeaders },
  );
}

export default {
  async fetch(request: Request, env: Cloudflare.Env): Promise<Response> {
    const url = new URL(request.url);
    const match = CONNECT_PATH.exec(url.pathname);
    if (match) {
      if (request.method !== "GET") {
        return new Response("Method Not Allowed", { status: 405, headers: { allow: "GET" } });
      }

      const email = await verifiedAccessEmail(request, env);
      if (!email) {
        return new Response("A valid Cloudflare Access session is required.", { status: 401 });
      }

      let objectId: DurableObjectId;
      try {
        objectId = env.ACCESS_CONNECT.idFromString(match[1]);
      } catch {
        return new Response("Invalid connection link.", { status: 400 });
      }

      const completed = await env.ACCESS_CONNECT.get(objectId).complete(match[2], email);
      if (!completed) {
        return closingPage("This connection link is invalid or has expired.");
      }
      return closingPage("Connection complete. You can close this tab.");
    }

    return new Response("Custom Gatekeeper worker is running.", {
      headers: { "content-type": "text/plain" },
    });
  },
};
