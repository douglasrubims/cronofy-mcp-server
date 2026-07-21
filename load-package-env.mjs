import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const VALID_MODES = new Set(["staging", "production"]);

function loadDotenvFile(filePath) {
  if (!existsSync(filePath)) return false;
  const raw = readFileSync(filePath, "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] !== undefined) continue;
    process.env[key] = val;
  }
  return true;
}

function parseEnvModeFromArgv(argv) {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--env" || arg === "-e") {
      return argv[++i]?.trim().toLowerCase();
    }
    if (arg.startsWith("--env=")) {
      return arg.slice("--env=".length).trim().toLowerCase();
    }
  }
  return undefined;
}

/**
 * Load package env for MCP servers.
 * staging (default) → .env | production → .env.production
 *
 * Mode resolution: MCP_ENV process env, then --env/-e argv (manual runs).
 * Process env vars already set (e.g. Cursor mcp.json "env") win over file values.
 */
export function loadPackageEnv(packageRoot, argv = process.argv.slice(2)) {
  const fromArgv = parseEnvModeFromArgv(argv);
  const fromProcess = process.env.MCP_ENV?.trim().toLowerCase();
  const mode = fromArgv || fromProcess || "staging";

  if (!VALID_MODES.has(mode)) {
    console.error(
      `Invalid env mode "${mode}". Use staging or production (MCP_ENV or --env).`
    );
    process.exit(2);
  }

  const envFile =
    mode === "production"
      ? path.join(packageRoot, ".env.production")
      : path.join(packageRoot, ".env");

  if (!loadDotenvFile(envFile)) {
    console.error(`Env file not found: ${envFile}`);
    console.error(
      `Copy .env.example to .env for staging, or .env.production.example to .env.production for production.`
    );
    process.exit(2);
  }

  const label =
    mode === "production" ? "production (.env.production)" : "staging (.env)";
  console.error(`[env] ${label} → ${envFile}`);

  return { mode, envFile };
}
