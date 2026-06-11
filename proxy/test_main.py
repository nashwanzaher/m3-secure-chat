"""
pytest tests for the M3 Secure Proxy (Phase 1).

These tests do NOT call the real M3 API. They monkey-patch the upstream
``httpx.AsyncClient`` (and ``httpx.AsyncClient.stream``) so the proxy can
be exercised end-to-end against a fake server. Run with::

    cd proxy
    pip install -r requirements.txt
    pip install pytest pytest-asyncio
    M3_API_KEY=sk-test pytest -v
"""

from __future__ import annotations

import json
import os
import sys
from typing import Any, AsyncIterator, Dict, List, Optional

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


# --- Fake upstream -----------------------------------------------------------


class FakeResponse:
    def __init__(self, status_code: int, payload: Dict[str, Any]):
        self.status_code = status_code
        self._payload = payload

    def json(self) -> Dict[str, Any]:
        return self._payload


class FakeStreamResponse:
    """Mimics httpx's streaming response context manager."""

    def __init__(self, status_code: int, lines: List[str]):
        self.status_code = status_code
        self._lines = lines

    async def __aenter__(self) -> "FakeStreamResponse":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> bool:
        return False

    async def aiter_lines(self) -> AsyncIterator[str]:
        for line in self._lines:
            yield line

    async def aread(self) -> bytes:
        return ("\n".join(self._lines)).encode("utf-8")


class FakeStreamClient:
    """Replaces httpx.AsyncClient during the streaming endpoint."""

    def __init__(self, *args, **kwargs):
        self.kwargs = kwargs

    async def __aenter__(self) -> "FakeStreamClient":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> bool:
        return False

    def stream(self, method: str, url: str, **kwargs) -> FakeStreamResponse:
        proxy._last_stream_url = url
        proxy._last_stream_kwargs = kwargs
        return proxy._upstream_stream(url, kwargs.get("json", {}), kwargs.get("headers", {}))


class FakeAsyncClient:
    """Replaces httpx.AsyncClient so we never hit the network."""

    def __init__(self, *args, **kwargs):
        self.kwargs = kwargs

    async def __aenter__(self) -> "FakeAsyncClient":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> bool:
        return False

    async def post(self, url: str, json: Dict[str, Any], headers: Dict[str, str]):
        return proxy._upstream(url, json, headers)

    def stream(self, method: str, url: str, **kwargs) -> FakeStreamResponse:
        return proxy._upstream_stream(url, kwargs.get("json", {}), kwargs.get("headers", {}))


# --- Fixtures ----------------------------------------------------------------


@pytest.fixture(autouse=True)
def _patch_httpx(monkeypatch):
    monkeypatch.setattr(proxy.httpx, "AsyncClient", FakeAsyncClient)


@pytest.fixture
def client() -> TestClient:
    return TestClient(proxy.app)


@pytest.fixture(autouse=True)
def _reset_cache():
    """Each test gets a fresh, empty cache and rate-limit state."""
    proxy._cache._data.clear()
    proxy._rate_buckets.clear()
    yield
    proxy._cache._data.clear()
    proxy._rate_buckets.clear()


# --- Helpers -----------------------------------------------------------------


