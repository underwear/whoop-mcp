# WHOOP MCP Server

Give your LLM access to the full depth of your [WHOOP](https://www.whoop.com) data — not just the 5 endpoints every other MCP server exposes.

This server merges **WHOOP's internal app API** (the same one the mobile app uses) with the **official developer v2 API** to surface SpO2, skin temperature, sleep stages, journal-based behavior insights, and more.

## What makes this different

| Feature | Other MCPs | This one |
|---------|-----------|----------|
| SpO2 (blood oxygen) | No | **Yes** |
| Skin temperature | No | **Yes** |
| Sleep stages (light/deep/REM) | No | **Yes, with breakdown** |
| Sleep stress | No | **Yes** |
| Sleep debt tracking | No | **Yes, with need breakdown** |
| Journal behavior impact | No | **Yes — which habits help/hurt recovery** |
| Monthly recovery calendar | No | **Yes, with weekday patterns** |
| Multi-day trend analysis | No | **Yes, 1-30 days with pattern detection** |
| Optimal strain target | No | **Yes** |
| Coach insights | Some | **Yes, from internal API** |
| Healthspan / biological age | No | **Yes** |

## Example

Ask Claude: *"How did I sleep and how's my recovery?"*

```
Sleep: Feb 26 — 76% performance

Hours: 5:42 (needed 7.9h — baseline 7.6h + debt 0.1h + strain 0.2h)
Performance: 76% | Consistency: 56% | Efficiency: 95%
Stages: Light 2:16 (40%) | Deep 2:15 (39%) | REM 1:12 (21%) | Awake 0:20 (5%)
Disturbances: 7 | Sleep cycles: 4
Respiratory rate: 15.1 rpm
Sleep stress: 3% (30d avg: 5%)
```

```
Recovery: Feb 27 — 46% (yellow)

HRV: 46.7ms
Resting HR: 60bpm
SpO2: 94.4%
Skin temp: 35.1°C
```

```
Journal behavior impact on recovery

Helps recovery:
  76%+ SLEEP PERFORMANCE: +15%
  CAFFEINE: +5%

Hurts recovery:
  LATE MEAL: -7%
  ALCOHOL: -10%
```

## Tools

### `whoop_get_overview`
Daily health dashboard — recovery, sleep, strain, calories, activities, and optimal strain target.

**Parameters:** `date`

### `whoop_get_sleep`
Sleep analysis with stage breakdown, debt tracking, consistency, efficiency, respiratory rate, sleep stress. Supports multi-day trend analysis with pattern detection (e.g., "Deep sleep below baseline 5 of 7 nights").

**Parameters:** `date`, `days` (1-30), `detail` (summary/full)

### `whoop_get_recovery`
Recovery with HRV, resting heart rate, **SpO2**, **skin temperature**, and contributor analysis against 30-day baselines. Multi-day mode detects declining HRV trends and consecutive low-recovery streaks.

**Parameters:** `date`, `days` (1-30), `detail` (summary/full)

### `whoop_get_strain`
Strain score with workout details — individual activities, HR zones, calories, distance. Shows optimal strain range. Multi-day mode flags overtraining patterns.

**Parameters:** `date`, `days` (1-30), `detail` (summary/full)

### `whoop_get_healthspan`
Biological age (WHOOP Age), pace of aging. Full mode adds health tab metrics.

**Parameters:** `detail` (summary/full)

### `whoop_get_body`
Height, weight, BMI, max heart rate.

### `whoop_get_journal_insights`
Which logged behaviors correlate with better or worse recovery — based on 90 days of WHOOP journal data. Returns things like "Alcohol: -10% recovery", "Sleep performance 76%+: +15% recovery".

### `whoop_get_calendar`
Monthly recovery calendar with color-coded days (green/yellow/red) and weekday pattern analysis.

**Parameters:** `month` (YYYY-MM)

## Architecture

Each tool merges data from multiple WHOOP APIs internally:
- **Internal app API** (`home-service`, `healthspan-service`, `behavior-impact-service`, `coaching-service`) — rich data with coach insights, trends, 30-day baselines
- **Developer v2 API** (`/developer/v2/*`) — clean structured data with SpO2, skin temp, sleep stages

The LLM never sees which API was called. It gets clean, compact plain text optimized for context windows.

> **Note:** Internal API endpoints are reverse-engineered from the WHOOP mobile app and may change without notice. The developer v2 API is stable and officially supported.

### Server-side pattern detection
Multi-day queries automatically detect and flag:
- Declining HRV trends
- Consecutive low-recovery days (3+)
- Low sleep performance streaks
- Missing rest days
- Deep sleep deficits

## Prerequisites

- [Bun](https://bun.sh) runtime (v1.0+)
- A WHOOP membership with **email/password** login (Google/Apple SSO accounts need to set a password in WHOOP app settings first)
- An MCP client — [Claude Desktop](https://claude.ai/download), [Claude Code](https://docs.anthropic.com/en/docs/claude-code), Cursor, etc.

## Quick Start

### Claude Code / Claude Desktop (stdio)

```json
{
  "mcpServers": {
    "whoop": {
      "type": "stdio",
      "command": "bun",
      "args": ["run", "/path/to/whoop-mcp/stdio.ts"],
      "env": {
        "WHOOP_EMAIL": "your-email@example.com",
        "WHOOP_PASSWORD": "your-password"
      }
    }
  }
}
```

Claude Desktop config location: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%/Claude/claude_desktop_config.json` (Windows).

### Local dev

```bash
git clone https://github.com/underwear/whoop-mcp.git
cd whoop-mcp
bun install
export WHOOP_EMAIL='your-email@example.com'
export WHOOP_PASSWORD='your-password'
bun run stdio.ts
```

### HTTP server (Smithery, Railway, Docker)

```bash
bun run index.ts  # or bun run start
```

See `smithery.yaml` for Smithery config, `Dockerfile` for container deployment.

## Auth

Uses WHOOP's Cognito authentication (same as the mobile app). Email + password → access token, auto-refreshed. Tokens stored in memory only.

## Security

- Credentials only via environment variables, never hardcoded
- Tokens in memory only (expire after 24 hours, auto-refresh)
- Optional `MCP_AUTH_TOKEN` for protecting the HTTP endpoint
- No data persistence, no logging of health data

## License

MIT
