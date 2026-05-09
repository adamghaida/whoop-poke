import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v4";
import { getConfig } from "./config.js";
import { type CollectionParams, WhoopClient } from "./whoop.js";

const config = getConfig();
const whoop = new WhoopClient(config);
const transports: Record<string, StreamableHTTPServerTransport | SSEServerTransport> = {};
const authorizedSseSessions = new Set<string>();

const collectionSchema = {
  limit: z.number().int().min(1).max(25).default(10).describe("Maximum records to return."),
  start: z.string().datetime().optional().describe("Inclusive ISO timestamp to start from."),
  end: z.string().datetime().optional().describe("Exclusive ISO timestamp to end before."),
  nextToken: z.string().optional().describe("Pagination token from a previous WHOOP response."),
};

function createServer() {
  const server = new McpServer(
    {
      name: "whoop-poke",
      version: "1.0.0",
    },
    { capabilities: { logging: {} } },
  );

  server.registerTool(
    "whoop_summary",
    {
      title: "WHOOP Summary",
      description: "Get a compact WHOOP summary across recovery, strain cycles, sleep, workouts, profile, and body data.",
      inputSchema: {
        days: z.number().int().min(1).max(30).default(7).describe("How many recent days to include."),
      },
    },
    async ({ days }) => jsonResult(await whoop.getSummary(days)),
  );

  server.registerTool(
    "whoop_profile",
    {
      title: "WHOOP Profile",
      description: "Get the authenticated WHOOP user's basic profile and body measurements.",
      inputSchema: {},
    },
    async () => {
      const [profile, body] = await Promise.all([whoop.getProfile(), whoop.getBodyMeasurements()]);
      return jsonResult({ profile, body });
    },
  );

  server.registerTool(
    "whoop_cycles",
    {
      title: "WHOOP Cycles and Strain",
      description: "List recent WHOOP physiological cycles, including day strain and heart-rate stats.",
      inputSchema: collectionSchema,
    },
    async (params) => jsonResult(await whoop.getCycles(params as CollectionParams)),
  );

  server.registerTool(
    "whoop_recovery",
    {
      title: "WHOOP Recovery",
      description: "List recent WHOOP recovery scores, HRV, resting heart rate, SpO2, and skin temperature.",
      inputSchema: collectionSchema,
    },
    async (params) => jsonResult(await whoop.getRecovery(params as CollectionParams)),
  );

  server.registerTool(
    "whoop_sleep",
    {
      title: "WHOOP Sleep",
      description: "List recent WHOOP sleep records, sleep performance, efficiency, consistency, and sleep stages.",
      inputSchema: collectionSchema,
    },
    async (params) => jsonResult(await whoop.getSleep(params as CollectionParams)),
  );

  server.registerTool(
    "whoop_workouts",
    {
      title: "WHOOP Workouts",
      description: "List recent WHOOP workouts, including sport, strain, heart-rate zones, and distance data.",
      inputSchema: collectionSchema,
    },
    async (params) => jsonResult(await whoop.getWorkouts(params as CollectionParams)),
  );

  return server;
}

function jsonResult(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function isAuthorized(req: { headers: Record<string, unknown>; query?: Record<string, unknown> }) {
  if (!config.integrationApiKey) {
    return true;
  }

  const authHeader = String(req.headers.authorization ?? "");
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : undefined;
  const headerKey = req.headers["x-api-key"];
  const queryKey = req.query?.api_key ?? req.query?.apiKey;

  return [bearer, headerKey, queryKey].some((value) => value === config.integrationApiKey);
}

function rejectUnauthorized(res: { status: (code: number) => { json: (body: unknown) => void } }) {
  res.status(401).json({
    jsonrpc: "2.0",
    error: { code: -32001, message: "Unauthorized" },
    id: null,
  });
}

const app = createMcpExpressApp({
  host: "0.0.0.0",
  allowedHosts: config.allowedHosts,
});

app.get("/", (_req, res) => {
  res.json({
    name: "whoop-poke",
    status: "ok",
    transports: {
      streamableHttp: "/mcp",
      sse: "/sse",
      legacyMessages: "/messages",
    },
  });
});

app.get("/healthz", (_req, res) => {
  res.status(200).send("ok");
});

app.get("/oauth/callback", (req, res) => {
  const code = req.query.code;
  if (typeof code !== "string") {
    const details = JSON.stringify(req.query, null, 2);
    res.status(400).type("text/plain").send(`WHOOP did not return an OAuth code.

Callback query:
${details}

Check that the redirect URL in the WHOOP developer dashboard exactly matches:
${config.whoopRedirectUri}
`);
    return;
  }

  res.type("text/plain").send(`WHOOP authorization complete.

Run this command to exchange the code:

npm run oauth:token -- --code ${code}
`);
});

app.all("/mcp", async (req, res) => {
  if (!isAuthorized(req)) {
    rejectUnauthorized(res);
    return;
  }

  try {
    const sessionId = req.headers["mcp-session-id"];
    let transport: StreamableHTTPServerTransport | undefined;

    if (typeof sessionId === "string" && transports[sessionId] instanceof StreamableHTTPServerTransport) {
      transport = transports[sessionId] as StreamableHTTPServerTransport;
    } else if (!sessionId && req.method === "POST" && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSessionId) => {
          transports[newSessionId] = transport as StreamableHTTPServerTransport;
        },
      });

      transport.onclose = () => {
        const closedSessionId = transport?.sessionId;
        if (closedSessionId) {
          delete transports[closedSessionId];
        }
      };

      await createServer().connect(transport);
    } else {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: no valid MCP session." },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Error handling /mcp request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

app.get("/sse", async (req, res) => {
  if (!isAuthorized(req)) {
    rejectUnauthorized(res);
    return;
  }

  const transport = new SSEServerTransport("/messages", res);
  transports[transport.sessionId] = transport;
  authorizedSseSessions.add(transport.sessionId);

  res.on("close", () => {
    delete transports[transport.sessionId];
    authorizedSseSessions.delete(transport.sessionId);
  });

  await createServer().connect(transport);
});

app.post("/messages", async (req, res) => {
  const sessionId = String(req.query.sessionId ?? "");

  if (!authorizedSseSessions.has(sessionId) && !isAuthorized(req)) {
    rejectUnauthorized(res);
    return;
  }

  const transport = transports[sessionId];
  if (!(transport instanceof SSEServerTransport)) {
    res.status(400).send("No SSE transport found for sessionId");
    return;
  }

  await transport.handlePostMessage(req, res, req.body);
});

app.listen(config.port, (error?: Error) => {
  if (error) {
    console.error("Failed to start WHOOP MCP server:", error);
    process.exit(1);
  }

  console.log(`WHOOP MCP server listening on port ${config.port}`);
  console.log(`Poke custom integration URL: http://localhost:${config.port}/sse`);
});

async function shutdown() {
  for (const transport of Object.values(transports)) {
    await transport.close();
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
