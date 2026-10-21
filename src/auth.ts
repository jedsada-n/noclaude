import { createHash, randomBytes } from "crypto";
import axios from "axios";
import {
  TOKEN_URL,
  CLIENT_ID,
  MANUAL_REDIRECT_URL,
  AUTHORIZE_URL,
  OAUTH_SCOPES,
} from "./config.js";
import { logger } from "./logger.js";

function base64URLEncode(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

let pendingLogin: { codeVerifier: string; state: string } | null = null;

export function startLogin(): { url: string } {
  const codeVerifier = base64URLEncode(randomBytes(32));
  const codeChallenge = base64URLEncode(
    createHash("sha256").update(codeVerifier).digest(),
  );
  const state = base64URLEncode(randomBytes(32));

  pendingLogin = { codeVerifier, state };

  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("code", "true");
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", MANUAL_REDIRECT_URL);
  url.searchParams.set("scope", OAUTH_SCOPES);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);

  logger.debug("auth", "PKCE challenge generated");
  logger.trace("auth", `authorize URL: ${url.toString()}`);

  return { url: url.toString() };
}

export async function completeLogin(
  raw: string,
): Promise<{ accessToken: string; refreshToken: string; expiresAt: number }> {
  if (!pendingLogin) {
    logger.warn("auth", "completeLogin called with no pending login");
    throw new Error("no pending login — call GET /login first");
  }

  const { codeVerifier, state } = pendingLogin;

  const [authorizationCode, returnedState] = raw.split("#");
  if (!authorizationCode) {
    logger.error("auth", "invalid code format received");
    throw new Error("invalid code format — expected 'code#state'");
  }
  if (returnedState && returnedState !== state) {
    logger.error("auth", "OAuth state mismatch");
    throw new Error("state mismatch");
  }

  logger.debug("auth", "exchanging authorization code for tokens");

  const res = await axios.post(
    TOKEN_URL,
    {
      grant_type: "authorization_code",
      code: authorizationCode,
      redirect_uri: MANUAL_REDIRECT_URL,
      client_id: CLIENT_ID,
      code_verifier: codeVerifier,
      state,
    },
    { headers: { "Content-Type": "application/json" }, timeout: 15_000 },
  );

  const { access_token, refresh_token, expires_in } = res.data;

  pendingLogin = null;

  logger.info("auth", `token exchange successful — expires in ${expires_in}s`);

  return {
    accessToken: access_token,
    refreshToken: refresh_token,
    expiresAt: Date.now() + expires_in * 1000,
  };
}
