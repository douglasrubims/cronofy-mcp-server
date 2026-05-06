/**
 * Stdio MCP server — Cronofy calendars, events, free/busy, availability rules.
 *
 * Env (package root `.env` or process env): CRONOFY_CLIENT_ID, CRONOFY_CLIENT_SECRET,
 * CRONOFY_REFRESH_TOKEN; optional CRONOFY_API_BASE (default https://api.cronofy.com).
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import dotenv from "dotenv";
import { z } from "zod";

import { loadCronofyEnv } from "./cronofy-config.mjs";
import { CronofySession } from "./cronofy-session.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config();

function jsonResult(data) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data ?? null, null, 2)
      }
    ]
  };
}

function jsonError(message) {
  return {
    content: [{ type: "text", text: message }],
    isError: true
  };
}

function compact(obj) {
  const out = { ...obj };

  for (const k of Object.keys(out)) {
    if (out[k] === undefined) delete out[k];
  }

  return out;
}

async function main() {
  const env = loadCronofyEnv();

  const session = new CronofySession({
    clientId: env.clientId,
    clientSecret: env.clientSecret,
    refreshToken: env.refreshToken,
    dataCenter: env.dataCenter
  });

  const server = new McpServer(
    {
      name: "cronofy-mcp",
      version: "1.0.0"
    },
    {
      instructions:
        "Cronofy API tools for the linked account (OAuth refresh token). Use list_calendars before targeting calendar_id."
    }
  );

  server.registerTool(
    "cronofy_account_information",
    {
      description: "GET account info (account_id, email, default_tzid).",
      inputSchema: z.object({})
    },
    async () => {
      try {
        const client = await session.client();
        const data = await client.accountInformation();

        return jsonResult(data);
      } catch (e) {
        return jsonError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.registerTool(
    "cronofy_profile_information",
    {
      description: "GET calendar profiles linked to the account.",
      inputSchema: z.object({})
    },
    async () => {
      try {
        const client = await session.client();
        const data = await client.profileInformation();

        return jsonResult(data);
      } catch (e) {
        return jsonError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.registerTool(
    "cronofy_list_calendars",
    {
      description:
        "GET /v1/calendars — discover calendar_id, provider_name, readonly/deleted flags.",
      inputSchema: z.object({})
    },
    async () => {
      try {
        const client = await session.client();
        const data = await client.listCalendars();

        return jsonResult(data);
      } catch (e) {
        return jsonError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.registerTool(
    "cronofy_read_events",
    {
      description:
        "GET /v1/events — events intersecting [from, to]. Supports pagination via next_page URL from prior response.",
      inputSchema: z
        .object({
          from: z.string().optional().describe("ISO8601 start boundary"),
          to: z.string().optional().describe("ISO8601 end boundary"),
          tzid: z.string().optional(),
          calendar_ids: z.array(z.string()).optional(),
          include_managed: z.union([z.boolean(), z.string()]).optional(),
          include_deleted: z.union([z.boolean(), z.string()]).optional(),
          only_managed: z.union([z.boolean(), z.string()]).optional(),
          next_page: z.string().optional()
        })
        .refine(
          v => Boolean(v.next_page) || (Boolean(v.from) && Boolean(v.to)),
          {
            message:
              "Provide both from and to, or next_page from a previous response"
          }
        )
    },
    async args => {
      try {
        const client = await session.client();
        const data = await client.readEvents(compact({ ...args }));

        return jsonResult(data);
      } catch (e) {
        return jsonError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.registerTool(
    "cronofy_create_or_update_event",
    {
      description:
        "POST upsert event on calendar_id (managed events). Same event_id updates in place.",
      inputSchema: {
        calendar_id: z.string(),
        event_id: z.string(),
        summary: z.string(),
        description: z.string().optional().default(""),
        start: z.string().describe("ISO8601"),
        end: z.string().describe("ISO8601"),
        tzid: z.string().optional(),
        location: z.object({ description: z.string().optional() }).optional()
      }
    },
    async args => {
      try {
        const client = await session.client();
        const { calendar_id, ...rest } = args;
        const data = await client.createEvent(
          compact({ calendar_id, ...rest })
        );

        return jsonResult(data);
      } catch (e) {
        return jsonError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.registerTool(
    "cronofy_delete_event",
    {
      description: "DELETE managed event by calendar_id + event_id.",
      inputSchema: {
        calendar_id: z.string(),
        event_id: z.string()
      }
    },
    async args => {
      try {
        const client = await session.client();
        const data = await client.deleteEvent(compact({ ...args }));

        return jsonResult(data === "" ? { ok: true } : data);
      } catch (e) {
        return jsonError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.registerTool(
    "cronofy_free_busy",
    {
      description: "GET /v1/free_busy between from and to.",
      inputSchema: {
        from: z.string(),
        to: z.string(),
        tzid: z.string().optional(),
        calendar_ids: z.array(z.string()).optional(),
        next_page: z.string().optional()
      }
    },
    async args => {
      try {
        const client = await session.client();
        const data = await client.freeBusy(compact({ ...args }));

        return jsonResult(data);
      } catch (e) {
        return jsonError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.registerTool(
    "cronofy_list_availability_rules",
    {
      description: "GET /v1/availability_rules",
      inputSchema: z.object({})
    },
    async () => {
      try {
        const client = await session.client();
        const data = await client.listAvailabilityRules({});

        return jsonResult(data);
      } catch (e) {
        return jsonError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.registerTool(
    "cronofy_read_availability_rule",
    {
      description: "GET single availability rule.",
      inputSchema: { availability_rule_id: z.string() }
    },
    async args => {
      try {
        const client = await session.client();
        const data = await client.readAvailabilityRule(compact({ ...args }));

        return jsonResult(data);
      } catch (e) {
        return jsonError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.registerTool(
    "cronofy_upsert_availability_rule",
    {
      description:
        "POST create/update availability rule (managed availability).",
      inputSchema: {
        availability_rule_id: z.string(),
        tzid: z.string(),
        calendar_ids: z.array(z.string()).optional(),
        weekly_periods: z
          .array(z.record(z.string(), z.unknown()))
          .describe("Cronofy weekly_periods objects")
      }
    },
    async args => {
      try {
        const client = await session.client();
        const data = await client.upsertAvailabilityRule(compact({ ...args }));

        return jsonResult(data);
      } catch (e) {
        return jsonError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.registerTool(
    "cronofy_delete_availability_rule",
    {
      description: "DELETE availability rule by id.",
      inputSchema: { availability_rule_id: z.string() }
    },
    async args => {
      try {
        const client = await session.client();
        const data = await client.deleteAvailabilityRule(compact({ ...args }));

        return jsonResult(data);
      } catch (e) {
        return jsonError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  const transport = new StdioServerTransport();

  await server.connect(transport);
}

main().catch(e => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : e);
  process.exit(1);
});
