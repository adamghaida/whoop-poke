import { WHOOP_API_BASE_URL, WHOOP_TOKEN_URL, type AppConfig } from "./config.js";

type TokenState = {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
};

type WhoopTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
};

export type CollectionParams = {
  limit?: number;
  start?: string;
  end?: string;
  nextToken?: string;
};

export class WhoopClient {
  private readonly tokens: TokenState;

  constructor(private readonly config: AppConfig) {
    this.tokens = {
      accessToken: config.whoopAccessToken,
      refreshToken: config.whoopRefreshToken,
    };
  }

  async getProfile() {
    return this.request("/v2/user/profile/basic");
  }

  async getBodyMeasurements() {
    return this.request("/v2/user/measurement/body");
  }

  async getCycles(params: CollectionParams = {}) {
    return this.request("/v2/cycle", params);
  }

  async getRecovery(params: CollectionParams = {}) {
    return this.request("/v2/recovery", params);
  }

  async getSleep(params: CollectionParams = {}) {
    return this.request("/v2/activity/sleep", params);
  }

  async getWorkouts(params: CollectionParams = {}) {
    return this.request("/v2/activity/workout", params);
  }

  async getSummary(days: number) {
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const params = { limit: 10, start };

    const [profile, body, cycles, recovery, sleep, workouts] = await Promise.allSettled([
      this.getProfile(),
      this.getBodyMeasurements(),
      this.getCycles(params),
      this.getRecovery(params),
      this.getSleep(params),
      this.getWorkouts(params),
    ]);

    return {
      range: { days, start, end: new Date().toISOString() },
      profile: unwrapSettled(profile),
      body: unwrapSettled(body),
      cycles: unwrapSettled(cycles),
      recovery: unwrapSettled(recovery),
      sleep: unwrapSettled(sleep),
      workouts: unwrapSettled(workouts),
    };
  }

  private async request(path: string, query?: CollectionParams, didRefresh = false): Promise<unknown> {
    const accessToken = await this.getAccessToken();
    const url = new URL(`${WHOOP_API_BASE_URL}${path}`);

    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    if (response.status === 401 && !didRefresh && this.tokens.refreshToken) {
      await this.refreshAccessToken();
      return this.request(path, query, true);
    }

    if (!response.ok) {
      throw new Error(`WHOOP API ${response.status}: ${await response.text()}`);
    }

    return response.json();
  }

  private async getAccessToken() {
    if (this.tokens.accessToken && (!this.tokens.expiresAt || this.tokens.expiresAt > Date.now() + 60_000)) {
      return this.tokens.accessToken;
    }

    if (this.tokens.refreshToken) {
      await this.refreshAccessToken();
      return this.tokens.accessToken;
    }

    throw new Error(
      "Missing WHOOP credentials. Set WHOOP_REFRESH_TOKEN, or set WHOOP_ACCESS_TOKEN for short-lived local testing.",
    );
  }

  private async refreshAccessToken() {
    if (!this.config.whoopClientId || !this.config.whoopClientSecret || !this.tokens.refreshToken) {
      throw new Error("Refreshing WHOOP tokens requires WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET, and WHOOP_REFRESH_TOKEN.");
    }

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: this.tokens.refreshToken,
      client_id: this.config.whoopClientId,
      client_secret: this.config.whoopClientSecret,
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
      throw new Error(`WHOOP token refresh failed ${response.status}: ${await response.text()}`);
    }

    const data = (await response.json()) as WhoopTokenResponse;
    this.tokens.accessToken = data.access_token;
    this.tokens.refreshToken = data.refresh_token ?? this.tokens.refreshToken;
    this.tokens.expiresAt = data.expires_in ? Date.now() + data.expires_in * 1000 : undefined;

    if (data.refresh_token && data.refresh_token !== this.config.whoopRefreshToken) {
      console.warn("WHOOP returned a new refresh token. Update WHOOP_REFRESH_TOKEN in your environment.");
      console.warn(data.refresh_token);
    }
  }
}

function unwrapSettled(result: PromiseSettledResult<unknown>) {
  if (result.status === "fulfilled") {
    return result.value;
  }

  return { error: result.reason instanceof Error ? result.reason.message : String(result.reason) };
}
