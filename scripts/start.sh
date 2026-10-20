#!/usr/bin/env bash
# noclaude — Termux-friendly launcher.
# Boots the proxy, runs the one-time OAuth login only if there's no saved
# token, then stays in the foreground. Pass "relogin" to force login again
# (e.g. if the refresh token was revoked).
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required — run: pkg install curl" >&2
  exit 1
fi

# Read PORT and token path from .env; fallbacks match src/config.ts.
get_env() { grep -E "^$1=" .env 2>/dev/null | head -n1 | cut -d= -f2-; }
PORT="$(get_env PORT)";                PORT="${PORT:-3000}"
TOKENS="$(get_env TOKEN_STORE_PATH)";  TOKENS="${TOKENS:-./data/tokens.json}"
BASE="http://127.0.0.1:${PORT}"

FORCE_LOGIN=0
case "${1:-}" in relogin|--relogin) FORCE_LOGIN=1;; esac

# Keep the phone awake while the server runs (no-op when not on Termux).
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock || true

# Boot the server in the background.
npm start &
SERVER_PID=$!
cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
  command -v termux-wake-unlock >/dev/null 2>&1 && termux-wake-unlock || true
}
trap cleanup EXIT INT TERM

printf 'waiting for server on :%s ' "$PORT"
ok=0
for _ in $(seq 1 40); do
  if curl -fsS "$BASE/health" >/dev/null 2>&1; then ok=1; break; fi
  printf '.'; sleep 0.5
done
echo
if [ "$ok" != "1" ]; then
  echo "server did not come up — check the log above" >&2
  exit 1
fi

# Log in only when there's no saved token (or the user forced it).
if [ "$FORCE_LOGIN" = "1" ] || [ ! -f "$TOKENS" ]; then
  echo "running OAuth login..."
  URL="$(curl -fsS "$BASE/login" \
    | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>process.stdout.write(JSON.parse(d).url))')"
  echo
  echo "1) Open this URL in a browser and approve access:"
  echo
  echo "   $URL"
  echo
  printf "2) Paste the returned code (looks like CODE#STATE) and press Enter:\n> "
  read -r CODE
  BODY="$(CODE="$CODE" node -e 'process.stdout.write(JSON.stringify({code:process.env.CODE}))')"
  if curl -fsS -X POST "$BASE/login/callback" \
       -H 'content-type: application/json' --data "$BODY" >/dev/null; then
    echo "login ok — token saved to $TOKENS"
  else
    echo "login failed — try again with: bash scripts/start.sh relogin" >&2
    exit 1
  fi
else
  echo "saved credentials found ($TOKENS) — skipping login"
fi

echo
echo "noclaude is running on :$PORT  —  press Ctrl-C to stop"
wait "$SERVER_PID"
