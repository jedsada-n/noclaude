import type { Request, Response } from "express";
import axios from "axios";
import { API_BASE_URL, BILLING_HEADER } from "./config.js";
import {
  isReady,
  getAccessToken,
  getAuthHeaders,
  refresh,
} from "./tokenManager.js";
import { logger } from "./logger.js";

const MESSAGES_URL = `${API_BASE_URL}/v1/messages`;
const CHAT_URL = `${API_BASE_URL}/v1/chat/completions`;

export async function proxyMessages(req: Request, res: Response) {
  if (!isReady()) {
    logger.warn("proxy", "request rejected — not authenticated");
    res.status(503).json({ error: "not authenticated — visit GET /login first" });
    return;
  }

  logger.debug("proxy", `forwarding request (stream=${Boolean(req.body?.stream)})`, req.headers);
  const token = await getAccessToken();
  const result = await forward(req, token);

  if (result.retryAuth) {
    logger.info("proxy", "401 from upstream — refreshing token and retrying");
    await refresh();
    const freshToken = await getAccessToken();
    sendResponse(res, await forward(req, freshToken));
    return;
  }

  sendResponse(res, result);
}

interface ForwardResult {
  retryAuth: boolean;
  status: number;
  data: any;
  stream?: NodeJS.ReadableStream;
  isStream: boolean;
}

function ensureBillingSystemOpenAI(body: any): void {
  if (!Array.isArray(body.messages)) return;
  const alreadyPresent = body.messages.some(
    (m: any) =>
      m.role === "system" &&
      typeof m.content === "string" &&
      m.content.includes("x-anthropic-billing-header"),
  );
  if (!alreadyPresent) {
    body.messages.unshift({ role: "system", content: BILLING_HEADER });
  }
}

function ensureBillingSystem(body: any): void {
  const billingItem = { type: "text", text: BILLING_HEADER };

  if (!body.system) {
    body.system = [billingItem];
    return;
  }

  if (typeof body.system === "string") {
    body.system = [
      billingItem,
      { type: "text", text: body.system },
    ];
    return;
  }

  if (Array.isArray(body.system)) {
    const hasBilling = body.system.some(
      (item: any) =>
        item.type === "text" &&
        typeof item.text === "string" &&
        item.text.includes("x-anthropic-billing-header"),
    );
    if (!hasBilling) {
      body.system.unshift(billingItem);
    }
  }
}

async function forward(req: Request, token: string): Promise<ForwardResult> {
  ensureBillingSystem(req.body);

  const headers: Record<string, string> = {
    ...getAuthHeaders(token),
    "content-type": req.headers["content-type"] ?? "application/json",
  };
  if (req.headers["anthropic-version"]) {
    headers["anthropic-version"] = req.headers["anthropic-version"] as string;
  }

  const isStream = Boolean(req.body?.stream);
  logger.trace("proxy", `POST ${MESSAGES_URL}`, { model: req.body?.model, stream: isStream });

  try {
    const upstream = await axios.post(MESSAGES_URL, req.body, {
      headers,
      timeout: 300_000,
      responseType: isStream ? "stream" : "json",
    });

    logger.debug("proxy", `upstream responded ${upstream.status}`);

    return {
      retryAuth: false,
      status: upstream.status,
      data: upstream.data,
      stream: isStream ? upstream.data : undefined,
      isStream,
    };
  } catch (err: any) {
    if (err.response?.status === 401) {
      logger.debug("proxy", "upstream returned 401");
      return { retryAuth: true, status: 401, data: null, isStream: false };
    }
    const status = err.response?.status ?? 502;
    logger.error("proxy", `upstream error ${status}`);
    return {
      retryAuth: false,
      status,
      data: err.response?.data ?? { error: "upstream request failed" },
      isStream: false,
    };
  }
}

async function forwardToUrl(url: string, req: Request, token: string): Promise<ForwardResult> {
  const isStream = Boolean(req.body?.stream);

  const headers: Record<string, string> = {
    ...getAuthHeaders(token),
    "content-type": req.headers["content-type"] ?? "application/json",
  };

  logger.trace("proxy", `POST ${url}`, { model: req.body?.model, stream: isStream });

  try {
    const upstream = await axios.post(url, req.body, {
      headers,
      timeout: 300_000,
      responseType: isStream ? "stream" : "json",
    });

    logger.debug("proxy", `upstream responded ${upstream.status}`);

    return {
      retryAuth: false,
      status: upstream.status,
      data: upstream.data,
      stream: isStream ? upstream.data : undefined,
      isStream,
    };
  } catch (err: any) {
    if (err.response?.status === 401) {
      logger.debug("proxy", "upstream returned 401");
      return { retryAuth: true, status: 401, data: null, isStream: false };
    }
    const status = err.response?.status ?? 502;
    logger.error("proxy", `upstream error ${status}`);
    return {
      retryAuth: false,
      status,
      data: err.response?.data ?? { error: "upstream request failed" },
      isStream: false,
    };
  }
}

export async function proxyOpenAIChat(req: Request, res: Response) {
  if (!isReady()) {
    logger.warn("proxy", "request rejected — not authenticated");
    res.status(503).json({ error: "not authenticated — visit GET /login first" });
    return;
  }

  logger.debug("proxy", `forwarding openai chat request (stream=${Boolean(req.body?.stream)})`);
  ensureBillingSystemOpenAI(req.body);

  const token = await getAccessToken();
  const result = await forwardToUrl(CHAT_URL, req, token);

  if (result.retryAuth) {
    logger.info("proxy", "401 from upstream — refreshing token and retrying");
    await refresh();
    const freshToken = await getAccessToken();
    sendResponse(res, await forwardToUrl(CHAT_URL, req, freshToken));
    return;
  }

  sendResponse(res, result);
}

function sendResponse(res: Response, result: ForwardResult) {
  if (result.isStream && result.stream) {
    logger.debug("proxy", "streaming response to client");
    res.setHeader("content-type", "text/event-stream");
    res.setHeader("cache-control", "no-cache");
    res.setHeader("connection", "keep-alive");
    result.stream.pipe(res);
  } else {
    logger.debug("proxy", `responding ${result.status}`);
    res.status(result.status).json(result.data);
  }
}
