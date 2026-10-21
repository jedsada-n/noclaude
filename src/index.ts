import express from "express";
import dotenv from "dotenv";
import { startLogin, completeLogin } from "./auth.js";
import { init, isReady } from "./tokenManager.js";
import { loadTokens } from "./tokenStore.js";
import { proxyMessages, proxyOpenAIChat } from "./proxy.js";
import { logger } from "./logger.js";

dotenv.config();

if (!process.env.NO_CLAUDE_KEY) {
  logger.error("config", "NO_CLAUDE_KEY is required in .env");
  process.exit(1);
}

logger.info("config", `log level: ${logger.level}`);

const app = express();

app.use((_req, res, next) => {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  res.setHeader(
    "access-control-allow-headers",
    "content-type, authorization, anthropic-version",
  );
  if (_req.method === "OPTIONS") {
    logger.trace("http", `OPTIONS ${_req.path}`);
    res.status(204).end();
    return;
  }
  next();
});

app.use((req, _res, next) => {
  logger.debug("http", `${req.method} ${req.path}`);
  next();
});

app.use(express.json({ limit: "10mb" }));

const proxyKey = process.env.NO_CLAUDE_KEY!;

const savedTokens = loadTokens();
if (savedTokens) {
  init(savedTokens, false);
  logger.info("auth", "restored saved credentials — skipping login");
} else {
  logger.info("auth", "no saved credentials found — visit GET /login to authenticate");
}

app.get("/login", (_req, res) => {
  logger.info("auth", "login flow started");
  res.json(startLogin());
});

app.post("/login/callback", async (req, res) => {
  try {
    logger.debug("auth", "processing login callback");
    const tokens = await completeLogin(req.body.code);
    init(tokens);
    logger.info(
      "auth",
      `logged in — token expires ${new Date(tokens.expiresAt).toISOString()}`,
    );
    res.json({ ok: true });
  } catch (err: any) {
    logger.error("auth", `login callback failed: ${err.message}`);
    res.status(400).json({ error: err.message });
  }
});

function requireProxyKey(req: express.Request, res: express.Response, next: express.NextFunction) {
  const bearer = req.headers.authorization;
  const apiKey = req.headers["x-api-key"] as string | undefined;
  if (bearer === `Bearer ${proxyKey}` || apiKey === proxyKey) {
    logger.debug("auth", "proxy key verified");
    next();
    return;
  }
  logger.warn("auth", "unauthorized request rejected");
  res.status(401).json({ error: "unauthorized" });
}

app.post("/v1/messages", requireProxyKey, proxyMessages);
app.post("/v1/chat/completions", requireProxyKey, proxyOpenAIChat);

app.get("/health", (_req, res) => {
  logger.trace("http", "health check");
  res.json({ ok: true });
});

const port = Number(process.env.PORT ?? 3000);

app.listen(port, () => {
  logger.info("server", `listening on :${port}`);
  if (!isReady()) {
    logger.info("server", "not authenticated — visit GET /login to authenticate");
  }
});
