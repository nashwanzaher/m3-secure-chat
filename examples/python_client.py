"""
examples/python_client.py
A minimal Python client for the M3 Secure Chat proxy.

Run:
    pip install httpx
    PROXY=https://m3-proxy.example.com python python_client.py
"""

from __future__ import annotations

import os
import sys
from typing import Iterable

import httpx

PROXY = os.environ.get("PROXY", "http://localhost:8000")
USER_KEY = os.environ.get("PER_USER_KEY")  # optional, sent as X-User-Api-Key


def chat(messages: Iterable[dict], **kwargs) -> dict:
    url = f"{PROXY.rstrip('/')}/v1/chat"
    headers = {"Content-Type": "application/json"}
    if USER_KEY:
        headers["X-User-Api-Key"] = USER_KEY

    body = {"model": "MiniMax-M3", "messages": list(messages), **kwargs}

    with httpx.Client(timeout=30) as client:
        r = client.post(url, json=body, headers=headers)
        r.raise_for_status()
        return r.json()


def main() -> int:
    messages = [
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Say hello in three languages."},
    ]
    try:
        data = chat(messages, temperature=0.4, max_tokens=120)
    except httpx.HTTPError as e:
        print(f"Request failed: {e}", file=sys.stderr)
        return 1

    choice = data["choices"][0]
    usage = data.get("usage", {})
    print("--- assistant ---")
    print(choice["message"]["content"])
    print("--- usage ---")
    print(f"prompt={usage.get('prompt_tokens')} completion={usage.get('completion_tokens')} total={usage.get('total_tokens')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
