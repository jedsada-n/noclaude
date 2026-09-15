import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import { TOKEN_STORE_PATH } from "./config.js";
import { logger } from "./logger.js";

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export function loadTokens(): StoredTokens | null {
  try {
    const raw = readFileSync(TOKEN_STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (
      typeof parsed.accessToken !== "string" ||
      typeof parsed.refreshToken !== "string" ||
      typeof parsed.expiresAt !== "number"
    ) {
      logger.warn("tokenStore", "stored token file is malformed — ignoring");
      return null;
    }
    logger.debug("tokenStore", `loaded saved credentials from ${TOKEN_STORE_PATH}`);
    return parsed;
  } catch (err: any) {
    if (err.code !== "ENOENT") {
      logger.warn("tokenStore", `failed to read saved credentials: ${err.message}`);
    }
    return null;
  }
}

export function saveTokens(tokens: StoredTokens): void {
  try {
    mkdirSync(dirname(TOKEN_STORE_PATH), { recursive: true });
    writeFileSync(TOKEN_STORE_PATH, JSON.stringify(tokens, null, 2), {
      mode: 0o600,
    });
    logger.debug("tokenStore", `saved credentials to ${TOKEN_STORE_PATH}`);
  } catch (err: any) {
    logger.error("tokenStore", `failed to persist credentials: ${err.message}`);
  }
}
