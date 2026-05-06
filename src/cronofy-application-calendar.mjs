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
 * @param {{ application_calendar_id: string; calendar_name: string; color?: string }} params
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

  const profileId = provisioned.linking_profile?.profile_id;

  if (!profileId)
    throw new Error(
      "application_calendar response missing linking_profile.profile_id"
    );

  const appClient = new Cronofy({
    access_token: provisioned.access_token,
    ...dc
  });

  /** @type {unknown} */
  let namedCalendar = null;

  try {
    namedCalendar = await appClient.createCalendar({
      profile_id: profileId,
      name: params.calendar_name,
      ...(params.color?.trim() ? { color: params.color.trim() } : {})
    });
  } catch (e) {
    namedCalendar = {
      failed: true,
      message: e instanceof Error ? e.message : String(e)
    };
  }

  return {
    request_application_calendar_id: params.application_calendar_id,
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
    create_calendar: namedCalendar
  };
}
