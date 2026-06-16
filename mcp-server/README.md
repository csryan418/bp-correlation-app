# BP Journal MCP Server

A standalone, **read-only** [MCP](https://modelcontextprotocol.io) server that
exposes the BP Journal health database to Claude Desktop over stdio. It is
purely additive — it does not modify any existing app code.

The server opens `~/bp-correlation/data/health.db` in read-only mode
(`{ readonly: true, fileMustExist: true }`). Note: the live database is
`data/health.db`, **not** the empty `health.db` in the repo root.

## Tools

All four tools are read-only.

| Tool | Params | What it returns |
|------|--------|-----------------|
| `get_insights` | none | The app's existing correlation analysis via `GET http://localhost:3001/api/insights/full` (its next-morning-diastolic Pearson engine). These are **historical** correlations for grounding explanations — not proof of single-day causation. **Requires the app backend to be running.** |
| `get_day` | `date` (YYYY-MM-DD) | Full cross-table context (BP, food, workouts, check-in, supplements, Oura sleep & activity) for the target day **and the prior day** — because a day's behavior affects the next morning's BP. |
| `get_range` | `start`, `end` (YYYY-MM-DD) | One row per day, each day's behaviors (alcohol, workouts, sodium, water, sleep) paired with the **next morning's** BP (the morning reading of `date+1`). |
| `get_bp_stats` | `start`, `end` (YYYY-MM-DD) | Avg / min / max systolic & diastolic over the range, split by morning vs evening. |

## Install

```bash
cd ~/bp-correlation/mcp-server
npm install
```

## Verify

```bash
cd ~/bp-correlation/mcp-server
node server.js
```

It should print `BP Journal MCP server running on stdio (read-only).` to stderr
and then wait on stdin. Press `Ctrl+C` to exit. (`get_insights` additionally
needs the app backend running on `localhost:3001`; the other three only need
the database file.)

## Register with Claude Desktop

Edit your Claude Desktop config:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

Add a `bp-journal` entry under `mcpServers` (merge with any existing entries):

```json
{
  "mcpServers": {
    "bp-journal": {
      "command": "node",
      "args": ["/Users/carolineryan/bp-correlation/mcp-server/server.js"]
    }
  }
}
```

Restart Claude Desktop. The `bp-journal` tools will appear in the tools menu.
For `get_insights` to work, start the BP Journal backend first:

```bash
cd ~/bp-correlation && npm start
```
