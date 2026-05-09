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
  integrationApiKey?: string;
  whoopClientId?: string;
  whoopClientSecret?: string;
  whoopAccessToken?: string;
  whoopRefreshToken?: string;
  whoopRedirectUri?: string;
};

export function getConfig(): AppConfig {
  return {
    port: Number(process.env.PORT ?? 3000),
    integrationApiKey: process.env.POKE_INTEGRATION_API_KEY,
    whoopClientId: process.env.WHOOP_CLIENT_ID,
    whoopClientSecret: process.env.WHOOP_CLIENT_SECRET,
    whoopAccessToken: process.env.WHOOP_ACCESS_TOKEN,
    whoopRefreshToken: process.env.WHOOP_REFRESH_TOKEN,
    whoopRedirectUri: process.env.WHOOP_REDIRECT_URI ?? "http://localhost:3000/oauth/callback",
  };
}
