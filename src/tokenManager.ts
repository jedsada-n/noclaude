import axios from "axios";
import {
  TOKEN_URL,
  CLIENT_ID,
  OAUTH_SCOPES,
  OAUTH_BETA_HEADER,
  REFRESH_BUFFER_MS,
} from "./config.js";
import { logger } from "./logger.js";
import { saveTokens } from "./tokenStore.js";

let accessToken = "";
let refreshToken = "";
let expiresAt = 0;
let ready = false;
let refreshPromise: Promise<void> | null = null;

export function init(
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
  },
  persist = true,
) {
  accessToken = tokens.accessToken;
  refreshToken = tokens.refreshToken;
  expiresAt = tokens.expiresAt;
  ready = true;
  if (persist) saveTokens(tokens);
  logger.debug("token", "token manager initialized");
}

export function isReady(): boolean {
  return ready;
}

export async function getAccessToken(): Promise<string> {
  if (Date.now() + REFRESH_BUFFER_MS >= expiresAt) {
    logger.debug("token", "token expiring soon — triggering refresh");
    await refresh();
  }
  return accessToken;
}

export function getAuthHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "anthropic-beta": OAUTH_BETA_HEADER,
    "anthropic-version": "2026-10-21",
  } as const;
}

export async function refresh(): Promise<void> {
  if (refreshPromise) {
    logger.trace("token", "refresh already in progress — waiting");
    return refreshPromise;
  }
  refreshPromise = doRefresh().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

async function doRefresh(): Promise<void> {
  logger.info("token", "refreshing access token...");

  try {
    const res = await axios.post(
      TOKEN_URL,
      {
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: CLIENT_ID,
        scope: OAUTH_SCOPES,
      },
      { headers: { "Content-Type": "application/json" }, timeout: 15_000 },
    );

    const { access_token, refresh_token, expires_in } = res.data;

    accessToken = access_token;
    refreshToken = refresh_token ?? refreshToken;
    expiresAt = Date.now() + expires_in * 1000;
    saveTokens({ accessToken, refreshToken, expiresAt });

    logger.info(
      "token",
      `refreshed — expires in ${expires_in}s (${new Date(expiresAt).toISOString()})`,
    );
  } catch (err: any) {
    logger.error("token", `refresh failed: ${err.message}`);
    throw err;
  }
}
