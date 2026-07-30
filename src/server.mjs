/**
 * Stdio MCP server — Cronofy calendars, events, free/busy, availability query, availability rules.
 *
 * Env: staging → package root `.env`, production → `.env.production`
 * (select with MCP_ENV or --env). Then process env overrides.
 * Variables: CRONOFY_CLIENT_ID, CRONOFY_CLIENT_SECRET,
 * CRONOFY_REFRESH_TOKEN; optional CRONOFY_APPLICATION_CALENDAR_IDS (comma-separated ids for
 * cronofy_list_application_calendars); optional CRONOFY_API_BASE (default https://api.cronofy.com).
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { loadPackageEnv } from "../load-package-env.mjs";
import {
  listApplicationCalendarsSummaries,
  provisionApplicationCalendarWithName,
  slugifyApplicationCalendarId
} from "./cronofy-application-calendar.mjs";
import { loadCronofyEnv } from "./cronofy-config.mjs";
import { CronofySession } from "./cronofy-session.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.join(__dirname, "..");

const { mode: envMode } = loadPackageEnv(packageRoot);

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

async function cronofySubFromListCalendars(session) {
  const client = await session.client();
  const data = await client.listCalendars();

  const sub =
    data &&
    typeof data === "object" &&
    "sub" in data &&
    typeof data.sub === "string"
      ? data.sub.trim()
      : "";

  if (!sub)
    throw new Error(
      "cronofy_availability: listCalendars returned no sub; pass sub explicitly."
    );

  return sub;
}

function availabilityMemberFromArgs(sub, calendarIds, managedAvailability) {
  const s = sub.trim();
  const ids = (calendarIds ?? []).map(x => String(x).trim()).filter(Boolean);
  const apc = s.startsWith("apc_");
  const managed =
    managedAvailability === undefined ? apc : Boolean(managedAvailability);

  /** @type {{ sub: string; managed_availability?: boolean; calendar_ids?: string[] }} */
  const member = { sub: s };

  if (managed) member.managed_availability = true;

  if (ids.length > 0) member.calendar_ids = ids;

  return member;
}

