import "dotenv/config";
import { resolve } from "path";

export const TOKEN_URL = "https://platform.claude.com/v1/oauth/token";
export const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
export const API_BASE_URL = "https://api.anthropic.com";
export const MANUAL_REDIRECT_URL = "https://platform.claude.com/oauth/code/callback";
export const AUTHORIZE_URL = "https://claude.com/cai/oauth/authorize";
export const OAUTH_SCOPES = "user:inference";
export const OAUTH_BETA_HEADER = "oauth-2025-04-20";
export const REFRESH_BUFFER_MS = 5 * 60 * 1000;
export const BILLING_HEADER = "x-anthropic-billing-header: cc_version=2.1.300; cc_entrypoint=cli; cch=00000;";
export const TOKEN_STORE_PATH = resolve(
  process.env.TOKEN_STORE_PATH ?? "./data/tokens.json",
);
