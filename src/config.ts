import "dotenv/config";

export const WHOOP_API_BASE_URL = "https://api.prod.whoop.com/developer";
export const WHOOP_AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth";
export const WHOOP_TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";

export const DEFAULT_WHOOP_SCOPES = [
  "read:profile",
  "read:body_measurement",
  "read:cycles",
  "read:recovery",
  "read:sleep",
  "read:workout",
] as const;

export type AppConfig = {
  port: number;
  allowedHosts: string[];
  integrationApiKey?: string;
  whoopClientId?: string;
  whoopClientSecret?: string;
  whoopAccessToken?: string;
  whoopRefreshToken?: string;
  whoopRedirectUri?: string;
};

export function getConfig(): AppConfig {
  const whoopRedirectUri = process.env.WHOOP_REDIRECT_URI ?? "http://localhost:3000/oauth/callback";

  return {
    port: Number(process.env.PORT ?? 3000),
    allowedHosts: getAllowedHosts(whoopRedirectUri),
    integrationApiKey: process.env.POKE_INTEGRATION_API_KEY,
    whoopClientId: process.env.WHOOP_CLIENT_ID,
    whoopClientSecret: process.env.WHOOP_CLIENT_SECRET,
    whoopAccessToken: process.env.WHOOP_ACCESS_TOKEN,
    whoopRefreshToken: process.env.WHOOP_REFRESH_TOKEN,
    whoopRedirectUri,
  };
}

function getAllowedHosts(whoopRedirectUri: string) {
  const hosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

  for (const value of [
    process.env.RENDER_EXTERNAL_HOSTNAME,
    process.env.PUBLIC_HOSTNAME,
    ...splitCsv(process.env.MCP_ALLOWED_HOSTS),
    hostnameFromUrl(whoopRedirectUri),
  ]) {
    if (value) {
      hosts.add(value);
    }
  }

  return [...hosts];
}

function splitCsv(value: string | undefined) {
  return value
    ? value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function hostnameFromUrl(value: string) {
  try {
    return new URL(value).hostname;
  } catch {
    return undefined;
  }
}
