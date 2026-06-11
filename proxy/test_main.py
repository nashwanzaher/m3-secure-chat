"""
pytest tests for the M3 Secure Proxy.

These tests do NOT call the real M3 API. They monkey-patch the upstream
`httpx.AsyncClient` so the proxy can be exercised end-to-end against a
fake server. Run with:

    cd proxy
    pip install -r requirements.txt
    pip install pytest pytest-asyncio
    M3_API_KEY=sk-test pytest -v
"""

from __future__ import annotations

import os
import sys
from typing import Any, Dict, List

import pytest
from fastapi.testclient import TestClient

# Make `main` importable when running `pytest` from the proxy/ directory.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# --- Environment must be set BEFORE importing the app ------------------------

os.environ.setdefault("M3_API_KEY", "sk-test-master")
os.environ.setdefault("M3_BASE_URL", "https://upstream.test")
os.environ.setdefault("ALLOWED_ORIGINS", "https://app.test,http://localhost:5173")
os.environ.setdefault("RATE_LIMIT_PER_MIN", "3")  # small so we can test throttling
os.environ.setdefault("M3_TIMEOUT_SECONDS", "5")

import main as proxy  # noqa: E402


# --- Fixtures ----------------------------------------------------------------


class FakeResponse:
    def __init__(self, status_code: int, payload: Dict[str, Any]):
        self.status_code = status_code
        self._payload = payload

    def json(self) -> Dict[str, Any]:
        return self._payload


class FakeAsyncClient:
    """Replaces httpx.AsyncClient so we never hit the network."""

    def __init__(self, *args, **kwargs):
        self.kwargs = kwargs

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def post(self, url: str, json: Dict[str, Any], headers: Dict[str, str]):
        # Echo a valid M3-shaped payload. Tests can monkey-patch the
        # module-level `_upstream` to control the response.
        return proxy._upstream(url, json, headers)


@pytest.fixture(autouse=True)
def _patch_httpx(monkeypatch):
    monkeypatch.setattr(proxy.httpx, "AsyncClient", FakeAsyncClient)


@pytest.fixture
def client() -> TestClient:
    return TestClient(proxy.app)


# --- Helpers -----------------------------------------------------------------


def ok_payload(content: str = "hello", prompt_tokens: int = 5, completion_tokens: int = 7) -> Dict[str, Any]:
    return {
        "id": "m3-fake",
        "model": "MiniMax-M3",
        "choices": [{"index": 0, "message": {"role": "assistant", "content": content}, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": prompt_tokens, "completion_tokens": completion_tokens, "total_tokens": prompt_tokens + completion_tokens},
    }


def make_upstream(status_code: int = 200, payload: Dict[str, Any] | None = None):
    """Return a function that the FakeAsyncClient will call."""

    def _upstream(url: str, json: Dict[str, Any], headers: Dict[str, str]):
        proxy._last_upstream_url = url
        proxy._last_upstream_headers = headers
        proxy._last_upstream_body = json
        return FakeResponse(status_code, payload if payload is not None else ok_payload())

    return _upstream


# --- Tests -------------------------------------------------------------------


def test_health_reports_master_key_presence(client: TestClient):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["has_master_key"] is True
    assert body["upstream"] == "https://upstream.test"
    assert body["rate_limit_per_min"] == 3


def test_chat_happy_path(client: TestClient):
    proxy._upstream = make_upstream()
    r = client.post(
        "/v1/chat",
        json={"model": "MiniMax-M3", "messages": [{"role": "user", "content": "hi"}]},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["choices"][0]["message"]["content"] == "hello"
    assert body["usage"]["total_tokens"] == 12


def test_chat_uses_user_key_header_when_provided(client: TestClient):
    proxy._upstream = make_upstream()
    r = client.post(
        "/v1/chat",
        headers={"X-User-Api-Key": "sk-user-override"},
        json={"model": "MiniMax-M3", "messages": [{"role": "user", "content": "hi"}]},
    )
    assert r.status_code == 200
    sent = proxy._last_upstream_headers["Authorization"]
    assert sent == "Bearer sk-user-override", "Per-user key should be forwarded verbatim"


def test_chat_falls_back_to_master_key_without_user_key(client: TestClient):
    proxy._upstream = make_upstream()
    r = client.post(
        "/v1/chat",
        json={"model": "MiniMax-M3", "messages": [{"role": "user", "content": "hi"}]},
    )
    assert r.status_code == 200
    assert proxy._last_upstream_headers["Authorization"] == "Bearer sk-test-master"


def test_chat_validates_message_role(client: TestClient):
    r = client.post(
        "/v1/chat",
        json={"model": "MiniMax-M3", "messages": [{"role": "hacker", "content": "x"}]},
    )
    assert r.status_code == 422


def test_chat_validates_temperature_range(client: TestClient):
    r = client.post(
        "/v1/chat",
        json={"model": "MiniMax-M3", "messages": [{"role": "user", "content": "x"}], "temperature": 5.0},
    )
    assert r.status_code == 422


def test_chat_rate_limits(client: TestClient):
    proxy._upstream = make_upstream()
    payload = {"model": "MiniMax-M3", "messages": [{"role": "user", "content": "x"}]}

    # 3 requests allowed by RATE_LIMIT_PER_MIN, the 4th is throttled.
    for _ in range(3):
        assert client.post("/v1/chat", json=payload).status_code == 200

    r = client.post("/v1/chat", json=payload)
    assert r.status_code == 429
    assert "Rate limit" in r.json()["detail"]


def test_chat_returns_503_when_master_key_missing(client: TestClient, monkeypatch):
    monkeypatch.setattr(proxy, "M3_API_KEY", "", raising=False)
    r = client.post(
        "/v1/chat",
        json={"model": "MiniMax-M3", "messages": [{"role": "user", "content": "x"}]},
    )
    assert r.status_code == 503


def test_chat_propagates_upstream_4xx(client: TestClient):
    proxy._upstream = make_upstream(status_code=401, payload={"detail": "invalid key"})
    r = client.post(
        "/v1/chat",
        json={"model": "MiniMax-M3", "messages": [{"role": "user", "content": "x"}]},
    )
    # The proxy surfaces upstream status unchanged
    assert r.status_code == 401
    assert r.json()["detail"] == "invalid key"


def test_cors_allows_configured_origin(client: TestClient):
    proxy._upstream = make_upstream()
    r = client.post(
        "/v1/chat",
        headers={"Origin": "https://app.test"},
        json={"model": "MiniMax-M3", "messages": [{"role": "user", "content": "x"}]},
    )
    assert r.status_code == 200
    assert r.headers.get("access-control-allow-origin") == "https://app.test"


def test_cors_blocks_unknown_origin(client: TestClient):
    proxy._upstream = make_upstream()
    r = client.post(
        "/v1/chat",
        headers={"Origin": "https://evil.test"},
        json={"model": "MiniMax-M3", "messages": [{"role": "user", "content": "x"}]},
    )
    # 200 from the proxy logic, but the CORS header must NOT echo the bad origin
    assert r.status_code == 200
    assert r.headers.get("access-control-allow-origin") != "https://evil.test"
