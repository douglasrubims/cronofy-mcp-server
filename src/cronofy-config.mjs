export function normalizeApiBase(raw) {
  const t = String(raw ?? "").trim();

  if (!t) throw new Error("CRONOFY_API_BASE is empty");

  return t.endsWith("/") ? t.slice(0, -1) : t;
}

export function deriveDataCenterOption(apiBaseUrl) {
  const trimmed = apiBaseUrl.trim();
  const normalized = trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
  const u = new URL(normalized);
  const host = u.hostname.toLowerCase();

  if (host === "api.cronofy.com") return undefined;

  const m = /^api-([a-z]{2})\.cronofy\.com$/.exec(host);

  if (m) return m[1];

  throw new Error(`Unsupported CRONOFY_API_BASE host "${host}"`);
}

export function loadCronofyEnv() {
  const clientId = process.env.CRONOFY_CLIENT_ID?.trim();
  const clientSecret = process.env.CRONOFY_CLIENT_SECRET?.trim();
  const refreshToken = process.env.CRONOFY_REFRESH_TOKEN?.trim();
  const apiBase = normalizeApiBase(
    process.env.CRONOFY_API_BASE?.trim() || "https://api.cronofy.com"
  );

  if (!clientId || !clientSecret || !refreshToken)
    throw new Error(
      "Set CRONOFY_CLIENT_ID, CRONOFY_CLIENT_SECRET, and CRONOFY_REFRESH_TOKEN"
    );

  const dataCenter = deriveDataCenterOption(apiBase);

  return {
    clientId,
    clientSecret,
    refreshToken,
    apiBase,
    dataCenter
  };
}
