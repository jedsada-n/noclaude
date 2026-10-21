import { createInterface } from "readline/promises";
import { stdin, stdout } from "process";
import dotenv from "dotenv";
import { startLogin, completeLogin } from "./auth.js";
import { loadTokens, saveTokens } from "./tokenStore.js";
import { logger } from "./logger.js";

dotenv.config();

const forceLogin = process.argv.includes("--force") || process.env.FORCE_LOGIN === "1";

async function ensureAuth(): Promise<void> {
  if (!process.env.NO_CLAUDE_KEY) {
    logger.error("config", "NO_CLAUDE_KEY is required in .env");
    process.exit(1);
  }

  const existing = loadTokens();
  if (existing && !forceLogin) {
    logger.info("auth", "saved credentials found — skipping login");
    return;
  }
  if (existing && forceLogin) {
    logger.info("auth", "--force set — ignoring saved credentials and re-authenticating");
  }

  const { url } = startLogin();

  stdout.write(
    [
      "",
      "No saved credentials. Complete the login to continue:",
      "",
      `  1. Open this URL in your browser and authorize:`,
      "",
      `     ${url}`,
      "",
      `  2. Copy the code shown after authorizing (format: code#state)`,
      `     and paste it below.`,
      "",
    ].join("\n") + "\n",
  );

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    for (;;) {
      const answer = (await rl.question("Paste auth code: ")).trim();
      if (!answer) {
        stdout.write("No input — try again (Ctrl+C to abort).\n");
        continue;
      }
      try {
        const tokens = await completeLogin(answer);
        saveTokens(tokens);
        logger.info(
          "auth",
          `logged in — token expires ${new Date(tokens.expiresAt).toISOString()}`,
        );
        return;
      } catch (err: any) {
        logger.error("auth", `login failed: ${err.message}`);
        stdout.write("That didn't work — paste the code again (Ctrl+C to abort).\n");
      }
    }
  } finally {
    rl.close();
  }
}

await ensureAuth();

// Boot the HTTP server. index.ts reloads tokens from disk on import,
// so the credentials we just saved are picked up automatically.
await import("./index.js");
