# noclaude

A small Express proxy that logs in to Claude over OAuth, keeps the token
refreshed, and forwards requests to the Anthropic API. It exposes both the
native `/v1/messages` endpoint and an OpenAI-compatible `/v1/chat/completions`
endpoint, authenticated with your own `NO_CLAUDE_KEY`.

## Configuration

Copy `.env.example` to `.env` and set:

- `NO_CLAUDE_KEY` — the secret clients must send (`Authorization: Bearer <key>` or `x-api-key`).
- `PORT` — port to listen on (default `3000`). On non-rooted Android use a high port, not `80`.
- `TOKEN_STORE_PATH` — optional; where to persist the OAuth token (default `./data/tokens.json`).

## Run

```bash
npm install
npm start
```

Then authenticate once via `GET /login` → open the returned URL → `POST /login/callback`
with `{ "code": "CODE#STATE" }`. The token is saved and auto-refreshed, so you
only do this once.

## Run on Termux (Android)

You can run noclaude on an Android phone through [Termux](https://termux.dev)
with no code changes — the TypeScript runs on Termux's Node.js build via `tsx`.

```bash
pkg install nodejs git curl -y
git clone <your-repo-url> && cd noclaude
npm install
cp .env.example .env     # then edit NO_CLAUDE_KEY and PORT
npm run serve
```

`npm run serve` (`scripts/start.sh`) handles the whole flow:

- **First run:** it starts the server, prints the authorize URL, waits for you
  to paste the `CODE#STATE` code, then saves the token.
- **Later runs:** it finds the saved token and skips login — the server just starts.
- **Re-login** (if the refresh token is revoked): `bash scripts/start.sh relogin`.

It also acquires a `termux-wake-lock` while running so Android won't suspend the
process, and releases it on exit. Reach the proxy from other devices at
`http://<phone-ip>:<PORT>`.

To keep it alive across reboots / backgrounding, install `termux-services`
(`pkg install termux-services`) and register `npm run serve` as a service.