async function main() {
  const env = loadCronofyEnv();
  const envLabel = envMode === "production" ? "PRODUCTION" : "STAGING";
  const envFileHint =
    envMode === "production" ? ".env.production" : ".env (staging)";

  const session = new CronofySession({
    clientId: env.clientId,
    clientSecret: env.clientSecret,
    refreshToken: env.refreshToken,
    dataCenter: env.dataCenter
  });

  const server = new McpServer(
    {
      name: `cronofy-mcp-${envMode}`,
      version: "1.0.0"
    },
    {
      instructions: `ENVIRONMENT: ${envLabel} (loads mcp/cronofy/${envFileHint}). This server ONLY uses that env file — sibling MCP: neuryn-cronofy-${envMode === "production" ? "staging" : "production"}. Cronofy tools: user OAuth via CRONOFY_REFRESH_TOKEN; application calendars use CRONOFY_CLIENT_ID + CRONOFY_CLIENT_SECRET (provision/list summaries). Cronofy has no list-all application calendars API — pass ids or CRONOFY_APPLICATION_CALENDAR_IDS. Use list_calendars before targeting calendar_id. POST /v1/availability is exposed as cronofy_availability (periods/slots vs free_busy).`
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
    "cronofy_create_application_calendar",
    {
      description:
        "POST /v1/application_calendars (upsert by application_calendar_id), then GET /v1/calendars with the returned access_token. Application calendars already include one calendar; naming follows Cronofy (often the application_calendar_id slug). Uses client_id/client_secret from env. Response includes oauth_for_this_application_calendar — store tokens securely; separate sub from CRONOFY_REFRESH_TOKEN.",
      inputSchema: z.object({
        calendar_name: z
          .string()
          .describe(
            'Human label for your records and slug derivation, e.g. "Pompano Beach"'
          ),
        application_calendar_id: z
          .string()
          .optional()
          .describe(
            "Stable app-side id (upsert key). Omit to derive slug from calendar_name."
          )
      })
    },
    async args => {
      try {
        const calendar_name = args.calendar_name.trim();

        if (!calendar_name) return jsonError("calendar_name must be non-empty");

        const application_calendar_id =
          args.application_calendar_id?.trim() ||
          slugifyApplicationCalendarId(calendar_name);

        const data = await provisionApplicationCalendarWithName(env, {
          application_calendar_id,
          calendar_name
        });

        return jsonResult(data);
      } catch (e) {
        return jsonError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.registerTool(
    "cronofy_list_application_calendars",
    {
      description:
        "Summarize known application calendars: for each application_calendar_id, POST /v1/application_calendars (upsert) and GET /v1/calendars. Cronofy does not expose list-all-by-client; pass application_calendar_ids or set CRONOFY_APPLICATION_CALENDAR_IDS. OAuth tokens omitted from the response.",
      inputSchema: z.object({
        application_calendar_ids: z
          .array(z.string())
          .optional()
          .describe(
            "Stable ids to query. If omitted or empty, uses CRONOFY_APPLICATION_CALENDAR_IDS from env."
          )
      })
    },
    async args => {
      try {
        const fromArgs =
          args.application_calendar_ids?.map(s => s.trim()).filter(Boolean) ??
          [];
        const ids =
          fromArgs.length > 0 ? fromArgs : (env.applicationCalendarIds ?? []);

        if (ids.length === 0) {
          return jsonResult({
            items: [],
            note: "No ids: pass application_calendar_ids or set CRONOFY_APPLICATION_CALENDAR_IDS (comma-separated). Cronofy does not list every application calendar for an app."
          });
        }

        const items = await listApplicationCalendarsSummaries(env, ids);

        return jsonResult({
          items,
          note: "Each item used upsert for that id. Tokens omitted; use cronofy_create_application_calendar or stored refresh tokens for event APIs."
        });
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
        "GET /v1/events — events intersecting [from, to]. Defaults include_managed=true so API-created (managed) events appear. Pass include_managed:false to exclude them. Supports pagination via next_page.",
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
        const data = await client.readEvents(
          compact({ include_managed: true, ...args })
        );

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
      description:
        "GET /v1/free_busy between from and to. Defaults include_managed=true so managed blocks appear; pass include_managed:false to omit. Requires IANA tzid (e.g. America/New_York). Prefer from/to as YYYY-MM-DD or local datetimes without a Z suffix when tzid is set — UTC ISO8601 with Z can trigger Cronofy validation errors.",
      inputSchema: {
        from: z.string(),
        to: z.string(),
        tzid: z.string().optional(),
        calendar_ids: z.array(z.string()).optional(),
        next_page: z.string().optional(),
        include_managed: z.union([z.boolean(), z.string()]).optional()
      }
    },
    async args => {
      try {
        const client = await session.client();
        const data = await client.freeBusy(
          compact({ include_managed: true, ...args })
        );

        return jsonResult(data);
      } catch (e) {
        return jsonError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.registerTool(
    "cronofy_availability",
    {
      description:
        "POST /v1/availability (Cronofy Availability API). Returns available_periods or available_slots for query_periods. Docs/cronofy-node: client.availability({ participants, required_duration, query_periods }). Omit sub to resolve from GET /v1/calendars. For apc_* subs, defaults managed_availability true unless managed_availability is false.",
      inputSchema: z.object({
        query_periods: z
          .array(
            z.object({
              start: z.string().describe("ISO8601 query window start"),
              end: z.string().describe("ISO8601 query window end")
            })
          )
          .min(1),
        required_duration_minutes: z.coerce
          .number()
          .int()
          .min(1)
          .max(480)
          .default(30),
        response_format: z
          .enum(["periods", "slots", "overlapping_slots"])
          .optional(),
        sub: z
          .string()
          .optional()
          .describe(
            "Member sub (acc_* / apc_*); omit to use list_calendars.sub"
          ),
        managed_availability: z.boolean().optional(),
        calendar_ids: z.array(z.string()).optional(),
        start_interval_minutes: z
          .union([
            z.literal(5),
            z.literal(10),
            z.literal(15),
            z.literal(20),
            z.literal(30),
            z.literal(60)
          ])
          .optional(),
        buffer_before_minutes: z.coerce.number().int().min(0).optional(),
        buffer_after_minutes: z.coerce.number().int().min(0).optional()
      })
    },
    async args => {
      try {
        const client = await session.client();

        const sub =
          args.sub?.trim() || (await cronofySubFromListCalendars(session));

        const member = availabilityMemberFromArgs(
          sub,
          args.calendar_ids,
          args.managed_availability
        );

        /** @type {Record<string, unknown>} */
        const payload = {
          participants: [{ members: [member], required: "all" }],
          required_duration: { minutes: args.required_duration_minutes },
          query_periods: args.query_periods
        };

        if (args.response_format)
          payload.response_format = args.response_format;

        if (args.start_interval_minutes !== undefined)
          payload.start_interval = { minutes: args.start_interval_minutes };

        if (
          args.buffer_before_minutes !== undefined ||
          args.buffer_after_minutes !== undefined
        ) {
          payload.buffer = {};
          if (args.buffer_before_minutes !== undefined)
            payload.buffer.before = {
              minutes: args.buffer_before_minutes
            };
          if (args.buffer_after_minutes !== undefined)
            payload.buffer.after = { minutes: args.buffer_after_minutes };
        }

        const data = await client.availability(compact(payload));

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
