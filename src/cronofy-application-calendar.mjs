import Cronofy from "cronofy";

/**
 * Stable id for upserts (Cronofy application_calendar_id).
 * @param {string} name
 */
export function slugifyApplicationCalendarId(name) {
  const s = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "");

  return (s.length > 0 ? s : "application-calendar").slice(0, 128);
}

/**
 * @param {{ clientId: string; clientSecret: string; dataCenter?: string }} env
 * @param {{ application_calendar_id: string; calendar_name?: string }} params
 */
export async function provisionApplicationCalendarWithName(env, params) {
  const dc = env.dataCenter ? { data_center: env.dataCenter } : {};

  const provisionClient = new Cronofy({
    client_id: env.clientId,
    client_secret: env.clientSecret,
    ...dc
  });

  const provisioned = await provisionClient.applicationCalendar({
    application_calendar_id: params.application_calendar_id
  });

  if (!provisioned.access_token)
    throw new Error("application_calendar response missing access_token");

  const appClient = new Cronofy({
    access_token: provisioned.access_token,
    ...dc
  });

  const listed = await appClient.listCalendars();

  return {
    request_application_calendar_id: params.application_calendar_id,
    requested_display_name: params.calendar_name?.trim() || undefined,
    provision: {
      application_calendar_id: provisioned.application_calendar_id,
      sub: provisioned.sub,
      linking_profile: provisioned.linking_profile,
      scope: provisioned.scope,
      expires_in: provisioned.expires_in,
      token_type: provisioned.token_type
    },
    oauth_for_this_application_calendar: {
      access_token: provisioned.access_token,
      refresh_token: provisioned.refresh_token
    },
    list_calendars: listed,
    note: "Application calendars ship with one profile and one calendar (see list_calendars). Tokens use read_write scope without create_calendar; default calendar naming follows Cronofy/application_calendar_id — use list_calendars.calendar_name and calendar_id for API calls."
  };
}

/**
 * Upsert + list calendars for one id. Omits OAuth tokens from the result.
 *
 * @param {{ clientId: string; clientSecret: string; dataCenter?: string }} env
 * @param {string} application_calendar_id
 */
export async function summarizeApplicationCalendar(
  env,
  application_calendar_id
) {
  const dc = env.dataCenter ? { data_center: env.dataCenter } : {};

  const provisionClient = new Cronofy({
    client_id: env.clientId,
    client_secret: env.clientSecret,
    ...dc
  });

  const provisioned = await provisionClient.applicationCalendar({
    application_calendar_id
  });

  if (!provisioned.access_token)
    throw new Error("application_calendar response missing access_token");

  const appClient = new Cronofy({
    access_token: provisioned.access_token,
    ...dc
  });

  const listed = await appClient.listCalendars();

  return {
    application_calendar_id: provisioned.application_calendar_id,
    sub: provisioned.sub,
    linking_profile: provisioned.linking_profile,
    scope: provisioned.scope,
    calendars: listed.calendars,
    list_calendars_sub: listed.sub
  };
}

/**
 * @param {{ clientId: string; clientSecret: string; dataCenter?: string }} env
 * @param {string[]} ids
 */
export async function listApplicationCalendarsSummaries(env, ids) {
  const unique = [...new Set(ids.map(id => id.trim()).filter(Boolean))];
  /** @type {unknown[]} */
  const items = [];

  for (const id of unique) {
    try {
      items.push(await summarizeApplicationCalendar(env, id));
    } catch (e) {
      items.push({
        application_calendar_id: id,
        error: e instanceof Error ? e.message : String(e)
      });
    }
  }

  return items;
}
