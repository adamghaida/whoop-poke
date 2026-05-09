# WHOOP for Poke

An MCP server that connects [WHOOP](https://www.whoop.com/) fitness data to [Poke](https://poke.com/).

Poke supports custom integrations by MCP server URL. This server exposes WHOOP profile, recovery, sleep, strain/cycles, workouts, and a combined summary tool that Poke can call from natural language.

## Tools

- `whoop_summary` - recent recovery, strain, sleep, workouts, profile, and body data in one response
- `whoop_profile` - basic profile and body measurements
- `whoop_cycles` - physiological cycles and day strain
- `whoop_recovery` - recovery score, HRV, resting heart rate, SpO2, and skin temperature
- `whoop_sleep` - sleep performance, efficiency, consistency, and sleep stages
- `whoop_workouts` - workout strain, sport, heart-rate zones, distance, and related stats

## Requirements

- Node.js 20+
- A WHOOP developer app from [developer.whoop.com](https://developer.whoop.com/)
- A public HTTPS URL for Poke to reach this MCP server

This project uses WHOOP's official OAuth API. It does not ask for or store your WHOOP email/password.

## Setup

```bash
npm install
cp .env.example .env
```

Create a WHOOP developer app and set these values in `.env`:

```bash
WHOOP_CLIENT_ID=...
WHOOP_CLIENT_SECRET=...
WHOOP_REDIRECT_URI=http://localhost:3000/oauth/callback
```

Generate an authorization URL:

```bash
npm run oauth:url
```

Open the printed URL, approve access, and copy the `code` query parameter from the redirect URL. Then exchange it for tokens:

```bash
npm run oauth:token -- --code YOUR_CODE
```

Add the printed `WHOOP_ACCESS_TOKEN` and `WHOOP_REFRESH_TOKEN` to `.env` or your deployment environment.

## Run Locally

```bash
npm run dev
```

The server exposes:

- `GET /healthz` for health checks
- `POST /mcp` for Streamable HTTP MCP clients
- `GET /sse` and `POST /messages` for legacy MCP-over-SSE clients

For Poke, use:

```text
http://localhost:3000/sse
```

Localhost is only useful for local MCP clients. Poke needs a public HTTPS deployment URL.

## Deploy

This repo includes `render.yaml` for Render. Any Node host works as long as it provides HTTPS and these environment variables:

```bash
POKE_INTEGRATION_API_KEY=optional-shared-secret
WHOOP_CLIENT_ID=...
WHOOP_CLIENT_SECRET=...
WHOOP_REDIRECT_URI=...
WHOOP_ACCESS_TOKEN=...
WHOOP_REFRESH_TOKEN=...
```

If `POKE_INTEGRATION_API_KEY` is set, requests must include the same value as `Authorization: Bearer ...`, `x-api-key`, or an `api_key` query parameter. When creating the custom integration in Poke, put the same value in the optional API Key field.

## Connect To Poke

1. Deploy this server.
2. Go to [poke.com/integrations/new](https://poke.com/integrations/new).
3. Name it `WHOOP`.
4. Set the MCP Server URL to:

```text
https://your-deployment.example.com/sse
```

5. If you set `POKE_INTEGRATION_API_KEY`, add it in Poke's API Key field.

Then ask Poke things like:

- "What's my WHOOP recovery today?"
- "How did I sleep last night?"
- "Summarize my WHOOP data for the last week."
- "What workouts did I log recently?"

## Notes

WHOOP access tokens are short-lived. Keep `WHOOP_REFRESH_TOKEN` configured so the server can refresh automatically. If WHOOP returns a rotated refresh token, the server logs it so you can update your deployment secret.
