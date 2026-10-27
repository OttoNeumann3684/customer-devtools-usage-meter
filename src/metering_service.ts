import { createServer, type ServerResponse } from "node:http";
import { z } from "zod";
import { InfraiError, InfraiUsageClient } from "./infrai_usage.js";
import { developerEventSchema, UsageLedger } from "./usage_ledger.js";

const ledger = new UsageLedger();

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

async function readJson(request: AsyncIterable<Buffer>): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://localhost");

    if (request.method === "POST" && url.pathname === "/events") {
      const event = developerEventSchema.parse(await readJson(request));
      send(response, 202, ledger.record(event));
      return;
    }

    const customerMatch = url.pathname.match(/^\/customers\/([^/]+)\/usage$/);
    if (request.method === "GET" && customerMatch) {
      const customerId = decodeURIComponent(customerMatch[1]);
      const usage = ledger.get(customerId);
      send(response, usage ? 200 : 404, usage ?? { error: "customer_not_found" });
      return;
    }

    if (request.method === "GET" && url.pathname === "/account-usage") {
      const apiKey = process.env.INFRAI_API_KEY;
      if (!apiKey) {
        send(response, 503, { error: "INFRAI_API_KEY is required" });
        return;
      }
      const view = url.searchParams.get("view") === "timeseries" ? "timeseries" : "current";
      const data = await new InfraiUsageClient(apiKey).accountUsage(view);
      send(response, 200, { view, data });
      return;
    }

    send(response, 404, { error: "route_not_found" });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      send(response, 400, { error: "invalid_request" });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      send(response, status, { error: error.code, details: error.details });
      return;
    }
    send(response, 502, { error: "upstream_request_failed" });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => {
  console.log(`Usage meter listening on http://localhost:${port}`);
});
