#!/usr/bin/env bash
# examples/curl.sh
# Hit the proxy directly. Use this to verify the proxy from CI, a smoke
# test, or just to debug. The proxy URL is the only required argument.
#
# Usage:
#   PROXY=https://m3-proxy.example.com ./curl.sh
#   PER_USER_KEY=sk-user ./curl.sh
#
# Requires: bash, curl. M3_API_KEY is NEVER set here — that lives in the
# proxy's environment.

set -euo pipefail

PROXY="${PROXY:?Set PROXY=https://your-proxy.example.com}"
URL="${PROXY%/}/v1/chat"

HEADERS=(-H "Content-Type: application/json")
if [[ -n "${PER_USER_KEY:-}" ]]; then
  HEADERS+=(-H "X-User-Api-Key: ${PER_USER_KEY}")
fi

read -r -d '' BODY <<'JSON' || true
{
  "model": "MiniMax-M3",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user",   "content": "In one sentence, what is a proxy in networking?"}
  ],
  "temperature": 0.5,
  "max_tokens": 200
}
JSON

curl -sS -X POST "${HEADERS[@]}" --data "${BODY}" "${URL}" | jq .
