import "dotenv/config";
import { randomBytes } from "node:crypto";
import { DEFAULT_WHOOP_SCOPES, WHOOP_AUTH_URL, WHOOP_TOKEN_URL, getConfig } from "../src/config.js";

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
};

const command = process.argv[2];
const args = parseArgs(process.argv.slice(3));
const config = getConfig();

if (command === "url") {
  const oauth = getOAuthConfig();

  const url = new URL(WHOOP_AUTH_URL);
  url.searchParams.set("client_id", oauth.clientId);
  url.searchParams.set("redirect_uri", oauth.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", DEFAULT_WHOOP_SCOPES.join(" "));
  url.searchParams.set("state", args.state ?? randomBytes(4).toString("hex"));

  console.log(url.toString().replace(/\+/g, "%20"));
} else if (command === "token") {
  const oauth = getOAuthConfig();

  const code = args.code;
  if (!code) {
    fail("Missing --code. Example: npm run oauth:token -- --code YOUR_CODE");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: oauth.clientId,
    client_secret: oauth.clientSecret,
    redirect_uri: oauth.redirectUri,
  });

  const response = await fetch(WHOOP_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  if (!response.ok) {
    fail(`WHOOP token exchange failed ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as TokenResponse;

  console.log("Add these to your deployment environment:");
  console.log(`WHOOP_ACCESS_TOKEN=${data.access_token}`);
  if (data.refresh_token) {
    console.log(`WHOOP_REFRESH_TOKEN=${data.refresh_token}`);
  }
  if (data.expires_in) {
    console.log(`# Access token expires in ${data.expires_in} seconds; keep the refresh token for the server.`);
  }
} else {
  fail("Usage: npm run oauth:url OR npm run oauth:token -- --code YOUR_CODE");
}

function getOAuthConfig() {
  if (!config.whoopClientId || !config.whoopClientSecret || !config.whoopRedirectUri) {
    fail("Set WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET, and WHOOP_REDIRECT_URI first.");
  }

  return {
    clientId: config.whoopClientId,
    clientSecret: config.whoopClientSecret,
    redirectUri: config.whoopRedirectUri,
  };
}

function parseArgs(values: string[]) {
  const parsed: Record<string, string> = {};

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value?.startsWith("--")) {
      continue;
    }

    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = "true";
    } else {
      parsed[key] = next;
      index += 1;
    }
  }

  return parsed;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