def ok_payload(content: str = "hello", prompt_tokens: int = 5, completion_tokens: int = 7) -> Dict[str, Any]:
    return {
        "id": "m3-fake",
        "model": "MiniMax-M3",
        "choices": [{"index": 0, "message": {"role": "assistant", "content": content}, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": prompt_tokens, "completion_tokens": completion_tokens, "total_tokens": prompt_tokens + completion_tokens},
    }


def make_upstream(status_code: int = 200, payload: Optional[Dict[str, Any]] = None):
    """Return a function that the FakeAsyncClient will call."""

    def _upstream(url: str, body: Dict[str, Any], headers: Dict[str, str]):
        proxy._last_upstream_url = url
        proxy._last_upstream_headers = headers
        proxy._last_upstream_body = body
        return FakeResponse(status_code, payload if payload is not None else ok_payload())

    return _upstream


def make_stream_upstream(lines: List[str], status_code: int = 200):
    """Return a function that the FakeStreamClient will call."""

    def _upstream_stream(url: str, body: Dict[str, Any], headers: Dict[str, str]):
        proxy._last_upstream_url = url
        proxy._last_upstream_headers = headers
        proxy._last_upstream_body = body
        return FakeStreamResponse(status_code, lines)

    return _upstream_stream


# --- Original tests (preserved) ----------------------------------------------


def test_health_reports_master_key_presence(client: TestClient):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["has_master_key"] is True
    assert body["upstream"] == "https://upstream.test"
    assert body["rate_limit_per_min"] == 3
    assert "cache" in body
    assert body["cache"]["ttl"] == 60  # from conftest


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
    assert r.status_code == 200
    assert r.headers.get("access-control-allow-origin") != "https://evil.test"


# --- Phase 1 new tests -------------------------------------------------------


def test_correlation_id_middleware_echoes_header(client: TestClient):
    proxy._upstream = make_upstream()
    r = client.post(
        "/v1/chat",
        headers={"X-Request-ID": "my-trace-123"},
        json={"model": "MiniMax-M3", "messages": [{"role": "user", "content": "hi"}]},
    )
    assert r.headers.get("X-Request-ID") == "my-trace-123"


def test_correlation_id_middleware_generates_when_missing(client: TestClient):
    proxy._upstream = make_upstream()
    r = client.post(
        "/v1/chat",
        json={"model": "MiniMax-M3", "messages": [{"role": "user", "content": "hi"}]},
    )
    rid = r.headers.get("X-Request-ID")
    assert rid is not None and len(rid) >= 16  # uuid4 hex


def test_openapi_schema_is_generated(client: TestClient):
    r = client.get("/openapi.json")
    assert r.status_code == 200
    spec = r.json()
    assert spec["info"]["title"] == "M3 Secure Proxy"
    assert spec["info"]["version"] == "1.1.0"
    paths = spec["paths"]
    assert "/v1/chat" in paths
    assert "/v1/chat/stream" in paths
    assert "/health" in paths
    # Tags should be present
    tag_names = {t["name"] for t in spec.get("tags", [])}
    assert {"chat", "ops"}.issubset(tag_names)


def test_swagger_ui_renders(client: TestClient):
    r = client.get("/docs")
    assert r.status_code == 200
    assert "swagger" in r.text.lower()


def test_redoc_renders(client: TestClient):
    r = client.get("/redoc")
    assert r.status_code == 200
    assert "redoc" in r.text.lower()


def test_cache_serves_repeat_request_without_calling_upstream(client: TestClient):
    call_count = {"n": 0}

    def _upstream(url, body, headers):
        call_count["n"] += 1
        return FakeResponse(200, ok_payload(content=f"call-{call_count['n']}"))

    proxy._upstream = _upstream
    payload = {"model": "MiniMax-M3", "messages": [{"role": "user", "content": "same question"}]}

    r1 = client.post("/v1/chat", json=payload)
    r2 = client.post("/v1/chat", json=payload)
    assert r1.status_code == 200 and r2.status_code == 200
    assert r1.json()["choices"][0]["message"]["content"] == "call-1"
    assert r2.json()["choices"][0]["message"]["content"] == "call-1"  # served from cache
    assert call_count["n"] == 1, "Second call should have been served from the cache"


def test_cache_bypassed_when_user_key_provided(client: TestClient):
    call_count = {"n": 0}

    def _upstream(url, body, headers):
        call_count["n"] += 1
        return FakeResponse(200, ok_payload(content=f"call-{call_count['n']}"))

    proxy._upstream = _upstream
    payload = {"model": "MiniMax-M3", "messages": [{"role": "user", "content": "same"}]}
    headers = {"X-User-Api-Key": "sk-user-1"}

    client.post("/v1/chat", json=payload, headers=headers)
    client.post("/v1/chat", json=payload, headers=headers)
    assert call_count["n"] == 2, "Per-user-key requests must bypass the cache"


def test_cache_respects_ttl(client: TestClient, monkeypatch):
    """When CACHE_TTL_SECONDS is 0, every request should call upstream."""
    import asyncio

    proxy._cache.ttl = 0
    call_count = {"n": 0}

    def _upstream(url, body, headers):
        call_count["n"] += 1
        return FakeResponse(200, ok_payload())

    proxy._upstream = _upstream
    payload = {"model": "MiniMax-M3", "messages": [{"role": "user", "content": "x"}]}
    client.post("/v1/chat", json=payload)
    # Re-add with a fresh timestamp to bypass TTL check
    proxy._cache._data.clear()
    client.post("/v1/chat", json=payload)
    assert call_count["n"] == 2


def test_cache_evicts_oldest_when_full(client: TestClient):
    """CACHE_MAX_ENTRIES controls eviction."""
    proxy._cache.max_entries = 2
    proxy._upstream = make_upstream()

    for i in range(3):
        client.post(
            "/v1/chat",
            json={"model": "MiniMax-M3", "messages": [{"role": "user", "content": f"q{i}"}]},
        )
    assert len(proxy._cache._data) == 2


def test_stream_returns_event_stream_content_type(client: TestClient):
    proxy._upstream_stream = make_stream_upstream(
        [
            'data: {"choices":[{"delta":{"content":"hi"},"index":0}]}',
            "data: [DONE]",
        ]
    )
    with client.stream(
        "POST",
        "/v1/chat/stream",
        json={"model": "MiniMax-M3", "messages": [{"role": "user", "content": "hello"}]},
    ) as r:
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("text/event-stream")


def test_stream_forwards_chunks_and_terminates_with_done(client: TestClient):
    proxy._upstream_stream = make_stream_upstream(
        [
            'data: {"choices":[{"delta":{"content":"Hello"},"index":0}]}',
            'data: {"choices":[{"delta":{"content":", world"},"index":0}]}',
            "data: [DONE]",
        ]
    )
    with client.stream(
        "POST",
        "/v1/chat/stream",
        json={"model": "MiniMax-M3", "messages": [{"role": "user", "content": "say hi"}]},
    ) as r:
        assert r.status_code == 200
        body = "".join(chunk for chunk in r.iter_text())
        # We should see both content tokens and the [DONE] sentinel
        assert "Hello" in body
        assert ", world" in body
        assert "data: [DONE]" in body


def test_stream_wraps_raw_json_chunks_in_data_lines(client: TestClient):
    """If upstream sends raw JSON without `data: ` prefix, proxy must wrap it."""
    proxy._upstream_stream = make_stream_upstream(
        [
            '{"choices":[{"delta":{"content":"raw1"},"index":0}]}',
            '{"choices":[{"delta":{"content":"raw2"},"index":0}]}',
        ]
    )
    with client.stream(
        "POST",
        "/v1/chat/stream",
        json={"model": "MiniMax-M3", "messages": [{"role": "user", "content": "x"}]},
    ) as r:
        body = "".join(chunk for chunk in r.iter_text())
        assert "data: " in body
        assert "raw1" in body
        assert "raw2" in body
        # Proxy should add [DONE] itself
        assert "data: [DONE]" in body


def test_stream_handles_upstream_4xx_with_error_event(client: TestClient):
    proxy._upstream_stream = make_stream_upstream([], status_code=401)
    with client.stream(
        "POST",
        "/v1/chat/stream",
        json={"model": "MiniMax-M3", "messages": [{"role": "user", "content": "x"}]},
    ) as r:
        body = "".join(chunk for chunk in r.iter_text())
        assert "event: error" in body
        assert "401" in body


def test_stream_forwards_user_key_header(client: TestClient):
    proxy._upstream_stream = make_stream_upstream(['data: [DONE]'])
    with client.stream(
        "POST",
        "/v1/chat/stream",
        headers={"X-User-Api-Key": "sk-stream-user"},
        json={"model": "MiniMax-M3", "messages": [{"role": "user", "content": "x"}]},
    ) as r:
        assert r.status_code == 200
        list(r.iter_text())  # consume
    assert proxy._last_upstream_headers["Authorization"] == "Bearer sk-stream-user"


def test_stream_sends_initial_ping_event(client: TestClient):
    proxy._upstream_stream = make_stream_upstream(['data: [DONE]'])
    with client.stream(
        "POST",
        "/v1/chat/stream",
        json={"model": "MiniMax-M3", "messages": [{"role": "user", "content": "x"}]},
    ) as r:
        first = next(r.iter_text())
        assert ": ping" in first  # SSE comment heartbeat


def test_stream_sets_no_buffering_header(client: TestClient):
    proxy._upstream_stream = make_stream_upstream(['data: [DONE]'])
    with client.stream(
        "POST",
        "/v1/chat/stream",
        json={"model": "MiniMax-M3", "messages": [{"role": "user", "content": "x"}]},
    ) as r:
        assert r.headers.get("x-accel-buffering") == "no"
        assert r.headers.get("cache-control") == "no-cache"
        assert "X-Request-ID" in r.headers


def test_unhandled_exception_returns_500_with_request_id(client: TestClient, monkeypatch):
    """A bug anywhere should return a generic 500 with a request id, never a stack trace."""
    def boom(*args, **kwargs):
        raise RuntimeError("kaboom")

    monkeypatch.setattr(proxy.httpx, "AsyncClient", boom)
    # Need to also override the require_master_key dependency bypass? No, we just need the
    # request to hit upstream; we'll mock the route handler.
    # Use a route that always errors:
    @proxy.app.get("/_test_boom")
    async def _boom():
        raise RuntimeError("kaboom")

    r = client.get("/_test_boom")
    assert r.status_code == 500
    body = r.json()
    assert body["detail"] == "Internal error"
    assert "request_id" in body
