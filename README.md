# cronofy-mcp-server

Local [**Model Context Protocol**](https://modelcontextprotocol.io/) (stdio) server for the [**Cronofy**](https://www.cronofy.com/) calendar API. Use it from **Cursor**, **Claude Desktop**, or any MCP host that supports stdio servers.

This is an alternative to Cronofy’s hosted Scheduler MCP: it exposes **full API-style** tools (list calendars, read events, upsert/delete events, free/busy, availability rules, application calendar provisioning) using your app’s **OAuth refresh token** for user-scoped calls plus **client id/secret** for application calendars.

## Requirements

- **Node.js** ≥ 20
- A Cronofy application with **`client_id`**, **`client_secret`**, and a user **`refresh_token`** (authorization code flow with the scopes you need for calendars/events).

## Install

```bash
git clone https://github.com/douglasrubims/cronofy-mcp-server.git
cd cronofy-mcp-server
npm install
cp .env.example .env
# edit .env
```

## Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `CRONOFY_CLIENT_ID` | yes | Application client ID |
| `CRONOFY_CLIENT_SECRET` | yes | Application client secret |
| `CRONOFY_REFRESH_TOKEN` | yes | OAuth refresh token for the account to act on |
| `CRONOFY_API_BASE` | no | Default `https://api.cronofy.com`. Use your [data center](https://docs.cronofy.com/developers/data-centers/) host if not US (e.g. `https://api-de.cronofy.com`). |

The server loads `.env` from the **package root** (next to `package.json`), then falls back to process environment.

**Security:** never commit `.env`. Treat `CRONOFY_CLIENT_SECRET` and `CRONOFY_REFRESH_TOKEN` as secrets.

## Run (stdio)

```bash
npm start
```

Or directly:

```bash
node src/server.mjs
```

Global install (optional):

```bash
npm link
cronofy-mcp   # uses the "bin" entry
```

## Cursor

Project `.cursor/mcp.json` example:

```json
{
  "mcpServers": {
    "cronofy": {
      "command": "node",
      "args": ["/absolute/path/to/cronofy-mcp-server/src/server.mjs"]
    }
  }
}
```

Or with `${workspaceFolder}` if this repo lives inside a larger project.

Restart Cursor after changing MCP config. Use **MCP Logs** in the Output panel if the server fails to start.

## Claude Desktop

[Claude Desktop](https://claude.ai/download) loads MCP servers from a JSON file on your machine (stdio only).

1. Install this repo and fill **`cronofy-mcp-server/.env`** as in [Environment](#environment) (recommended). The server reads `.env` from the directory that contains `package.json` (parent of `src/`), as long as `args` point at that copy of `src/server.mjs`.

2. Edit the Claude Desktop config file:
   - **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

3. Add an entry under `mcpServers` (adjust the path to your clone):

```json
{
  "mcpServers": {
    "cronofy": {
      "command": "node",
      "args": ["/absolute/path/to/cronofy-mcp-server/src/server.mjs"]
    }
  }
}
```

If you merge into an existing file, keep the outer `{ "mcpServers": { ... } }` and only add the `cronofy` key alongside any servers you already use.

**Optional:** pass secrets via `env` instead of `.env` (same variable names as in the table above).

4. Fully quit and reopen **Claude Desktop**. Open **Settings → Developer → MCP** (wording may vary by version) to confirm the server is connected.

5. In chat, ask Claude to use Cronofy (e.g. “list my calendars with the cronofy MCP”). Approve tool runs when prompted.

Other Claude clients that support MCP over **stdio** (e.g. some CLI or IDE integrations) use the same pattern: `command` + `args` pointing at `node …/src/server.mjs`.

## Tools

| Tool | Purpose |
|------|---------|
| `cronofy_account_information` | Account metadata |
| `cronofy_profile_information` | Linked calendar profiles |
| `cronofy_create_application_calendar` | Upsert application calendar (`POST /v1/application_calendars`), then set display name (`POST /v1/calendars`). Response includes `oauth_for_this_application_calendar` — treat like secrets; separate sub from `CRONOFY_REFRESH_TOKEN`. |
| `cronofy_list_calendars` | List calendars / `calendar_id`s |
| `cronofy_read_events` | Read events (`from`+`to` or `next_page`) |
| `cronofy_create_or_update_event` | Upsert managed event |
| `cronofy_delete_event` | Delete managed event |
| `cronofy_free_busy` | Free/busy query |
| `cronofy_list_availability_rules` | List availability rules |
| `cronofy_read_availability_rule` | Read one rule |
| `cronofy_upsert_availability_rule` | Create/update rule |
| `cronofy_delete_availability_rule` | Delete rule |

Responses are JSON text in MCP `content`; errors set `isError` with a message.

## Development

```bash
npm run check
```

Formats and lints `src/` with [Biome](https://biomejs.dev/).

## Disclaimer

Not affiliated with Cronofy. You are responsible for compliance with Cronofy’s terms and for securing credentials. Calendar write tools can modify real data—use restricted tokens and test accounts when possible.

## License

MIT — see [LICENSE](./LICENSE).
